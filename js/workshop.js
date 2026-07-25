/* ============================================================================
 * VoltDetective — Werkstatt (Phase 2): PixiJS-Szene mit Szenen-System
 * ----------------------------------------------------------------------------
 * - DUSPOL mit zwei Prüfspitzen (native Drag, Maus + Touch), Live-Spannung
 * - Adern IMMER gleich sichtbar — Fehler nur per Messung erkennbar
 * - Zwei Schaltungen (Szenen):
 *     'basis'   = Grundstromkreis + Steckdose
 *     'wechsel' = Wechselschaltung (zwei Wechselschalter, zwei Korrespondierende)
 * - VERSTECKTE Fehler-Aufgabe je Szene
 * ==========================================================================*/
const Workshop = (() => {
  const COL = { L: 0x8a5a2b, N: 0x1f6fd0, PE: 0x2fa02f, PEy: 0xe9dc1f, jacket: 0x40454d, term: 0xdfeeff };
  const STEPS = [0, 12, 24, 50, 120, 230, 400];
  const W = 920, H = 560;
  const FAULTS = {
    none:           'Kein Fehler',
    fuseBlown:      'Sicherung defekt',
    pe:             'PE unterbrochen',
    n:              'N unterbrochen',
    lampL:          'Kabelbruch L → Leuchte',
    switchDefect:   'Schaltkontakt defekt',
    lnSwap:         'L / N vertauscht',
    koerper:        'Körperschluss (L an PE)',
    steckPE:        'PE fehlt an Steckdose',
    korrespondierend: 'Korrespondierende unterbrochen',
  };
  const START = { red: { x: 250, y: 520 }, black: { x: 660, y: 520 } };

  const state = {
    scene: 'basis',
    fuseOn: true, switchOn: true, fiArmed: true,   // basis
    p1: 0, p2: 0,                   // wechsel: Stellung der zwei Wechselschalter
    faults: {},                     // je Szene gesetzt
    brokenTrav: 1, defSwitch: 1,    // welche Korrespondierende / welcher Schalter defekt
    active: 'none', score: 0, taskDone: false,
  };

  let app, sceneRoot, dynG, hiG, probes = {}, readout, drag = null, terminals = [];

  /* ======================================================================
   * SZENEN-DEFINITIONEN
   * ====================================================================*/
  const SCENES = {
    /* ---------------- Grundschaltung + Steckdose ---------------- */
    basis: {
      faults: ['fuseBlown', 'pe', 'n', 'lampL', 'switchDefect', 'lnSwap', 'koerper', 'steckPE'],
      pool:   ['fuseBlown', 'pe', 'n', 'lampL', 'switchDefect', 'lnSwap', 'koerper', 'steckPE', 'pe', 'n', 'lampL', 'none'],
      lamp:   { L: 'Lampe_L', N: 'Lampe_N', x: 767, y: 272 },
      controls: [{ key: 'fuse', label: 'Sicherung' }, { key: 'fi', label: 'FI' }, { key: 'fitest', label: 'Prüftaste' }, { key: 'switch', label: 'Schalter' }],
      terminals: [
        ['V_L', 160, 235, 'L'], ['V_N', 160, 275, 'N'], ['V_PE', 160, 315, 'PE'],
        ['D_L', 372, 240, 'L'], ['D_N', 372, 275, 'N'], ['D_PE', 372, 310, 'PE'],
        ['D_Lsw', 492, 240, 'L'], ['S_in', 405, 132, 'L'], ['S_out', 455, 132, 'L'],
        ['Lampe_L', 720, 250, 'L'], ['Lampe_N', 720, 275, 'N'], ['Lampe_PE', 720, 300, 'PE'],
        ['Steck_L', 650, 120, 'L'], ['Steck_N', 672, 120, 'N'], ['Steck_PE', 694, 120, 'PE'],
      ],
      draw(g) {
        boxG(g, 40, 150, 120, 250, 'Verteiler + LS');
        // FI/RCD im Verteiler
        g.lineStyle(1, 0x3a5474).beginFill(0x18324a).drawRoundedRect(52, 336, 96, 44, 6).endFill();
        labelG(g, 100, 352, 'FI / RCD');
        g.lineStyle(0).beginFill(0xf5a623).drawCircle(132, 368, 5).endFill();
        labelG(g, 92, 368, 'Prüftaste');
        g.lineStyle(2, 0x2b4763).beginFill(0x122237, 0.92).drawCircle(430, 275, 64).endFill();
        labelG(g, 430, 200, 'Abzweigdose');
        boxG(g, 395, 78, 70, 54, 'Schalter');
        boxG(g, 720, 225, 95, 95, 'Leuchte');
        socketG(g, 672, 72);
        cable(g, 160, 275, 372, 275, ['L', 'N', 'PE'], [-40, 0, 40]);
        cable(g, 430, 213, 430, 132, ['L', 'L'], [-25, 25]);
        cable(g, 492, 275, 720, 275, ['L', 'N', 'PE'], [-25, 0, 25]);
        cable(g, 470, 232, 672, 120, ['L', 'N', 'PE'], [-22, 0, 22]);
      },
      pot(id) {
        const on = state.fuseOn && !state.faults.fuseBlown;
        // FI (RCD) löst bei Körperschluss aus -> Kreis wird stromlos
        const power = on && state.fiArmed && !state.faults.koerper;
        const Lsrc = power ? 230 : 0;
        const Lsw = (power && state.switchOn && !state.faults.switchDefect) ? 230 : 0;
        const N = state.faults.n ? null : 0;
        const PE = state.faults.pe ? null : 0;
        switch (id) {
          case 'V_L': case 'D_L': case 'S_in': return Lsrc;
          case 'S_out': case 'D_Lsw': return Lsw;
          case 'Lampe_L': return state.faults.lnSwap ? N : (state.faults.lampL ? null : Lsw);
          case 'Lampe_N': return state.faults.lnSwap ? Lsw : N;
          case 'V_N': return 0;
          case 'D_N': return N;
          case 'V_PE': return 0;
          case 'D_PE': case 'Lampe_PE': return PE;
          case 'Steck_L': return Lsrc;
          case 'Steck_N': return N;
          case 'Steck_PE': return (state.faults.pe || state.faults.steckPE) ? null : 0;
          default: return 0;
        }
      },
    },

    /* ---------------- Wechselschaltung ---------------- */
    wechsel: {
      faults: ['fuseBlown', 'pe', 'n', 'korrespondierend', 'switchDefect'],
      pool:   ['fuseBlown', 'pe', 'n', 'korrespondierend', 'korrespondierend', 'switchDefect', 'none'],
      lamp:   { L: 'W_LampeL', N: 'W_LampeN', x: 800, y: 275 },
      controls: [{ key: 'fuse', label: 'Sicherung' }, { key: 'p1', label: 'Schalter 1' }, { key: 'p2', label: 'Schalter 2' }],
      terminals: [
        ['V_L', 150, 235, 'L'], ['V_N', 150, 275, 'N'], ['V_PE', 150, 315, 'PE'],
        ['S1_com', 300, 230, 'L'], ['K_a1', 355, 165, 'L'], ['K_a2', 355, 300, 'L'],
        ['K_b1', 565, 165, 'L'], ['K_b2', 565, 300, 'L'], ['S2_com', 620, 230, 'L'],
        ['W_LampeL', 760, 250, 'L'], ['W_LampeN', 760, 275, 'N'], ['W_LampePE', 760, 300, 'PE'],
      ],
      draw(g) {
        boxG(g, 40, 150, 90, 250, 'Verteiler + LS');
        boxG(g, 270, 175, 60, 70, 'Wechsel- schalter 1');
        boxG(g, 590, 175, 60, 70, 'Wechsel- schalter 2');
        boxG(g, 760, 225, 90, 95, 'Leuchte');
        // L: Verteiler -> S1_com
        line(g, 150, 235, 300, 230, 'L');
        // Korrespondierende (zwei Adern zwischen den Schaltern)
        line(g, 355, 165, 565, 165, 'L');
        line(g, 355, 300, 565, 300, 'L');
        // S1 zu seinen Korrespondierenden / S2 zu seinen
        line(g, 300, 230, 355, 165, 'L'); line(g, 300, 230, 355, 300, 'L');
        line(g, 565, 165, 620, 230, 'L'); line(g, 565, 300, 620, 230, 'L');
        // S2_com -> Leuchte L
        line(g, 620, 230, 760, 250, 'L');
        // N + PE direkt vom Verteiler zur Leuchte
        line(g, 150, 275, 760, 275, 'N');
        line(g, 150, 315, 760, 300, 'PE');
      },
      pot(id) {
        const Lsrc = (state.fuseOn && !state.faults.fuseBlown) ? 230 : 0;
        const N = state.faults.n ? null : 0;
        const PE = state.faults.koerper ? 230 : (state.faults.pe ? null : 0);
        if (id === 'V_L') return Lsrc;
        if (id === 'V_N') return 0;
        if (id === 'V_PE') return state.faults.koerper ? 230 : 0;
        if (id === 'W_LampeN') return N;
        if (id === 'W_LampePE') return PE;
        // L-Seite über Erreichbarkeit lösen
        const kBreak = state.faults.korrespondierend;
        const t1 = !(kBreak && state.brokenTrav === 1);
        const t2 = !(kBreak && state.brokenTrav === 2);
        const s1 = !(state.faults.switchDefect && state.defSwitch === 1);
        const s2 = !(state.faults.switchDefect && state.defSwitch === 2);
        const adj = {};
        const link = (a, b) => { (adj[a] = adj[a] || []).push(b); (adj[b] = adj[b] || []).push(a); };
        if (s1) link('S1_com', state.p1 === 0 ? 'K_a1' : 'K_a2');
        if (t1) link('K_a1', 'K_b1');
        if (t2) link('K_a2', 'K_b2');
        if (s2) link('S2_com', state.p2 === 0 ? 'K_b1' : 'K_b2');
        const reach = (start) => {
          const seen = new Set(), st = [start];
          while (st.length) { const x = st.pop(); if (seen.has(x)) continue; seen.add(x); (adj[x] || []).forEach(y => st.push(y)); }
          return seen;
        };
        const src = reach('S1_com'), lampSet = reach('S2_com');
        const nodeV = n => src.has(n) ? Lsrc : (lampSet.has(n) ? 0 : null);
        if (id === 'S1_com') return Lsrc;
        if (id === 'W_LampeL') return nodeV('S2_com');
        if (['K_a1', 'K_a2', 'K_b1', 'K_b2', 'S2_com'].indexOf(id) !== -1) return nodeV(id);
        return 0;
      },
    },
  };

  function SC() { return SCENES[state.scene]; }
  function pot(id) { return SC().pot(id); }
  function measure(a, b) {
    if (!a || !b) return { text: '— — —', v: null, bad: false };
    const pa = pot(a), pb = pot(b);
    if (pa === null || pb === null) return { text: 'kein Bezug', v: null, bad: true };
    return { text: Math.abs(pa - pb) + ' V', v: Math.abs(pa - pb), bad: false };
  }
  function lampLit() {
    const s = SC().lamp, l = pot(s.L), n = pot(s.N);
    return l !== null && n !== null && Math.abs(l - n) === 230;
  }

  /* ======================================================================
   * ZEICHEN-HELFER (in eine Graphics g)
   * ====================================================================*/
  function boxG(g, x, y, w, h, title) {
    g.lineStyle(2, 0x2b4763).beginFill(0x122237, 0.92).drawRoundedRect(x, y, w, h, 10).endFill();
    if (title) title.split(' ').forEach((ln, i) => labelG(g, x + w / 2, y - 14 + i * 14, ln));
  }
  function socketG(g, cx, cy) {
    const r = 26;
    g.lineStyle(2, 0x2b4763).beginFill(0x1a2c42).drawRoundedRect(cx - r - 8, cy - r - 8, (r + 8) * 2, (r + 8) * 2, 10).endFill();
    g.lineStyle(2, 0x3a5474).beginFill(0x0f2035).drawCircle(cx, cy, r).endFill();
    g.lineStyle(4, 0x9fb4cc, 1).moveTo(cx - 15, cy - r + 3).lineTo(cx + 15, cy - r + 3).moveTo(cx - 15, cy + r - 3).lineTo(cx + 15, cy + r - 3);
    g.lineStyle(0).beginFill(0x0a1420).drawCircle(cx - 10, cy, 4).drawCircle(cx + 10, cy, 4).endFill();
    labelG(g, cx, cy - r - 18, 'Steckdose');
  }
  const labels = [];  // Text-Objekte der aktuellen Szene (in sceneRoot)
  function labelG(g, x, y, text, color) {
    const t = new PIXI.Text(text, { fontFamily: 'Barlow, sans-serif', fontSize: 12, fill: color || 0xcfe0f2, fontWeight: '600' });
    t.anchor.set(0.5); t.x = x; t.y = y; sceneRoot.addChild(t);
  }
  // einzelne farbige Ader (Schematik)
  function line(g, ax, ay, bx, by, ader) {
    const col = ader === 'N' ? COL.N : ader === 'PE' ? COL.PE : COL.L;
    g.lineStyle(4, col, 1).moveTo(ax, ay).lineTo(bx, by);
    if (ader === 'PE') g.lineStyle(2, COL.PEy, 1).moveTo(ax, ay).lineTo(bx, by);
  }
  // Mantelkabel mit Adern (immer voll sichtbar)
  function cable(g, ax, ay, bx, by, aders, termOff) {
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const jax = ax + ux * L * 0.20, jay = ay + uy * L * 0.20;
    const jbx = ax + ux * L * 0.80, jby = ay + uy * L * 0.80;
    g.lineStyle(22, COL.jacket, 1); g.moveTo(jax, jay).lineTo(jbx, jby);
    g.lineStyle(22, 0x565c66, 0.25); g.moveTo(jax, jay).lineTo(jbx, jby);
    const coreOff = aders.length === 2 ? [-6, 6] : [-7, 0, 7];
    aders.forEach((ader, i) => {
      const to = termOff[i], co = coreOff[i];
      const base = ader === 'N' ? COL.N : ader === 'PE' ? COL.PE : COL.L;
      g.lineStyle(4, base, 1);
      g.moveTo(ax + nx * to, ay + ny * to).lineTo(jax + nx * co, jay + ny * co)
       .lineTo(jbx + nx * co, jby + ny * co).lineTo(bx + nx * to, by + ny * to);
      if (ader === 'PE') g.lineStyle(2, COL.PEy, 1).moveTo(jax + nx * co, jay + ny * co).lineTo(jbx + nx * co, jby + ny * co);
    });
  }

  /* ======================================================================
   * INIT / SZENE LADEN
   * ====================================================================*/
  function init(container) {
    app = new PIXI.Application({ width: W, height: H, backgroundAlpha: 0, antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true });
    app.view.style.width = '100%'; app.view.style.height = 'auto'; app.view.style.maxWidth = W + 'px';
    app.view.style.touchAction = 'none'; app.view.style.cursor = 'grab';
    container.appendChild(app.view);

    sceneRoot = new PIXI.Container(); app.stage.addChild(sceneRoot);   // per-Szene (statisch)
    dynG = new PIXI.Graphics(); app.stage.addChild(dynG);              // dynamisch (Glühen/Leitungen/Highlight)
    hiG = new PIXI.Graphics(); app.stage.addChild(hiG);
    buildDuspol();                                                     // persistent

    app.view.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onWinMove);
    window.addEventListener('pointerup', onWinUp);

    loadScene(state.scene);
    return api;
  }

  function loadScene(name) {
    state.scene = name;
    sceneRoot.removeChildren();
    terminals = [];
    const g = new PIXI.Graphics(); sceneRoot.addChild(g);
    SC().draw(g);
    // Klemmen
    SC().terminals.forEach(([id, x, y, ader]) => {
      const t = new PIXI.Graphics();
      t.beginFill(COL.term).lineStyle(2, 0x0a1420).drawCircle(0, 0, 9).endFill();
      t.x = x; t.y = y;
      const tx = new PIXI.Text(ader, { fontFamily: 'monospace', fontSize: 9, fill: 0x0a1420, fontWeight: '700' });
      tx.anchor.set(0.5); t.addChild(tx);
      sceneRoot.addChild(t);
      terminals.push({ id, x, y, ader });
    });
    newTask();
  }

  /* ======================================================================
   * DUSPOL (persistent)
   * ====================================================================*/
  function buildDuspol() {
    const panel = new PIXI.Container(); panel.x = 320; panel.y = 470;
    const body = new PIXI.Graphics();
    body.lineStyle(2, 0x000, 0.4).beginFill(0x14202f).drawRoundedRect(0, 0, 280, 78, 12).endFill();
    body.beginFill(0xf5a623).drawRoundedRect(0, 0, 280, 20, 12).endFill();
    panel.addChild(body);
    const title = new PIXI.Text('DUSPOL — 2-poliger Spannungsprüfer', { fontFamily: 'Barlow, sans-serif', fontSize: 12, fill: 0x0a1420, fontWeight: '900' });
    title.x = 10; title.y = 3; panel.addChild(title);
    const leds = [];
    STEPS.slice(1).forEach((s, i) => { const g = new PIXI.Graphics(); g.x = 14 + i * 43; g.y = 34; panel.addChild(g); leds.push({ g, v: s }); });
    STEPS.slice(1).forEach((s, i) => { const t = new PIXI.Text(String(s), { fontFamily: 'monospace', fontSize: 9, fill: 0x88a0ba }); t.x = 14 + i * 43; t.y = 50; panel.addChild(t); });
    const reading = new PIXI.Text('— — —', { fontFamily: 'monospace', fontSize: 17, fill: 0x8fe6ff, fontWeight: '700' });
    reading.anchor.set(1, 0); reading.x = 268; reading.y = 46; panel.addChild(reading);
    app.stage.addChild(panel);
    readout = { leds, reading, panel };
    probes.red = makeProbe(0xe63030, START.red.x, START.red.y, '+');
    probes.black = makeProbe(0x0b1118, START.black.x, START.black.y, '−');
  }
  function makeProbe(color, x, y, sign) {
    const c = new PIXI.Container(); c.x = x; c.y = y;
    const g = new PIXI.Graphics();
    g.beginFill(color).lineStyle(3, 0xffffff, 0.85).drawCircle(0, 0, 13).endFill();
    g.lineStyle(0).beginFill(0xffffff, 0.9).drawCircle(0, 0, 4).endFill();
    c.addChild(g);
    const s = new PIXI.Text(sign, { fontFamily: 'Barlow, sans-serif', fontSize: 16, fill: 0xffffff, fontWeight: '900' });
    s.anchor.set(0.5); s.y = -26; c.addChild(s);
    c.snap = null; app.stage.addChild(c);
    return c;
  }

  /* ======================================================================
   * DRAG (native)
   * ====================================================================*/
  function toStage(clientX, clientY) {
    const r = app.view.getBoundingClientRect();
    return { x: (clientX - r.left) * (W / r.width), y: (clientY - r.top) * (H / r.height) };
  }
  function nearestTerm(x, y, r) {
    let best = null, bd = r;
    terminals.forEach(t => { const d = Math.hypot(t.x - x, t.y - y); if (d < bd) { bd = d; best = t; } });
    return best;
  }
  function onDown(e) {
    const p = toStage(e.clientX, e.clientY);
    const dr = Math.hypot(p.x - probes.red.x, p.y - probes.red.y);
    const db = Math.hypot(p.x - probes.black.x, p.y - probes.black.y);
    let pr = null;
    if (dr <= 32 && dr <= db) pr = probes.red; else if (db <= 32) pr = probes.black;
    if (!pr) return;
    drag = { p: pr, dx: pr.x - p.x, dy: pr.y - p.y };
    try { app.view.setPointerCapture(e.pointerId); } catch (_) {}
    e.preventDefault(); redraw();
  }
  function onWinMove(e) {
    if (!drag) return;
    const p = toStage(e.clientX, e.clientY);
    drag.p.x = p.x + drag.dx; drag.p.y = p.y + drag.dy; redraw();
  }
  function onWinUp() {
    if (!drag) return;
    const t = nearestTerm(drag.p.x, drag.p.y, 50);
    if (t) { drag.p.x = t.x; drag.p.y = t.y; drag.p.snap = t.id; } else drag.p.snap = null;
    drag = null; redraw();
  }

  /* ======================================================================
   * DYNAMISCHES ZEICHNEN + ANZEIGE
   * ====================================================================*/
  function redraw() {
    dynG.clear();
    const lp = SC().lamp;
    if (lampLit()) dynG.beginFill(0xffd34d, 0.9).drawCircle(lp.x, lp.y, 30).endFill().beginFill(0xffd34d, 0.25).drawCircle(lp.x, lp.y, 48).endFill();
    else dynG.beginFill(0x2a3a4e, 1).drawCircle(lp.x, lp.y, 26).endFill();
    dynG.lineStyle(4, 0xe63030, 1).moveTo(readout.panel.x + 45, readout.panel.y + 78).lineTo(probes.red.x, probes.red.y);
    dynG.lineStyle(4, 0x0b1118, 1).moveTo(readout.panel.x + 235, readout.panel.y + 78).lineTo(probes.black.x, probes.black.y);
    hiG.clear();
    if (drag) { const t = nearestTerm(drag.p.x, drag.p.y, 50); if (t) hiG.lineStyle(3, 0x00e0ff, 0.9).drawCircle(t.x, t.y, 15); }
    updateReadout();
  }
  function updateReadout() {
    const m = measure(probes.red.snap, probes.black.snap);
    readout.reading.text = (probes.red.snap && probes.black.snap) ? m.text : '— — —';
    readout.reading.style.fill = m.bad ? 0xff6b6b : 0x8fe6ff;
    readout.leds.forEach(led => {
      led.g.clear();
      const on = m.v != null && m.v >= led.v;
      const col = led.v <= 50 ? 0x3ddc84 : led.v <= 120 ? 0xf5a623 : 0xff5c5c;
      led.g.beginFill(on ? col : 0x24384f).drawRoundedRect(0, 0, 34, 12, 3).endFill();
    });
  }

  /* ======================================================================
   * AUFGABE / DIAGNOSE / BEDIENUNG
   * ====================================================================*/
  function newTask() {
    const pool = SC().pool;
    const active = pool[Math.floor(Math.random() * pool.length)];
    const keys = SC().faults;
    state.faults = {};
    keys.forEach(k => state.faults[k] = (k === active));
    state.active = active; state.taskDone = false;
    state.fuseOn = true; state.switchOn = true; state.fiArmed = true; state.p1 = 0; state.p2 = 0;
    state.brokenTrav = Math.random() < 0.5 ? 1 : 2;
    state.defSwitch = Math.random() < 0.5 ? 1 : 2;
    probes.red.x = START.red.x; probes.red.y = START.red.y; probes.red.snap = null;
    probes.black.x = START.black.x; probes.black.y = START.black.y; probes.black.snap = null;
    redraw();
    return active;
  }
  function diagnose(claim) {
    const correct = claim === state.active;
    if (correct && !state.taskDone) { state.score++; state.taskDone = true; }
    return { correct, done: state.taskDone, label: FAULTS[state.active] };
  }
  function toggle(key) {
    if (key === 'fuse') state.fuseOn = !state.fuseOn;
    else if (key === 'switch') state.switchOn = !state.switchOn;
    else if (key === 'fi') state.fiArmed = !state.fiArmed;
    else if (key === 'fitest') state.fiArmed = false;   // Prüftaste löst den FI aus
    else if (key === 'p1') state.p1 = state.p1 ? 0 : 1;
    else if (key === 'p2') state.p2 = state.p2 ? 0 : 1;
    redraw();
  }
  function opState(key) {
    if (key === 'fuse') return state.fuseOn ? 'EIN' : 'AUS';
    if (key === 'switch') return state.switchOn ? 'EIN' : 'AUS';
    if (key === 'fi') {
      const trips = state.faults.koerper && state.fuseOn && !state.faults.fuseBlown && state.fiArmed;
      return trips ? 'AUSGELÖST' : (state.fiArmed ? 'ein' : 'aus');
    }
    if (key === 'fitest') return '';
    if (key === 'p1') return 'Stellung ' + (state.p1 + 1);
    if (key === 'p2') return 'Stellung ' + (state.p2 + 1);
    return '';
  }
  function faultOptions() { return ['none'].concat(SC().faults).map(k => ({ key: k, label: FAULTS[k] })); }
  function controls() { return SC().controls; }
  function setScene(name) { if (SCENES[name]) loadScene(name); }
  function setState(patch) { Object.assign(state, patch); if (patch.faults) Object.assign(state.faults, patch.faults); redraw(); }

  const api = { init, setScene, setState, state, measure, pot, lampLit, newTask, diagnose,
    toggle, opState, faultOptions, controls, FAULTS, getScore: () => state.score,
    probeSnaps: () => ({ red: probes.red && probes.red.snap, black: probes.black && probes.black.snap }) };
  return api;
})();
