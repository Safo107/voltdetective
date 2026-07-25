/* ============================================================================
 * VoltDetective v2 — UI & Interaktions-Matrix
 * ----------------------------------------------------------------------------
 * Strikte Trennung:
 *   - Tap auf Wippe/Sicherung im Raum: schaltet NUR den Zustand + Kipp-Animation.
 *   - Kontext-Button "Öffnen" an einer Lampe: öffnet die Fehlersuche
 *     (Sichtprüfung, Klemmen, Messgerät, Glühwendel) + Diagnose (7 Fehlerarten).
 * Design: ElektroGenius (Navy/Cyan, Barlow). KEINE Emojis — nur Inline-SVGs.
 * ==========================================================================*/
const UI = (() => {
  let game;
  const refs = { lamps: {}, channels: {}, fuse: null };

  // Reihenfolge der Diagnose-Optionen (Fehlerarten aus dem Simulations-Katalog)
  const FAULT_ORDER = ['sicherung_defekt', 'klemme_lose', 'schalter_defekt', 'kabelbruch', 'kurzschluss', 'fassung_defekt', 'gluehwendel'];

  /* --- Inline-SVG-Icons (feather-Stil) ----------------------------------*/
  const P = {
    refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    search:  '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    zap:     '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
    sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    clip:    '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 14l2 2 4-4"/>',
    eye:     '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    tool:    '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
    gauge:   '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    bulb:    '<path d="M9 18h6M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1v.2h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/>',
    check:   '<polyline points="20 6 9 17 4 12"/>',
    x:       '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    alert:   '<path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  };
  function icon(name, cls) {
    return '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + P[name] + '</svg>';
  }
  const FT = () => Simulation.FAULT_TYPES;

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  /* --- Aufbau (einmalig) -------------------------------------------------*/
  function init(gameRef) {
    game = gameRef;
    buildGame();
    refresh();
  }

  function buildGame() {
    const root = document.getElementById('game');
    root.innerHTML = '';
    refs.lamps = {}; refs.channels = {};

    const bar = el('div', 'ctrlbar');
    const status = el('div', 'status'); status.id = 'status';
    const btn = el('button', 'btn primary', icon('refresh') + '<span>Neue Runde</span>');
    btn.onclick = () => game.newRound();
    bar.appendChild(status); bar.appendChild(btn);
    root.appendChild(bar);

    const layout = el('div', 'layout');
    root.appendChild(layout);

    /* Raum */
    const room = el('section', 'room card');
    layout.appendChild(room);
    const ceiling = el('div', 'ceiling');
    room.appendChild(ceiling);

    const g1 = el('div', 'lamp-group');
    g1.appendChild(el('h3', 'group-title', 'Serienschalter — 2 Deckenlampen'));
    const row1 = el('div', 'lamp-row');
    ['L1', 'L2'].forEach(id => row1.appendChild(buildLamp(id)));
    g1.appendChild(row1);
    ceiling.appendChild(g1);

    const g2 = el('div', 'lamp-group');
    g2.appendChild(el('h3', 'group-title', 'Lampenkette — ' + CONFIG.lampChain.count + ' Lampen (parallel)'));
    const row2 = el('div', 'lamp-row wrap');
    game.circuit.lamps.filter(l => l.channel.id === 'c1').forEach(l => row2.appendChild(buildLamp(l.id)));
    g2.appendChild(row2);
    ceiling.appendChild(g2);

    const wall = el('div', 'wall');
    room.appendChild(wall);
    wall.appendChild(buildFuse());
    game.circuit.switches.forEach(sw => wall.appendChild(buildSwitch(sw)));

    /* Diagnose-Panel */
    const aside = el('aside', 'panel card');
    layout.appendChild(aside);
    aside.appendChild(el('h3', 'panel-title', icon('clip') + '<span>Diagnoseliste</span>'));
    aside.appendChild(el('p', 'muted', 'Nur <strong>echte</strong> Schäden gehören hier hinein. Ein ausgeschalteter Schalter ist <em>kein</em> Defekt.'));
    const list = el('ul', 'diag-list'); list.id = 'diag-list';
    aside.appendChild(list);
    aside.appendChild(el('div', 'hint', icon('bulb') + '<span><strong>Meister-Regel:</strong> Erst Sichtprüfung &amp; Einschalten — dann Messen.</span>'));

    const overlay = el('div', 'overlay hidden'); overlay.id = 'overlay';
    overlay.onclick = e => { if (e.target === overlay) closeDetail(); };
    document.body.appendChild(overlay);
  }

  function buildLamp(lampId) {
    const lamp = game.circuit.lamps.find(l => l.id === lampId);
    const box = el('div', 'lamp'); box.dataset.lamp = lampId;
    box.innerHTML = '<div class="bulb"><div class="glow"></div><div class="filament"></div></div>' +
      '<div class="lamp-label">' + lamp.label + '</div>';
    const open = el('button', 'btn tiny', icon('search') + '<span>Öffnen</span>');
    open.onclick = () => openDetail(lampId);
    box.appendChild(open);
    refs.lamps[lampId] = box;
    return box;
  }

  function buildFuse() {
    const wrap = el('div', 'device fuse-box');
    wrap.appendChild(el('div', 'device-title', icon('zap') + '<span>' + game.circuit.fuse.label + '</span>'));
    const rocker = el('button', 'rocker big');
    rocker.title = 'Klick: schaltet die Sicherung — mehr nicht';
    rocker.innerHTML = '<span class="knob"></span>';
    rocker.onclick = () => { game.circuit.fuse.isOn = !game.circuit.fuse.isOn; game.onChange(); };
    wrap.appendChild(rocker);
    wrap.appendChild(el('div', 'device-sub', 'Hauptschalter des Kreises'));
    refs.fuse = rocker;
    return wrap;
  }

  function buildSwitch(sw) {
    const wrap = el('div', 'device');
    wrap.appendChild(el('div', 'device-title', icon('sliders') + '<span>' + sw.label + '</span>'));
    const plate = el('div', 'plate' + (sw.type === 'series' ? ' series' : ''));
    sw.channels.forEach(ch => {
      const rk = el('button', 'rocker');
      rk.title = 'Klick: schaltet ' + ch.label + ' — mehr nicht';
      rk.innerHTML = '<span class="knob"></span><span class="rk-label">' + ch.label + '</span>';
      rk.onclick = () => { ch.isOn = !ch.isOn; game.onChange(); };
      refs.channels[sw.id + ':' + ch.id] = rk;
      plate.appendChild(rk);
    });
    wrap.appendChild(plate);
    return wrap;
  }

  /* --- Visuelle Aktualisierung (sofort) ---------------------------------*/
  function refresh() {
    const lit = Simulation.evaluate(game.circuit);
    for (const id in refs.lamps) {
      refs.lamps[id].classList.toggle('lit', lit[id]);
      refs.lamps[id].classList.toggle('dark', !lit[id]);
    }
    refs.fuse.classList.toggle('on', game.circuit.fuse.isOn);
    for (const key in refs.channels) {
      const [sid, cid] = key.split(':');
      refs.channels[key].classList.toggle('on', Simulation.getChannel(game.circuit, sid, cid).isOn);
    }
    renderDiagList();
    renderStatus();
  }

  function renderStatus() {
    const s = document.getElementById('status');
    if (!s) return;
    const total = game.totalFaults(), found = game.foundCount();
    s.classList.toggle('solved', game.solved);
    if (game.solved) {
      s.innerHTML = icon('check') + '<span><strong>Runde gelöst!</strong> Alle Lampen leuchten.</span>';
    } else {
      s.innerHTML = icon('tool') + '<span>Fehler behoben: <strong>' + found + ' / ' + total + '</strong></span>';
    }
  }

  function renderDiagList() {
    const ul = document.getElementById('diag-list');
    if (!ul) return;
    ul.innerHTML = '';
    if (game.found.length === 0) { ul.appendChild(el('li', 'empty', 'Noch keine Fehler gefunden.')); return; }
    game.found.forEach(f => {
      ul.appendChild(el('li', 'good',
        icon('check') + '<span><strong>' + FT()[f.type].short + '</strong><br><span class="loc">' + f.label + '</span></span>'));
    });
  }

  /* --- Detail-Ansicht / Fehlersuche --------------------------------------*/
  function openDetail(lampId) {
    const lamp = game.circuit.lamps.find(l => l.id === lampId);
    const overlay = document.getElementById('overlay');
    overlay.classList.remove('hidden');

    const card = el('div', 'modal card');
    card.innerHTML =
      '<div class="card-head"><h2>' + icon('search') + '<span>' + lamp.label + '</span></h2>' +
      '<button class="icon-btn" id="close-x" aria-label="Schließen">' + icon('x') + '</button></div>' +
      '<p class="muted">Prüfen: Sichtprüfung → Klemmen → Messgerät → Glühwendel. Dann Diagnose stellen.</p>';

    const tools = el('div', 'tools');
    tools.appendChild(toolBtn('eye',   'Sichtprüfung',        () => setReadout(visualText(lamp))));
    tools.appendChild(toolBtn('tool',  'Klemmen prüfen',      () => setReadout(terminalText(lamp))));
    tools.appendChild(toolBtn('gauge', 'Messgerät anlegen',   () => setReadout(measurementText(lamp))));
    tools.appendChild(toolBtn('bulb',  'Glühwendel ansehen',  () => setReadout(filamentText(lamp))));
    card.appendChild(tools);

    const out = el('div', 'readout'); out.id = 'readout';
    out.innerHTML = '<em>Noch keine Prüfung durchgeführt.</em>';
    card.appendChild(out);

    const diag = el('div', 'diagnose');
    diag.appendChild(el('h3', null, 'Diagnose stellen'));
    const btns = el('div', 'diag-btns');
    FAULT_ORDER.forEach(t => btns.appendChild(diagBtn(FT()[t].short, () => submit(lamp, t), 'accent')));
    diag.appendChild(btns);
    diag.appendChild(diagBtn('Kein Defekt – war nur ausgeschaltet', () => submit(lamp, 'none'), 'ghost wide'));
    card.appendChild(diag);

    card.appendChild(el('div', 'feedback', '')).id = 'feedback';

    overlay.innerHTML = '';
    overlay.appendChild(card);
    document.getElementById('close-x').onclick = closeDetail;
  }

  function toolBtn(ic, label, fn) { const b = el('button', 'btn tool-btn', icon(ic) + '<span>' + label + '</span>'); b.onclick = fn; return b; }
  function diagBtn(label, fn, extra) { const b = el('button', 'btn ' + (extra || 'accent'), '<span>' + label + '</span>'); b.onclick = fn; return b; }
  function setReadout(html) { document.getElementById('readout').innerHTML = html; }

  /* Prüf-Werkzeuge — liefern wahrheitsgemäße Befunde aus dem Zustand */
  function visualText(lamp) {
    const c = game.circuit;
    const parts = [
      'Sicherung: <b class="' + (c.fuse.isOn ? 'ok' : 'no') + '">' + (c.fuse.isOn ? 'EIN' : 'AUS') + '</b>',
      'Zuständige ' + lamp.channel.label + ': <b class="' + (lamp.channel.isOn ? 'ok' : 'no') + '">' + (lamp.channel.isOn ? 'EIN' : 'AUS') + '</b>',
    ];
    const visible = [];
    if (c.fuse.fault === 'sicherung_defekt') visible.push('LS-Kipphebel ist herausgesprungen (ausgelöst)');
    if (lamp.socket.fault === 'fassung_defekt') visible.push('Lampe sitzt sichtbar locker in der Fassung');
    let s = parts.join('<br>');
    if (visible.length) s += '<br><span class="warn">Sichtbar: ' + visible.join('; ') + '</span>';
    if (!c.fuse.isOn || !lamp.channel.isOn) s += '<br><span class="warn">Zuerst einschalten, bevor du misst!</span>';
    return s;
  }
  function terminalText(lamp) {
    const issues = [];
    if (lamp.feed.fault === 'klemme_lose') issues.push('lose Klemme an „' + lamp.feed.label + '“');
    if (lamp.socket.fault === 'fassung_defekt') issues.push('schlechter Fassungskontakt („' + lamp.socket.label + '“)');
    return issues.length
      ? 'Klemmstellen: <b class="no">' + issues.join('; ') + '</b>'
      : 'Klemmen/Anschlüsse auf diesem Zweig: <b class="ok">fest &amp; sauber</b>';
  }
  function filamentText(lamp) {
    const broken = lamp.filament.fault === 'gluehwendel';
    return 'Glühwendel (' + lamp.label + '): <b class="' + (broken ? 'no' : 'ok') + '">' + (broken ? 'durchgebrannt' : 'intakt') + '</b>';
  }
  function measurementText(lamp) {
    const b = Simulation.firstBlock(game.circuit, lamp);
    if (!b) return 'Spannung + Durchgang <b class="ok">OK</b> — Lampe müsste leuchten.';
    if (b.kind === 'off')   return 'Keine Spannung — <b class="no">' + b.el.label + ' steht auf AUS</b>. (Erst einschalten!)';
    if (b.kind === 'short')  return '<b class="no">Sicherung fliegt sofort wieder heraus</b> — Kurzschluss in einem <u>anderen</u> Zweig. Dort weitersuchen.';
    switch (b.type) {
      case 'sicherung_defekt': return 'Keine Spannung — <b class="no">LS-Schalter defekt/ausgelöst</b> (lässt sich nicht halten).';
      case 'klemme_lose':      return 'Spannung schwankt, kein sicherer Durchgang — <b class="no">lose Klemme</b> („' + b.el.label + '“).';
      case 'schalter_defekt':  return 'Schalter steht auf EIN, aber <b class="no">kein Durchgang — Schaltkontakt defekt</b> („' + b.el.label + '“).';
      case 'kabelbruch':       return 'Spannung vorhanden, aber <b class="no">kein Durchgang — Kabelbruch</b> („' + b.el.label + '“).';
      case 'kurzschluss':      return '<b class="no">Kurzschluss auf dieser Leitung</b> („' + b.el.label + '“) — Sicherung fliegt.';
      case 'fassung_defekt':   return 'Bis zur Fassung Spannung + Durchgang, aber <b class="no">Fassungskontakt defekt</b> („' + b.el.label + '“).';
      case 'gluehwendel':      return 'Fassung OK, aber <b class="no">Glühwendel ohne Durchgang</b> („' + b.el.label + '“).';
    }
    return '';
  }

  /* Diagnose absenden -> Bewertung */
  function submit(lamp, claimed) {
    const r = game.diagnose(lamp, claimed);
    const fb = document.getElementById('feedback');
    switch (r.result) {
      case 'ok-none':    fb.innerHTML = ok('Richtig — kein technischer Defekt hier. Es war nur ausgeschaltet.'); break;
      case 'wrong-none': fb.innerHTML = bad('Doch — hier liegt ein echter Fehler vor. Miss nochmal genau.'); break;
      case 'trap':       fb.innerHTML = bad('<strong>Meister-Falle!</strong> Kein Defekt — nur ausgeschaltet. Erst Sichtprüfung &amp; Einschalten, dann Messen.'); break;
      case 'short-elsewhere': fb.innerHTML = bad('Der Kurzschluss sitzt in einem <u>anderen</u> Zweig — dort weitersuchen.'); break;
      case 'correct':    fb.innerHTML = ok('Korrekt: ' + FT()[r.type].label + ' — <strong>behoben!</strong>'); break;
      case 'wrong':      fb.innerHTML = bad('Nicht ganz — die Messung passt nicht dazu. Tipp: Messgerät nutzen und dem Pfad folgen.'); break;
    }
    game.onChange();
  }

  function closeDetail() { document.getElementById('overlay').classList.add('hidden'); }

  const ok  = m => '<div class="fb ok-fb">' + icon('check') + '<span>' + m + '</span></div>';
  const bad = m => '<div class="fb bad-fb">' + icon('alert') + '<span>' + m + '</span></div>';

  return { init, refresh };
})();
