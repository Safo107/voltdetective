/* ============================================================================
 * VoltDetective — Werkstatt (Phase 1): PixiJS-Szene
 * ----------------------------------------------------------------------------
 * Sichtbare Verdrahtung (L braun / N blau / PE grün-gelb), Abzweigdose und ein
 * mit der Maus bewegbarer DUSPOL (2-poliger Spannungsprüfer), der die Spannung
 * zwischen zwei angetippten Klemmen live anzeigt.
 *
 * Reine Graphics (kein externes Artwork). Läuft über PIXI (global via UMD).
 * ==========================================================================*/
const Workshop = (() => {
  // VDE-nahe Aderfarben
  const COL = { L: 0x8a5a2b, N: 0x1f6fd0, PE: 0x2fa02f, PEy: 0xe8d21a, wall: 0x0f2035, term: 0xcfe6ff };
  const STEPS = [0, 12, 24, 50, 120, 230, 400];

  // Schaltungs-Zustand
  const state = {
    fuseOn: true,
    switchOn: true,
    faults: { pe: false, n: false, lampL: false }, // PE-Bruch, N-Bruch, Kabelbruch L->Lampe
  };

  let app, terminals = [], probes = {}, readoutEl, lampGlow, wiresG, drag = null;

  /* --- elektrische Potenziale (V) aus dem Zustand ------------------------
   * Rückgabe: Zahl oder null (potenzialfrei/"floating").
   * ----------------------------------------------------------------------*/
  function pot(id) {
    const Lsrc = state.fuseOn ? 230 : 0;
    const Sout = (state.fuseOn && state.switchOn) ? 230 : 0;
    switch (id) {
      case 'V_L': case 'D_L': case 'S_in': return Lsrc;
      case 'S_out':                        return Sout;
      case 'Lampe_L':                      return state.faults.lampL ? null : Sout;
      case 'V_N':                          return 0;
      case 'D_N': case 'Lampe_N':          return state.faults.n ? null : 0;
      case 'V_PE':                         return 0;
      case 'D_PE': case 'Lampe_PE':        return state.faults.pe ? null : 0;
      default:                             return 0;
    }
  }

  // Messung zwischen zwei Klemmen-ids
  function measure(a, b) {
    if (!a || !b) return { text: '— — —', v: null, bad: false };
    const pa = pot(a), pb = pot(b);
    if (pa === null || pb === null) return { text: 'kein Bezug', v: null, bad: true };
    const v = Math.abs(pa - pb);
    return { text: v + ' V', v, bad: false };
  }

  function lampLit() {
    const l = pot('Lampe_L'), n = pot('Lampe_N');
    return l !== null && n !== null && Math.abs(l - n) === 230;
  }

  /* --- Aufbau der PIXI-Szene ---------------------------------------------*/
  function init(container) {
    app = new PIXI.Application({ width: 900, height: 520, backgroundAlpha: 0, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true });
    app.view.style.width = '100%';
    app.view.style.height = 'auto';
    app.view.style.maxWidth = '900px';
    container.appendChild(app.view);

    app.stage.eventMode = 'static';
    app.stage.hitArea = app.screen;

    wiresG = new PIXI.Graphics();
    app.stage.addChild(wiresG);

    buildDevices();
    buildTerminals();
    buildDuspol();

    app.stage.on('pointermove', onMove);
    app.stage.on('pointerup', onUp);
    app.stage.on('pointerupoutside', onUp);

    redraw();
    return { app, state, measure, pot, lampLit, setState };
  }

  // Geräte-Kästen + Beschriftungen
  function buildDevices() {
    box(60, 150, 120, 240, 'Verteiler');
    label(120, 140, 'Verteiler + LS');
    circleBox(430, 240, 60, 'Abzweigdose');
    label(430, 150, 'Abzweigdose');
    box(390, 40, 90, 60, 'Schalter');
    label(435, 30, 'Schalter');
    // Leuchte
    lampGlow = new PIXI.Graphics();
    app.stage.addChild(lampGlow);
    box(760, 200, 90, 90, '');
    label(805, 190, 'Leuchte');
  }

  function box(x, y, w, h, title) {
    const g = new PIXI.Graphics();
    g.lineStyle(2, 0x2b4763, 1).beginFill(0x122237, 0.9).drawRoundedRect(x, y, w, h, 10).endFill();
    app.stage.addChild(g);
    if (title) label(x + w / 2, y + h / 2, title, 0x9fb4cc);
  }
  function circleBox(x, y, r, title) {
    const g = new PIXI.Graphics();
    g.lineStyle(2, 0x2b4763, 1).beginFill(0x122237, 0.9).drawCircle(x, y, r).endFill();
    app.stage.addChild(g);
  }
  function label(x, y, text, color) {
    const t = new PIXI.Text(text, { fontFamily: 'Barlow, sans-serif', fontSize: 13, fill: color || 0xcfe0f2, fontWeight: '600' });
    t.anchor.set(0.5); t.x = x; t.y = y; app.stage.addChild(t); return t;
  }

  // Klemmen (probierbare Knoten) mit Position + Ader-Zugehörigkeit
  function buildTerminals() {
    const defs = [
      ['V_L', 180, 200, 'L'], ['V_N', 180, 270, 'N'], ['V_PE', 180, 340, 'PE'],
      ['D_L', 400, 210, 'L'], ['D_N', 430, 300, 'N'], ['D_PE', 460, 210, 'PE'],
      ['S_in', 400, 100, 'L'], ['S_out', 460, 100, 'L'],
      ['Lampe_L', 760, 230, 'L'], ['Lampe_N', 760, 260, 'N'], ['Lampe_PE', 850, 245, 'PE'],
    ];
    defs.forEach(([id, x, y, ader]) => {
      const g = new PIXI.Graphics();
      g.beginFill(COL.term).lineStyle(2, 0x0a1420).drawCircle(0, 0, 8).endFill();
      g.x = x; g.y = y;
      const t = new PIXI.Text(ader, { fontFamily: 'monospace', fontSize: 10, fill: 0x0a1420, fontWeight: '700' });
      t.anchor.set(0.5); g.addChild(t);
      app.stage.addChild(g);
      terminals.push({ id, x, y, ader, node: g });
    });
  }

  // Duspol: Instrument + zwei bewegbare Prüfspitzen (rot/schwarz)
  function buildDuspol() {
    // Instrument-Panel unten links
    const panel = new PIXI.Container(); panel.x = 250; panel.y = 430;
    const body = new PIXI.Graphics();
    body.lineStyle(2, 0x000000, 0.4).beginFill(0x14202f).drawRoundedRect(0, 0, 220, 70, 10).endFill();
    body.beginFill(0xf5a623).drawRoundedRect(0, 0, 220, 18, 10).endFill();
    panel.addChild(body);
    const title = new PIXI.Text('DUSPOL', { fontFamily: 'Barlow, sans-serif', fontSize: 12, fill: 0x0a1420, fontWeight: '900' });
    title.x = 10; title.y = 2; panel.addChild(title);
    // LED-Balken
    const leds = [];
    STEPS.slice(1).forEach((s, i) => {
      const led = new PIXI.Graphics();
      led.x = 12 + i * 34; led.y = 30;
      panel.addChild(led); leds.push({ g: led, v: s });
    });
    const reading = new PIXI.Text('— — —', { fontFamily: 'monospace', fontSize: 15, fill: 0x8fe6ff, fontWeight: '700' });
    reading.x = 12; reading.y = 50; panel.addChild(reading);
    app.stage.addChild(panel);
    readoutEl = { leds, reading, panel };

    probes.red = makeProbe(0xe63030, 300, 400, 'red');
    probes.black = makeProbe(0x111820, 360, 400, 'black');
  }

  function makeProbe(color, x, y, key) {
    const c = new PIXI.Container(); c.x = x; c.y = y;
    const tip = new PIXI.Graphics();
    tip.beginFill(color).lineStyle(2, 0xffffff, 0.5).drawPolygon([0, 0, -6, -22, 6, -22]).endFill(); // Spitze
    tip.beginFill(color).drawRoundedRect(-7, -50, 14, 30, 4).endFill();                                // Griff
    c.addChild(tip);
    c.eventMode = 'static'; c.cursor = 'grab';
    c.snap = null; // aktuell angetippte Klemme
    c.on('pointerdown', (e) => { drag = { probe: c, dx: c.x - e.global.x, dy: c.y - e.global.y }; c.cursor = 'grabbing'; });
    return c;
  }

  function onMove(e) {
    if (!drag) return;
    drag.probe.x = e.global.x + drag.dx;
    drag.probe.y = e.global.y + drag.dy;
    redraw();
  }
  function onUp() {
    if (!drag) return;
    // an nächste Klemme im Umkreis schnappen
    const p = drag.probe; let best = null, bd = 30;
    terminals.forEach(t => { const d = Math.hypot(t.x - p.x, t.y - p.y); if (d < bd) { bd = d; best = t; } });
    if (best) { p.x = best.x; p.y = best.y; p.snap = best.id; } else p.snap = null;
    drag.probe.cursor = 'grab';
    drag = null;
    redraw();
  }

  /* --- Neuzeichnen von Adern, Leuchte, Duspol-Leitungen, Anzeige ---------*/
  function redraw() {
    // Adern (Potenzial-abhängig eingefärbt: dunkel wenn spannungslos/floating)
    wiresG.clear();
    const seg = (a, b, ader, id) => {
      const p = pot(id);
      const base = ader === 'PE' ? COL.PE : ader === 'N' ? COL.N : COL.L;
      const live = ader === 'L' && p === 230;
      wiresG.lineStyle(6, base, p === null ? 0.25 : 1);
      wiresG.moveTo(a[0], a[1]).lineTo(b[0], b[1]);
      if (live) { wiresG.lineStyle(2, 0xfff2a8, 0.9).moveTo(a[0], a[1]).lineTo(b[0], b[1]); }
    };
    // Verteiler -> Dose
    seg([180, 200], [400, 210], 'L', 'D_L');
    seg([180, 270], [430, 300], 'N', 'D_N');
    seg([180, 340], [460, 210], 'PE', 'D_PE');
    // Dose -> Schalter -> Dose (geschaltete L)
    seg([400, 210], [400, 100], 'L', 'D_L');
    seg([460, 100], [460, 210], 'L', 'S_out');
    // Dose -> Leuchte
    seg([460, 210], [760, 230], 'L', 'Lampe_L');
    seg([430, 300], [760, 260], 'N', 'Lampe_N');
    seg([460, 210], [850, 245], 'PE', 'Lampe_PE');

    // Leuchte-Glühen
    lampGlow.clear();
    if (lampLit()) lampGlow.beginFill(0xffd34d, 0.9).drawCircle(805, 245, 30).endFill().beginFill(0xffd34d, 0.25).drawCircle(805, 245, 46).endFill();
    else lampGlow.beginFill(0x2a3a4e, 1).drawCircle(805, 245, 26).endFill();

    // Duspol-Leitungen (rot/schwarz) vom Panel zu den Spitzen
    wiresG.lineStyle(4, 0xe63030, 1).moveTo(readoutEl.panel.x + 40, readoutEl.panel.y + 70).lineTo(probes.red.x, probes.red.y);
    wiresG.lineStyle(4, 0x111820, 1).moveTo(readoutEl.panel.x + 180, readoutEl.panel.y + 70).lineTo(probes.black.x, probes.black.y);

    updateReadout();
  }

  function updateReadout() {
    const m = measure(probes.red.snap, probes.black.snap);
    readoutEl.reading.text = (probes.red.snap && probes.black.snap) ? m.text : '— — —';
    readoutEl.reading.style.fill = m.bad ? 0xff6b6b : 0x8fe6ff;
    readoutEl.leds.forEach(led => {
      led.g.clear();
      const on = m.v != null && m.v >= led.v;
      const col = led.v <= 50 ? 0x3ddc84 : led.v <= 120 ? 0xf5a623 : 0xff5c5c;
      led.g.beginFill(on ? col : 0x24384f).drawRoundedRect(0, 0, 26, 12, 3).endFill();
    });
  }

  function setState(patch) { Object.assign(state, patch); if (patch.faults) Object.assign(state.faults, patch.faults); redraw(); }

  return { init, setState, state, measure, pot, lampLit };
})();
