/* ============================================================================
 * VoltDetective — Werkstatt (Phase 1): PixiJS-Szene
 * ----------------------------------------------------------------------------
 * - Mantelkabel (NYM) mit sichtbaren Adern L/N/PE, an den Klemmen einzeln messbar
 * - DUSPOL mit zwei Prüfspitzen, die man mit der Maus an die Klemmen zieht
 *   (rot -> z.B. L, schwarz -> N); Spannung erscheint live am Gerät
 * - VERSTECKTE Fehler-Aufgabe: Fehler wird zugeteilt, Spieler muss ihn finden
 * ==========================================================================*/
const Workshop = (() => {
  const COL = { L: 0x8a5a2b, N: 0x1f6fd0, PE: 0x2fa02f, PEy: 0xe9dc1f, jacket: 0x40454d, term: 0xdfeeff };
  const STEPS = [0, 12, 24, 50, 120, 230, 400];
  const FAULTS = {
    none:         'Kein Fehler',
    pe:           'PE unterbrochen',
    n:            'N unterbrochen',
    lampL:        'Kabelbruch L → Leuchte',
    switchDefect: 'Schaltkontakt defekt',
  };

  const state = {
    fuseOn: true, switchOn: true,
    faults: { pe: false, n: false, lampL: false, switchDefect: false },
    active: 'none', score: 0, taskDone: false,
  };

  let app, terminals = [], probes = {}, readout, lampGlow, sceneG, hiG, drag = null;

  /* --- Potenziale (V) aus dem Zustand; null = potenzialfrei -------------*/
  function pot(id) {
    const Lsrc = state.fuseOn ? 230 : 0;
    const Lsw  = (state.fuseOn && state.switchOn && !state.faults.switchDefect) ? 230 : 0;
    switch (id) {
      case 'V_L': case 'D_L': case 'S_in':      return Lsrc;
      case 'S_out': case 'D_Lsw':               return Lsw;
      case 'Lampe_L':                           return state.faults.lampL ? null : Lsw;
      case 'V_N':                               return 0;
      case 'D_N': case 'Lampe_N':               return state.faults.n ? null : 0;
      case 'V_PE':                              return 0;
      case 'D_PE': case 'Lampe_PE':             return state.faults.pe ? null : 0;
      default:                                  return 0;
    }
  }
  function measure(a, b) {
    if (!a || !b) return { text: '— — —', v: null, bad: false };
    const pa = pot(a), pb = pot(b);
    if (pa === null || pb === null) return { text: 'kein Bezug', v: null, bad: true };
    return { text: Math.abs(pa - pb) + ' V', v: Math.abs(pa - pb), bad: false };
  }
  function lampLit() {
    const l = pot('Lampe_L'), n = pot('Lampe_N');
    return l !== null && n !== null && Math.abs(l - n) === 230;
  }

  /* --- Init / Szene ------------------------------------------------------*/
  function init(container) {
    app = new PIXI.Application({ width: 920, height: 560, backgroundAlpha: 0, antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true });
    app.view.style.width = '100%'; app.view.style.height = 'auto'; app.view.style.maxWidth = '920px';
    container.appendChild(app.view);
    app.stage.eventMode = 'static'; app.stage.hitArea = app.screen;

    sceneG = new PIXI.Graphics(); app.stage.addChild(sceneG);   // Kabel/Adern
    hiG = new PIXI.Graphics(); app.stage.addChild(hiG);         // Klemmen-Highlight
    lampGlow = new PIXI.Graphics(); app.stage.addChild(lampGlow);

    buildDevices();
    buildTerminals();
    buildDuspol();

    app.stage.on('pointermove', onMove);
    app.stage.on('pointerup', onUp);
    app.stage.on('pointerupoutside', onUp);

    newTask();
    return api;
  }

  function box(x, y, w, h, title) {
    const g = new PIXI.Graphics();
    g.lineStyle(2, 0x2b4763).beginFill(0x122237, 0.92).drawRoundedRect(x, y, w, h, 10).endFill();
    app.stage.addChild(g);
    if (title) label(x + w / 2, y - 12, title);
  }
  function label(x, y, text, color) {
    const t = new PIXI.Text(text, { fontFamily: 'Barlow, sans-serif', fontSize: 13, fill: color || 0xcfe0f2, fontWeight: '600' });
    t.anchor.set(0.5); t.x = x; t.y = y; app.stage.addChild(t); return t;
  }
  function buildDevices() {
    box(40, 150, 120, 250, 'Verteiler + LS');
    // Abzweigdose
    const d = new PIXI.Graphics();
    d.lineStyle(2, 0x2b4763).beginFill(0x122237, 0.92).drawCircle(430, 275, 64).endFill();
    app.stage.addChild(d); label(430, 200, 'Abzweigdose');
    box(395, 78, 70, 54, 'Schalter');
    box(720, 225, 95, 95, 'Leuchte');
  }

  // Klemmen (einzeln messbare Knoten)
  function buildTerminals() {
    const defs = [
      ['V_L', 160, 235, 'L'], ['V_N', 160, 275, 'N'], ['V_PE', 160, 315, 'PE'],
      ['D_L', 372, 240, 'L'], ['D_N', 372, 275, 'N'], ['D_PE', 372, 310, 'PE'],
      ['D_Lsw', 492, 240, 'L'],
      ['S_in', 405, 132, 'L'], ['S_out', 455, 132, 'L'],
      ['Lampe_L', 720, 250, 'L'], ['Lampe_N', 720, 275, 'N'], ['Lampe_PE', 720, 300, 'PE'],
    ];
    defs.forEach(([id, x, y, ader]) => {
      const g = new PIXI.Graphics();
      g.beginFill(COL.term).lineStyle(2, 0x0a1420).drawCircle(0, 0, 9).endFill();
      g.x = x; g.y = y;
      const t = new PIXI.Text(ader, { fontFamily: 'monospace', fontSize: 9, fill: 0x0a1420, fontWeight: '700' });
      t.anchor.set(0.5); g.addChild(t);
      app.stage.addChild(g);
      terminals.push({ id, x, y, ader });
    });
  }

  /* --- DUSPOL ------------------------------------------------------------*/
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

    probes.red = makeProbe(0xe63030, 250, 520, '+');
    probes.black = makeProbe(0x0b1118, 660, 520, '−');
    label(250, 545, 'rote Spitze ziehen', 0x9fb4cc).scale.set(0.9);
    label(660, 545, 'schwarze Spitze ziehen', 0x9fb4cc).scale.set(0.9);
  }
  function makeProbe(color, x, y, sign) {
    const c = new PIXI.Container(); c.x = x; c.y = y;
    const g = new PIXI.Graphics();
    g.beginFill(color).lineStyle(3, 0xffffff, 0.85).drawCircle(0, 0, 13).endFill();          // Klemm-Spitze
    g.lineStyle(0).beginFill(0xffffff, 0.9).drawCircle(0, 0, 4).endFill();                    // Kontaktpunkt
    c.addChild(g);
    const s = new PIXI.Text(sign, { fontFamily: 'Barlow, sans-serif', fontSize: 16, fill: 0xffffff, fontWeight: '900' });
    s.anchor.set(0.5); s.y = -26; c.addChild(s);
    c.eventMode = 'static'; c.cursor = 'grab';
    c.hitArea = new PIXI.Circle(0, 0, 26);   // große Greiffläche
    c.snap = null;
    c.on('pointerdown', (e) => { drag = { p: c, dx: c.x - e.global.x, dy: c.y - e.global.y }; c.cursor = 'grabbing'; c.zIndex = 10; });
    return c;
  }
  function nearestTerm(p, r) {
    let best = null, bd = r;
    terminals.forEach(t => { const d = Math.hypot(t.x - p.x, t.y - p.y); if (d < bd) { bd = d; best = t; } });
    return best;
  }
  function onMove(e) {
    if (!drag) return;
    drag.p.x = e.global.x + drag.dx; drag.p.y = e.global.y + drag.dy;
    redraw();
  }
  function onUp() {
    if (!drag) return;
    const t = nearestTerm(drag.p, 48);
    if (t) { drag.p.x = t.x; drag.p.y = t.y; drag.p.snap = t.id; } else drag.p.snap = null;
    drag.p.cursor = 'grab'; drag = null; redraw();
  }

  /* --- Kabel mit Mantel + Adern -----------------------------------------*/
  function cable(g, ax, ay, bx, by, ids, termOff) {
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const jax = ax + ux * L * 0.20, jay = ay + uy * L * 0.20;
    const jbx = ax + ux * L * 0.80, jby = ay + uy * L * 0.80;
    // Mantel
    g.lineStyle(22, COL.jacket, 1); g.moveTo(jax, jay).lineTo(jbx, jby);
    g.lineStyle(22, 0x565c66, 0.25); g.moveTo(jax, jay).lineTo(jbx, jby);
    const coreOff = [-7, 0, 7];
    ids.forEach((id, i) => {
      const p = pot(id), a = p === null ? 0.28 : 1, to = termOff[i], co = coreOff[i];
      const base = i === 0 ? COL.L : i === 1 ? COL.N : COL.PE;
      g.lineStyle(4, base, a);
      g.moveTo(ax + nx * to, ay + ny * to).lineTo(jax + nx * co, jay + ny * co)
       .lineTo(jbx + nx * co, jby + ny * co).lineTo(bx + nx * to, by + ny * to);
      if (i === 2) { g.lineStyle(2, COL.PEy, a).moveTo(jax + nx * co, jay + ny * co).lineTo(jbx + nx * co, jby + ny * co); } // PE grün-gelb
      if (i === 0 && p === 230) { g.lineStyle(2, 0xfff2a8, 0.9).moveTo(jax + nx * co, jay + ny * co).lineTo(jbx + nx * co, jby + ny * co); }
    });
  }

  function redraw() {
    sceneG.clear();
    // Kabel A: Verteiler -> Dose (L/N/PE)
    cable(sceneG, 160, 275, 372, 275, ['D_L', 'D_N', 'D_PE'], [-40, 0, 40]);
    // Kabel B: Dose -> Schalter (2 Adern: L hin, L geschaltet zurück)
    cable(sceneG, 430, 213, 430, 132, ['S_in', 'S_out'], [-25, 25]);
    // Kabel C: Dose -> Leuchte (geschaltete L / N / PE)
    cable(sceneG, 492, 275, 720, 275, ['Lampe_L', 'Lampe_N', 'Lampe_PE'], [-25, 0, 25]);

    // Leuchte
    lampGlow.clear();
    if (lampLit()) lampGlow.beginFill(0xffd34d, 0.9).drawCircle(767, 272, 30).endFill().beginFill(0xffd34d, 0.25).drawCircle(767, 272, 48).endFill();
    else lampGlow.beginFill(0x2a3a4e, 1).drawCircle(767, 272, 26).endFill();

    // Duspol-Leitungen
    sceneG.lineStyle(4, 0xe63030, 1).moveTo(readout.panel.x + 45, readout.panel.y + 78).lineTo(probes.red.x, probes.red.y);
    sceneG.lineStyle(4, 0x0b1118, 1).moveTo(readout.panel.x + 235, readout.panel.y + 78).lineTo(probes.black.x, probes.black.y);

    // Highlight der Zielklemme beim Ziehen
    hiG.clear();
    if (drag) { const t = nearestTerm(drag.p, 48); if (t) hiG.lineStyle(3, 0x00e0ff, 0.9).drawCircle(t.x, t.y, 15); }

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

  /* --- Aufgabe / Diagnose ------------------------------------------------*/
  function newTask() {
    // versteckten Fehler zuteilen (gewichtet: gelegentlich "kein Fehler")
    const pool = ['pe', 'n', 'lampL', 'switchDefect', 'pe', 'n', 'lampL', 'none'];
    const active = pool[Math.floor(Math.random() * pool.length)];
    state.faults = { pe: active === 'pe', n: active === 'n', lampL: active === 'lampL', switchDefect: active === 'switchDefect' };
    state.active = active; state.taskDone = false;
    state.fuseOn = true; state.switchOn = true;
    // Prüfspitzen lösen
    probes.red.snap = null; probes.black.snap = null;
    redraw();
    return active;
  }
  function diagnose(claim) {
    const correct = claim === state.active;
    if (correct && !state.taskDone) { state.score++; state.taskDone = true; }
    return { correct, done: state.taskDone, label: FAULTS[state.active] };
  }
  function setState(patch) { Object.assign(state, patch); if (patch.faults) Object.assign(state.faults, patch.faults); redraw(); }

  const api = { init, setState, state, measure, pot, lampLit, newTask, diagnose, FAULTS, getScore: () => state.score,
    probeSnaps: () => ({ red: probes.red && probes.red.snap, black: probes.black && probes.black.snap }) };
  return api;
})();
