/* ============================================================================
 * VoltDetective — Ampel-Assistent: Kamera, Alarm & Bedienung
 * ----------------------------------------------------------------------------
 * Holt Frames aus der Kamera (oder aus dem Demo-Generator), schneidet den
 * Suchbereich (ROI) aus, schickt ihn durch AmpelDetect und loest bei einem
 * bestaetigten Wechsel Ton / Vibration / Sprachansage aus.
 *
 * Alles laeuft ausschliesslich lokal im Browser — es wird kein Bild und kein
 * Ereignis an einen Server gesendet.
 * ==========================================================================*/
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const ANALYSIS_W = 128, ANALYSIS_H = 96;
  const STORE_KEY = 'eg_ampel_cfg_v1';

  /* ── Konfiguration (in localStorage gesichert) ───────────────────────── */
  const defaults = {
    sensitivity: 3,     // 1 = streng (wenig Fehlalarme) … 5 = empfindlich
    confirmFrames: 3,
    cooldownSec: 3,
    roi: { x: 0.25, y: 0.06, w: 0.50, h: 0.46 },
    alertAmber: true,
    requireRedFirst: true,
    sound: true,
    vibrate: true,
    speech: false,
    keepAwake: true,
    fps: 12,
  };
  let cfg = load();

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(defaults));
      const saved = JSON.parse(raw);
      return Object.assign(JSON.parse(JSON.stringify(defaults)), saved, {
        roi: Object.assign({}, defaults.roi, saved.roi || {}),
      });
    } catch (e) { return JSON.parse(JSON.stringify(defaults)); }
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(cfg)); } catch (e) {} }

  // Empfindlichkeitsstufe -> Schwellwerte der Engine.
  // Niedrige Stufe = hellere/sattere Pixel und groessere Blobs noetig.
  const SENS = {
    1: { minValue: 0.68, minSat: 0.52, minBlobPx: 16, minFill: 0.52, brightnessFactor: 1.30 },
    2: { minValue: 0.62, minSat: 0.46, minBlobPx: 12, minFill: 0.47, brightnessFactor: 1.22 },
    3: { minValue: 0.55, minSat: 0.40, minBlobPx: 8,  minFill: 0.42, brightnessFactor: 1.15 },
    4: { minValue: 0.48, minSat: 0.34, minBlobPx: 6,  minFill: 0.36, brightnessFactor: 1.08 },
    5: { minValue: 0.42, minSat: 0.28, minBlobPx: 4,  minFill: 0.30, brightnessFactor: 1.02 },
  };

  /* ── Laufzeit-Zustand ────────────────────────────────────────────────── */
  let stream = null, running = false, demo = false;
  let rafId = null, lastTick = 0, frameTimes = [];
  let wakeLock = null, audioCtx = null;
  let state = new AmpelDetect.AmpelState(smOpts());
  const log = [];

  const video   = $('cam');
  const overlay = $('overlay');
  const octx    = overlay.getContext('2d');
  const work    = document.createElement('canvas');
  work.width = ANALYSIS_W; work.height = ANALYSIS_H;
  const wctx = work.getContext('2d', { willReadFrequently: true });
  // Die Demo-Ampel wird in eine echte, sichtbare Leinwand gezeichnet — nur so
  // stimmen die Overlay-Koordinaten in beiden Betriebsarten ueberein.
  const demoCv = $('demo-view');
  const dctx = demoCv.getContext('2d');

  function smOpts() {
    return {
      confirmFrames: cfg.confirmFrames,
      cooldownMs: cfg.cooldownSec * 1000,
      alertAmber: cfg.alertAmber,
      requireRedFirst: cfg.requireRedFirst,
    };
  }

  /* ── Alarm: Ton, Vibration, Sprache ──────────────────────────────────── */
  function ensureAudio() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  // Kurzer Sinuston mit weicher Huellkurve (harte Kanten knacken sonst).
  function beep(freq, startAt, durMs, gainPeak) {
    const ac = ensureAudio(); if (!ac) return;
    const t0 = ac.currentTime + startAt / 1000;
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = 'sine'; osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gainPeak, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
    osc.connect(g); g.connect(ac.destination);
    osc.start(t0); osc.stop(t0 + durMs / 1000 + 0.02);
  }

  function alarm(type) {
    if (cfg.sound) {
      if (type === 'green') { beep(784, 0, 130, 0.25); beep(1046, 150, 130, 0.25); beep(1318, 300, 220, 0.28); }
      else                  { beep(520, 0, 160, 0.22); beep(520, 220, 160, 0.22); }
    }
    if (cfg.vibrate && navigator.vibrate) {
      navigator.vibrate(type === 'green' ? [140, 70, 140, 70, 260] : [90, 60, 90]);
    }
    if (cfg.speech && window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance(type === 'green' ? 'Grün' : 'Gelb');
      u.lang = 'de-DE'; u.rate = 1.1;
      window.speechSynthesis.speak(u);
    }
    addLog(type);
    flash(type);
  }

  function flash(type) {
    const el = $('flash');
    el.style.background = type === 'green' ? 'rgba(61,220,132,.35)' : 'rgba(245,166,35,.35)';
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 450);
  }

  /* ── Ereignis-Protokoll ──────────────────────────────────────────────── */
  function addLog(type) {
    log.unshift({ at: new Date(), type });
    if (log.length > 200) log.pop();
    renderLog();
  }

  function renderLog() {
    const box = $('log-body');
    if (!log.length) { box.innerHTML = '<tr><td colspan="2" class="board-empty">Noch keine Ereignisse.</td></tr>'; return; }
    box.innerHTML = log.slice(0, 25).map((e) =>
      `<tr><td>${e.at.toLocaleTimeString('de-DE')}</td><td>${e.type === 'green' ? '🟢 Grün' : '🟠 Gelb'}</td></tr>`
    ).join('');
  }

  function exportCsv() {
    if (!log.length) return;
    const rows = [['Zeitstempel', 'Ereignis']].concat(
      log.slice().reverse().map((e) => [e.at.toISOString(), e.type])
    );
    const csv = rows.map((r) => r.join(';')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'ampel-protokoll.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ── Kamera ──────────────────────────────────────────────────────────── */
  async function startCamera(deviceId) {
    const constraints = {
      audio: false,
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
    };
    stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
    await video.play();
    fillCameraList();
  }

  async function fillCameraList() {
    if (!navigator.mediaDevices.enumerateDevices) return;
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput');
    const sel = $('cam-select');
    if (devs.length < 2) { sel.parentElement.style.display = 'none'; return; }
    sel.parentElement.style.display = '';
    const current = stream && stream.getVideoTracks()[0].getSettings().deviceId;
    sel.innerHTML = devs.map((d, i) =>
      `<option value="${d.deviceId}"${d.deviceId === current ? ' selected' : ''}>${d.label || 'Kamera ' + (i + 1)}</option>`
    ).join('');
  }

  function stopCamera() {
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    video.srcObject = null;
  }

  async function requestWakeLock() {
    if (!cfg.keepAwake || !('wakeLock' in navigator)) return;
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
  }
  function releaseWakeLock() { if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; } }
  document.addEventListener('visibilitychange', () => {
    if (running && document.visibilityState === 'visible' && !wakeLock) requestWakeLock();
  });

  /* ── Demo-Generator: gezeichnete Ampel statt Kamerabild ──────────────── */
  const demoSeq = [['red', 4000], ['amber', 1200], ['green', 4000], ['red', 2500]];
  let demoStart = 0;

  function demoPhase(now) {
    const total = demoSeq.reduce((s, p) => s + p[1], 0);
    let t = (now - demoStart) % total;
    for (const [c, d] of demoSeq) { if (t < d) return c; t -= d; }
    return 'red';
  }

  function drawDemo(now) {
    const c = demoPhase(now);
    dctx.fillStyle = '#1a2330'; dctx.fillRect(0, 0, 640, 480);
    // Strassen-Andeutung, damit der Helligkeitsvergleich realistisch bleibt
    dctx.fillStyle = '#23303f'; dctx.fillRect(0, 300, 640, 180);
    dctx.fillStyle = '#2c3a4a'; dctx.fillRect(240, 40, 90, 230); // Ampelgehaeuse
    const lamps = [['red', 80], ['amber', 150], ['green', 220]];
    const RGB = { red: '#eb1e19', amber: '#faa514', green: '#1ee18c' };
    for (const [name, y] of lamps) {
      const on = name === c;
      dctx.beginPath(); dctx.arc(285, y, 26, 0, Math.PI * 2);
      dctx.fillStyle = on ? RGB[name] : '#1b2430';
      if (on) { dctx.shadowColor = RGB[name]; dctx.shadowBlur = 30; }
      dctx.fill(); dctx.shadowBlur = 0;
    }
    return c;
  }

  /* ── Analyse-Schleife ────────────────────────────────────────────────── */
  function currentSource() {
    if (demo) return { el: demoCv, w: demoCv.width, h: demoCv.height };
    return { el: video, w: video.videoWidth, h: video.videoHeight };
  }

  function tick(now) {
    rafId = requestAnimationFrame(tick);
    if (!running) return;
    const minGap = 1000 / cfg.fps;
    if (now - lastTick < minGap) return;
    lastTick = now;

    if (demo) drawDemo(now);
    const src = currentSource();
    if (!src.w || !src.h) return;

    // ROI aus dem Quellbild in die kleine Analyse-Leinwand skalieren.
    const r = cfg.roi;
    const sx = r.x * src.w, sy = r.y * src.h, sw = r.w * src.w, sh = r.h * src.h;
    try { wctx.drawImage(src.el, sx, sy, sw, sh, 0, 0, ANALYSIS_W, ANALYSIS_H); }
    catch (e) { return; }

    const img = wctx.getImageData(0, 0, ANALYSIS_W, ANALYSIS_H);
    const res = AmpelDetect.analyzeFrame(img, SENS[cfg.sensitivity]);
    const ev = state.push(res.color, now);
    if (ev) alarm(ev.type);

    frameTimes.push(now);
    while (frameTimes.length > 20) frameTimes.shift();

    drawOverlay(res);
    updateStatus(res);
  }

  function drawOverlay(res) {
    const rect = (demo ? demoCv : video).getBoundingClientRect();
    const cw = Math.round(rect.width), ch = Math.round(rect.height);
    if (overlay.width !== cw || overlay.height !== ch) { overlay.width = cw; overlay.height = ch; }
    octx.clearRect(0, 0, cw, ch);

    const r = cfg.roi;
    const bx = r.x * cw, by = r.y * ch, bw = r.w * cw, bh = r.h * ch;
    octx.strokeStyle = 'rgba(0,198,255,.85)'; octx.lineWidth = 2;
    octx.setLineDash([8, 6]); octx.strokeRect(bx, by, bw, bh); octx.setLineDash([]);
    octx.fillStyle = 'rgba(0,198,255,.9)'; octx.font = '11px Barlow, sans-serif';
    octx.fillText('Suchbereich', bx + 6, by + 14);

    if (res && res.blob) {
      const COL = { red: '#ff5c5c', amber: '#f5a623', green: '#3ddc84' };
      const b = res.blob;
      octx.strokeStyle = COL[b.color]; octx.lineWidth = 3;
      octx.strokeRect(bx + (b.x / ANALYSIS_W) * bw, by + (b.y / ANALYSIS_H) * bh,
                      (b.w / ANALYSIS_W) * bw, (b.h / ANALYSIS_H) * bh);
    }
  }

  function updateStatus(res) {
    const dot = $('state-dot'), txt = $('state-text');
    const COL = { red: '#ff5c5c', amber: '#f5a623', green: '#3ddc84' };
    const NAME = { red: 'Rot erkannt', amber: 'Gelb erkannt', green: 'Grün erkannt' };
    const s = state.state;
    dot.style.background = s ? COL[s] : '#2b3d55';
    dot.style.boxShadow = s ? `0 0 18px ${COL[s]}` : 'none';
    txt.textContent = s ? NAME[s] : (running ? 'Suche Ampel …' : 'Gestoppt');

    let fps = 0;
    if (frameTimes.length > 1) fps = (frameTimes.length - 1) * 1000 / (frameTimes[frameTimes.length - 1] - frameTimes[0]);
    $('metrics').textContent = res
      ? `${fps.toFixed(0)} fps · Score ${res.score.toFixed(0)} · Ø-Helligkeit ${(res.meanV * 100).toFixed(0)} %`
      : '';
  }

  /* ── Start / Stop ────────────────────────────────────────────────────── */
  async function start(useDemo) {
    demo = !!useDemo;
    demoStart = performance.now();
    state = new AmpelDetect.AmpelState(smOpts());
    state.reset();
    ensureAudio(); // muss aus der Nutzergeste heraus passieren (iOS)

    if (!demo) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return showError('Dieser Browser kennt keinen Kamerazugriff. Bitte Chrome oder Safari verwenden.');
      }
      if (!window.isSecureContext) {
        return showError('Kamera braucht HTTPS. Bitte die Seite über https:// öffnen.');
      }
      try { await startCamera(); }
      catch (e) {
        return showError('Kamera nicht verfügbar: ' + (e && e.message ? e.message : e) +
          ' — im Browser die Kamera-Freigabe für diese Seite erlauben.');
      }
      video.style.display = '';
      demoCv.style.display = 'none';
      $('demo-note').style.display = 'none';
    } else {
      stopCamera();
      video.style.display = 'none';
      demoCv.style.display = '';
      $('demo-note').style.display = '';
    }

    showError('');
    running = true;
    requestWakeLock();
    $('btn-start').textContent = 'Stoppen';
    $('btn-start').classList.remove('primary');
    $('btn-demo').disabled = true;
    if (!rafId) rafId = requestAnimationFrame(tick);
    updateStatus(null);
  }

  function stop() {
    running = false; demo = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    stopCamera();
    releaseWakeLock();
    octx.clearRect(0, 0, overlay.width, overlay.height);
    video.style.display = '';
    demoCv.style.display = 'none';
    $('demo-note').style.display = 'none';
    $('btn-start').textContent = 'Erkennung starten';
    $('btn-start').classList.add('primary');
    $('btn-demo').disabled = false;
    updateStatus(null);
  }

  function showError(msg) {
    const el = $('err');
    el.textContent = msg || '';
    el.style.display = msg ? '' : 'none';
  }

  /* ── Bedienung ───────────────────────────────────────────────────────── */
  // Tippen auf das Bild zentriert den Suchbereich auf diesen Punkt.
  overlay.addEventListener('pointerdown', (e) => {
    const rect = overlay.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    cfg.roi.x = Math.min(Math.max(px - cfg.roi.w / 2, 0), 1 - cfg.roi.w);
    cfg.roi.y = Math.min(Math.max(py - cfg.roi.h / 2, 0), 1 - cfg.roi.h);
    save();
  });

  function bindRange(id, get, set, fmtId, fmt) {
    const el = $(id);
    el.value = get();
    if (fmtId) $(fmtId).textContent = fmt(get());
    el.addEventListener('input', () => {
      set(parseFloat(el.value));
      if (fmtId) $(fmtId).textContent = fmt(get());
      state.opts = smOpts();
      save();
    });
  }

  function bindCheck(id, key) {
    const el = $(id);
    el.checked = !!cfg[key];
    el.addEventListener('change', () => {
      cfg[key] = el.checked;
      state.opts = smOpts();
      save();
      if (key === 'keepAwake') { if (cfg.keepAwake && running) requestWakeLock(); else releaseWakeLock(); }
    });
  }

  function init() {
    bindRange('r-sens', () => cfg.sensitivity, (v) => { cfg.sensitivity = v; }, 'v-sens',
      (v) => ['sehr streng', 'streng', 'normal', 'empfindlich', 'sehr empfindlich'][v - 1]);
    bindRange('r-confirm', () => cfg.confirmFrames, (v) => { cfg.confirmFrames = v; }, 'v-confirm',
      (v) => v + ' Frames');
    bindRange('r-cooldown', () => cfg.cooldownSec, (v) => { cfg.cooldownSec = v; }, 'v-cooldown',
      (v) => v + ' s');
    bindRange('r-roi', () => cfg.roi.w, (v) => {
      const cx = cfg.roi.x + cfg.roi.w / 2, cy = cfg.roi.y + cfg.roi.h / 2;
      cfg.roi.w = v; cfg.roi.h = Math.min(v * 0.92, 0.9);
      cfg.roi.x = Math.min(Math.max(cx - cfg.roi.w / 2, 0), 1 - cfg.roi.w);
      cfg.roi.y = Math.min(Math.max(cy - cfg.roi.h / 2, 0), 1 - cfg.roi.h);
    }, 'v-roi', (v) => Math.round(v * 100) + ' %');

    ['alertAmber', 'requireRedFirst', 'sound', 'vibrate', 'speech', 'keepAwake'].forEach((k) =>
      bindCheck('c-' + k, k));

    if (!navigator.vibrate) {
      $('c-vibrate').disabled = true;
      $('hint-vibrate').textContent = ' — von diesem Gerät nicht unterstützt (iPhone: nur Ton)';
    }

    $('btn-start').addEventListener('click', () => (running ? stop() : start(false)));
    $('btn-demo').addEventListener('click', () => start(true));
    $('btn-test').addEventListener('click', () => alarm('green'));
    $('btn-csv').addEventListener('click', exportCsv);
    $('btn-reset').addEventListener('click', () => {
      cfg = JSON.parse(JSON.stringify(defaults)); save(); location.reload();
    });
    $('cam-select').addEventListener('change', async (e) => {
      if (!running || demo) return;
      stopCamera();
      try { await startCamera(e.target.value); } catch (err) { showError('Kamerawechsel fehlgeschlagen: ' + err.message); }
    });

    renderLog();
    updateStatus(null);
    window.addEventListener('pagehide', stop);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
