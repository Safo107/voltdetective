/* ============================================================================
 * VoltDetective — Werkstatt (Phase 2): PixiJS-Szene mit Szenen-System
 * ----------------------------------------------------------------------------
 * - DUSPOL mit zwei Prüfspitzen (native Drag, Maus + Touch), Live-Spannung
 * - Adern IMMER gleich sichtbar — Fehler nur per Messung/FI erkennbar
 * - FI/RCD mit Prüftaste in JEDER Schaltung (löst bei Körperschluss aus)
 * - Mehrere Steckdosen je Schaltung (einzeln messbar, PE-Prüfung)
 * - Schaltungen: 'basis' (Grundstromkreis), 'wechsel' (Wechselschaltung)
 * ==========================================================================*/
const Workshop = (() => {
  const COL = { L: 0x8a5a2b, N: 0x1f6fd0, PE: 0x2fa02f, PEy: 0xe9dc1f, Lsw: 0x9aa0a8, jacket: 0x40454d, term: 0xdfeeff };
  const STEPS = [0, 12, 24, 50, 120, 230, 400];
  const W = 920, H = 560;
  const FAULTS = {
    none: 'Kein Fehler', fuseBlown: 'Sicherung defekt', pe: 'PE unterbrochen', n: 'N unterbrochen',
    lampL: 'Kabelbruch L → Leuchte', switchDefect: 'Schaltkontakt defekt', lnSwap: 'L / N vertauscht',
    koerper: 'Körperschluss (L an PE)', steckPE: 'PE fehlt an Steckdose', korrespondierend: 'Korrespondierende unterbrochen',
    uebergangswiderstand: 'Übergangswiderstand / lose Klemme (heiß)',
  };
  const START = { red: { x: 250, y: 520 }, black: { x: 660, y: 520 } };

  const state = {
    scene: 'basis', fuseOn: true, switchOn: true, fiArmed: true, fiTestTrip: false,
    p1: 0, p2: 0, pk: 0, faults: {}, brokenTrav: 1, brokenSeg: 'A1', defSwitch: 1, steckWhich: 'A', thermalOn: false, hotTerm: null,
    active: 'none', score: 0, taskDone: false,
  };

  let app, sceneRoot, dynG, hiG, probes = {}, readout, drag = null, terminals = [], fiDot = null;

  // GLOBAL: hat der Kreis Spannung? (FI löst bei Körperschluss aus)
  function powerOn() {
    return state.fuseOn && !state.faults.fuseBlown && state.fiArmed && !state.faults.koerper;
  }

  /* ======================================================================
   * SZENEN
   * ====================================================================*/
  const SCENES = {
    basis: {
      faults: ['fuseBlown', 'pe', 'n', 'lampL', 'switchDefect', 'lnSwap', 'koerper', 'steckPE', 'uebergangswiderstand'],
      pool:   ['fuseBlown', 'pe', 'n', 'lampL', 'switchDefect', 'lnSwap', 'koerper', 'steckPE', 'uebergangswiderstand', 'pe', 'n', 'none'],
      controls: [{ key: 'fuse', label: 'Sicherung' }, { key: 'fi', label: 'FI' }, { key: 'fitest', label: 'Prüftaste' }, { key: 'switch', label: 'Schalter' }],
      lamp: { L: 'Lampe_L', N: 'Lampe_N', x: 767, y: 300 },
      sockets: [{ id: 'A', x: 585, y: 60 }, { id: 'B', x: 705, y: 60 }],
      terminals: [
        ['V_L', 160, 235, 'L'], ['V_N', 160, 275, 'N'], ['V_PE', 160, 315, 'PE'],
        ['D_L', 372, 265, 'L'], ['D_N', 372, 300, 'N'], ['D_PE', 372, 335, 'PE'],
        ['D_Lsw', 492, 265, 'L'], ['S_in', 405, 160, 'L'], ['S_out', 455, 160, 'L'],
        ['Lampe_L', 720, 280, 'L'], ['Lampe_N', 720, 305, 'N'], ['Lampe_PE', 720, 330, 'PE'],
      ],
      draw(g) {
        boxG(g, 40, 150, 120, 250, 'Verteiler + LS');
        fiG(g, 52, 336, 96);
        g.lineStyle(2, 0x2b4763).beginFill(0x122237, 0.92).drawCircle(430, 300, 60).endFill();
        labelG(g, 430, 228, 'Abzweigdose');
        boxG(g, 395, 108, 70, 50, 'Schalter');
        boxG(g, 720, 255, 95, 90, 'Leuchte');
        cable(g, 160, 275, 372, 300, ['L', 'N', 'PE'], [-40, 0, 40]);
        cable(g, 430, 240, 430, 160, ['L', 'Lsw'], [-25, 25]);
        cable(g, 492, 300, 720, 300, ['Lsw', 'N', 'PE'], [-25, 0, 25]);
      },
      pot(id) {
        const Lsrc = powerOn() ? 230 : 0;
        const Lsw = (powerOn() && state.switchOn && !state.faults.switchDefect) ? 230 : 0;
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
          default: return 0;
        }
      },
    },

    wechsel: {
      faults: ['fuseBlown', 'pe', 'n', 'korrespondierend', 'switchDefect', 'koerper', 'steckPE', 'uebergangswiderstand'],
      pool:   ['fuseBlown', 'pe', 'n', 'korrespondierend', 'korrespondierend', 'switchDefect', 'koerper', 'steckPE', 'uebergangswiderstand', 'none'],
      controls: [{ key: 'fuse', label: 'Sicherung' }, { key: 'fi', label: 'FI' }, { key: 'fitest', label: 'Prüftaste' }, { key: 'p1', label: 'Schalter 1' }, { key: 'p2', label: 'Schalter 2' }],
      lamp: { L: 'W_LampeL', N: 'W_LampeN', x: 810, y: 300 },
      sockets: [{ id: 'A', x: 300, y: 55 }, { id: 'B', x: 470, y: 55 }],
      terminals: [
        ['V_L', 150, 255, 'L'], ['V_N', 150, 295, 'N'], ['V_PE', 150, 335, 'PE'],
        ['S1_com', 300, 250, 'L'], ['K_a1', 355, 190, 'L'], ['K_a2', 355, 320, 'L'],
        ['K_b1', 565, 190, 'L'], ['K_b2', 565, 320, 'L'], ['S2_com', 620, 250, 'L'],
        ['W_LampeL', 770, 280, 'L'], ['W_LampeN', 770, 305, 'N'], ['W_LampePE', 770, 330, 'PE'],
      ],
      draw(g) {
        boxG(g, 40, 170, 90, 230, 'Verteiler + LS');
        fiG(g, 46, 340, 78);
        boxG(g, 270, 200, 60, 70, 'Wechsel- schalter 1');
        boxG(g, 590, 200, 60, 70, 'Wechsel- schalter 2');
        boxG(g, 770, 255, 90, 90, 'Leuchte');
        line(g, 150, 255, 300, 250, 'L');
        line(g, 355, 190, 565, 190, 'Lsw'); line(g, 355, 320, 565, 320, 'Lsw');
        line(g, 300, 250, 355, 190, 'Lsw'); line(g, 300, 250, 355, 320, 'Lsw');
        line(g, 565, 190, 620, 250, 'Lsw'); line(g, 565, 320, 620, 250, 'Lsw');
        line(g, 620, 250, 770, 280, 'Lsw');
        line(g, 150, 295, 770, 305, 'N');
        line(g, 150, 335, 770, 330, 'PE');
      },
      pot(id) {
        const Lsrc = powerOn() ? 230 : 0;
        const N = state.faults.n ? null : 0;
        const PE = state.faults.pe ? null : 0;
        if (id === 'V_L') return Lsrc;
        if (id === 'V_N') return 0;
        if (id === 'V_PE') return 0;
        if (id === 'W_LampeN') return N;
        if (id === 'W_LampePE') return PE;
        const t1 = !(state.faults.korrespondierend && state.brokenTrav === 1);
        const t2 = !(state.faults.korrespondierend && state.brokenTrav === 2);
        const s1 = !(state.faults.switchDefect && state.defSwitch === 1);
        const s2 = !(state.faults.switchDefect && state.defSwitch === 2);
        const adj = {};
        const link = (a, b) => { (adj[a] = adj[a] || []).push(b); (adj[b] = adj[b] || []).push(a); };
        if (s1) link('S1_com', state.p1 === 0 ? 'K_a1' : 'K_a2');
        if (t1) link('K_a1', 'K_b1');
        if (t2) link('K_a2', 'K_b2');
        if (s2) link('S2_com', state.p2 === 0 ? 'K_b1' : 'K_b2');
        const reach = (start) => { const seen = new Set(), st = [start]; while (st.length) { const x = st.pop(); if (seen.has(x)) continue; seen.add(x); (adj[x] || []).forEach(y => st.push(y)); } return seen; };
        const src = reach('S1_com'), lampSet = reach('S2_com');
        const nodeV = n => (Lsrc && src.has(n)) ? 230 : (lampSet.has(n) ? 0 : (src.has(n) ? 0 : null));
        if (id === 'S1_com') return Lsrc;
        if (id === 'W_LampeL') return nodeV('S2_com');
        if (['K_a1', 'K_a2', 'K_b1', 'K_b2', 'S2_com'].indexOf(id) !== -1) return nodeV(id);
        return 0;
      },
    },

    kreuz: {
      faults: ['fuseBlown', 'pe', 'n', 'korrespondierend', 'switchDefect', 'koerper', 'steckPE', 'uebergangswiderstand'],
      pool:   ['fuseBlown', 'pe', 'n', 'korrespondierend', 'korrespondierend', 'switchDefect', 'koerper', 'steckPE', 'uebergangswiderstand', 'none'],
      controls: [{ key: 'fuse', label: 'Sicherung' }, { key: 'fi', label: 'FI' }, { key: 'fitest', label: 'Prüftaste' }, { key: 'p1', label: 'Schalter 1' }, { key: 'pk', label: 'Kreuzschalter' }, { key: 'p2', label: 'Schalter 2' }],
      lamp: { L: 'K_LampeL', N: 'K_LampeN', x: 790, y: 305 },
      sockets: [{ id: 'A', x: 320, y: 55 }, { id: 'B', x: 520, y: 55 }],
      terminals: [
        ['V_L', 150, 255, 'L'], ['V_N', 150, 295, 'N'], ['V_PE', 150, 335, 'PE'],
        ['S1_com', 225, 255, 'L'], ['A1', 300, 200, 'L'], ['A2', 300, 330, 'L'],
        ['B1', 520, 200, 'L'], ['B2', 520, 330, 'L'], ['S2_com', 600, 255, 'L'],
        ['K_LampeL', 760, 285, 'L'], ['K_LampeN', 760, 310, 'N'], ['K_LampePE', 760, 335, 'PE'],
      ],
      draw(g) {
        boxG(g, 40, 170, 80, 230, 'Verteiler + LS');
        fiG(g, 46, 340, 68);
        boxG(g, 190, 215, 55, 70, 'Wechsel- schalter 1');
        boxG(g, 385, 205, 70, 130, 'Kreuz- schalter');
        boxG(g, 570, 215, 55, 70, 'Wechsel- schalter 2');
        boxG(g, 745, 260, 90, 90, 'Leuchte');
        line(g, 150, 255, 225, 255, 'L');
        line(g, 225, 255, 300, 200, 'Lsw'); line(g, 225, 255, 300, 330, 'Lsw');
        line(g, 300, 200, 385, 225, 'Lsw'); line(g, 300, 330, 385, 315, 'Lsw');
        line(g, 455, 225, 520, 200, 'Lsw'); line(g, 455, 315, 520, 330, 'Lsw');
        line(g, 520, 200, 600, 255, 'Lsw'); line(g, 520, 330, 600, 255, 'Lsw');
        line(g, 600, 255, 760, 285, 'Lsw');
        line(g, 150, 295, 760, 310, 'N');
        line(g, 150, 335, 760, 335, 'PE');
      },
      pot(id) {
        const Lsrc = powerOn() ? 230 : 0;
        const N = state.faults.n ? null : 0;
        const PE = state.faults.pe ? null : 0;
        if (id === 'V_L') return Lsrc;
        if (id === 'V_N') return 0;
        if (id === 'V_PE') return 0;
        if (id === 'K_LampeN') return N;
        if (id === 'K_LampePE') return PE;
        const broken = state.faults.korrespondierend ? state.brokenSeg : null;
        const adj = {};
        const link = (a, b) => { if (a !== broken && b !== broken) { (adj[a] = adj[a] || []).push(b); (adj[b] = adj[b] || []).push(a); } };
        const sd = state.faults.switchDefect;
        if (!(sd && state.defSwitch === 1)) link('S1_com', state.p1 === 0 ? 'A1' : 'A2');
        if (!(sd && state.defSwitch === 2)) { if (state.pk === 0) { link('A1', 'B1'); link('A2', 'B2'); } else { link('A1', 'B2'); link('A2', 'B1'); } }
        if (!(sd && state.defSwitch === 3)) link('S2_com', state.p2 === 0 ? 'B1' : 'B2');
        const reach = (start) => { const seen = new Set(), st = [start]; while (st.length) { const x = st.pop(); if (seen.has(x)) continue; seen.add(x); (adj[x] || []).forEach(y => st.push(y)); } return seen; };
        const src = reach('S1_com'), lampSet = reach('S2_com');
        const nodeV = n => (Lsrc && src.has(n)) ? 230 : (lampSet.has(n) ? 0 : (src.has(n) ? 0 : null));
        if (id === 'S1_com') return Lsrc;
        if (id === 'K_LampeL') return nodeV('S2_com');
        if (['A1', 'A2', 'B1', 'B2', 'S2_com'].indexOf(id) !== -1) return nodeV(id);
        return 0;
      },
    },
  };

  function SC() { return SCENES[state.scene]; }
  function pot(id) { return id.indexOf('Steck') === 0 ? socketPot(id) : SC().pot(id); }
  // Steckdosen-Potenzial (ungeschaltet direkt an L/N/PE; je Dose eigener PE-Fehler möglich)
  function socketPot(id) {
    const parts = id.split('_'); const which = parts[0].replace('Steck', ''); const ader = parts[1];
    if (ader === 'L') return powerOn() ? 230 : 0;
    if (ader === 'N') return state.faults.n ? null : 0;
    const peGone = state.faults.pe || (state.faults.steckPE && state.steckWhich === which);
    return peGone ? null : 0;
  }
  function measure(a, b) {
    if (!a || !b) return { text: '— — —', v: null, bad: false };
    const pa = pot(a), pb = pot(b);
    if (pa === null || pb === null) return { text: 'kein Bezug', v: null, bad: true };
    return { text: Math.abs(pa - pb) + ' V', v: Math.abs(pa - pb), bad: false };
  }
  function lampLit() { const s = SC().lamp, l = pot(s.L), n = pot(s.N); return l !== null && n !== null && Math.abs(l - n) === 230; }

  /* ======================================================================
   * ZEICHEN-HELFER
   * ====================================================================*/
  function boxG(g, x, y, w, h, title) {
    g.lineStyle(2, 0x2b4763).beginFill(0x122237, 0.92).drawRoundedRect(x, y, w, h, 10).endFill();
    if (title) title.split(' ').forEach((ln, i) => labelG(g, x + w / 2, y - 14 + i * 14, ln));
  }
  function fiG(g, x, y, w) {
    g.lineStyle(1, 0x3a5474).beginFill(0x18324a).drawRoundedRect(x, y, w, 44, 6).endFill();
    labelG(g, x + w / 2, y + 15, 'FI / RCD');
    labelG(g, x + w / 2 - 6, y + 31, 'Prüftaste');
    fiDot = { x: x + w - 12, y: y + 31 };   // Anzeige-LED — dynamisch in redraw()
  }
  function socketG(g, cx, cy) {
    const r = 24;
    g.lineStyle(2, 0x2b4763).beginFill(0x1a2c42).drawRoundedRect(cx - r - 7, cy - r - 7, (r + 7) * 2, (r + 7) * 2, 9).endFill();
    g.lineStyle(2, 0x3a5474).beginFill(0x0f2035).drawCircle(cx, cy, r).endFill();
    g.lineStyle(4, 0x9fb4cc, 1).moveTo(cx - 14, cy - r + 3).lineTo(cx + 14, cy - r + 3).moveTo(cx - 14, cy + r - 3).lineTo(cx + 14, cy + r - 3);
    g.lineStyle(0).beginFill(0x0a1420).drawCircle(cx - 9, cy, 4).drawCircle(cx + 9, cy, 4).endFill();
    labelG(g, cx, cy - r - 16, 'Steckdose');
  }
  function labelG(g, x, y, text, color) {
    const t = new PIXI.Text(text, { fontFamily: 'Barlow, sans-serif', fontSize: 12, fill: color || 0xcfe0f2, fontWeight: '600' });
    t.anchor.set(0.5); t.x = x; t.y = y; sceneRoot.addChild(t);
  }
  function line(g, ax, ay, bx, by, ader) {
    const col = ader === 'N' ? COL.N : ader === 'PE' ? COL.PE : ader === 'Lsw' ? COL.Lsw : COL.L;
    g.lineStyle(4, col, 1).moveTo(ax, ay).lineTo(bx, by);
    if (ader === 'PE') g.lineStyle(2, COL.PEy, 1).moveTo(ax, ay).lineTo(bx, by);
  }
  function cable(g, ax, ay, bx, by, aders, termOff) {
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L, nx = -uy, ny = ux;
    const jax = ax + ux * L * 0.20, jay = ay + uy * L * 0.20, jbx = ax + ux * L * 0.80, jby = ay + uy * L * 0.80;
    g.lineStyle(22, COL.jacket, 1); g.moveTo(jax, jay).lineTo(jbx, jby);
    g.lineStyle(22, 0x565c66, 0.25); g.moveTo(jax, jay).lineTo(jbx, jby);
    const coreOff = aders.length === 2 ? [-6, 6] : [-7, 0, 7];
    aders.forEach((ader, i) => {
      const to = termOff[i], co = coreOff[i], base = ader === 'N' ? COL.N : ader === 'PE' ? COL.PE : ader === 'Lsw' ? COL.Lsw : COL.L;
      g.lineStyle(4, base, 1);
      g.moveTo(ax + nx * to, ay + ny * to).lineTo(jax + nx * co, jay + ny * co).lineTo(jbx + nx * co, jby + ny * co).lineTo(bx + nx * to, by + ny * to);
      if (ader === 'PE') g.lineStyle(2, COL.PEy, 1).moveTo(jax + nx * co, jay + ny * co).lineTo(jbx + nx * co, jby + ny * co);
    });
  }
  function addTerm(g, id, x, y, ader) {
    const t = new PIXI.Graphics();
    t.beginFill(COL.term).lineStyle(2, 0x0a1420).drawCircle(0, 0, 9).endFill(); t.x = x; t.y = y;
    const tx = new PIXI.Text(ader, { fontFamily: 'monospace', fontSize: 9, fill: 0x0a1420, fontWeight: '700' });
    tx.anchor.set(0.5); t.addChild(tx); sceneRoot.addChild(t);
    terminals.push({ id, x, y, ader });
  }

  /* ======================================================================
   * INIT / SZENE LADEN
   * ====================================================================*/
  function init(container) {
    app = new PIXI.Application({ width: W, height: H, backgroundAlpha: 0, antialias: true, resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true });
    app.view.style.width = '100%'; app.view.style.height = 'auto'; app.view.style.maxWidth = W + 'px';
    app.view.style.touchAction = 'none'; app.view.style.cursor = 'grab';
    container.appendChild(app.view);
    sceneRoot = new PIXI.Container(); app.stage.addChild(sceneRoot);
    dynG = new PIXI.Graphics(); app.stage.addChild(dynG);
    hiG = new PIXI.Graphics(); app.stage.addChild(hiG);
    buildDuspol();
    app.view.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onWinMove);
    window.addEventListener('pointerup', onWinUp);
    loadScene(state.scene);
    return api;
  }
  function loadScene(name) {
    state.scene = name;
    sceneRoot.removeChildren(); terminals = [];
    const g = new PIXI.Graphics(); sceneRoot.addChild(g);
    SC().draw(g);
    SC().terminals.forEach(([id, x, y, ader]) => addTerm(g, id, x, y, ader));
    (SC().sockets || []).forEach(s => {
      socketG(g, s.x, s.y);
      const ty = s.y + 46, xs = [s.x - 22, s.x, s.x + 22], ad = ['L', 'PE', 'N'];
      ad.forEach((ader, i) => { line(g, s.x, s.y + 24, xs[i], ty - 9, ader); addTerm(g, 'Steck' + s.id + '_' + ader, xs[i], ty, ader); });
    });
    newTask();
  }

  /* ======================================================================
   * DUSPOL + DRAG
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
    STEPS.slice(1).forEach((s, i) => { const gg = new PIXI.Graphics(); gg.x = 14 + i * 43; gg.y = 34; panel.addChild(gg); leds.push({ g: gg, v: s }); });
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
    g.lineStyle(0).beginFill(0xffffff, 0.9).drawCircle(0, 0, 4).endFill(); c.addChild(g);
    const s = new PIXI.Text(sign, { fontFamily: 'Barlow, sans-serif', fontSize: 16, fill: 0xffffff, fontWeight: '900' });
    s.anchor.set(0.5); s.y = -26; c.addChild(s); c.snap = null; app.stage.addChild(c); return c;
  }
  function toStage(cx, cy) { const r = app.view.getBoundingClientRect(); return { x: (cx - r.left) * (W / r.width), y: (cy - r.top) * (H / r.height) }; }
  function nearestTerm(x, y, r) { let best = null, bd = r; terminals.forEach(t => { const d = Math.hypot(t.x - x, t.y - y); if (d < bd) { bd = d; best = t; } }); return best; }
  function onDown(e) {
    const p = toStage(e.clientX, e.clientY);
    const dr = Math.hypot(p.x - probes.red.x, p.y - probes.red.y), db = Math.hypot(p.x - probes.black.x, p.y - probes.black.y);
    let pr = null; if (dr <= 32 && dr <= db) pr = probes.red; else if (db <= 32) pr = probes.black;
    if (!pr) return; drag = { p: pr, dx: pr.x - p.x, dy: pr.y - p.y };
    try { app.view.setPointerCapture(e.pointerId); } catch (_) {} e.preventDefault(); redraw();
  }
  function onWinMove(e) { if (!drag) return; const p = toStage(e.clientX, e.clientY); drag.p.x = p.x + drag.dx; drag.p.y = p.y + drag.dy; redraw(); }
  function onWinUp() { if (!drag) return; const t = nearestTerm(drag.p.x, drag.p.y, 50); if (t) { drag.p.x = t.x; drag.p.y = t.y; drag.p.snap = t.id; } else drag.p.snap = null; drag = null; redraw(); }

  /* ======================================================================
   * DYNAMIK + ANZEIGE
   * ====================================================================*/
  function redraw() {
    dynG.clear();
    if (state.thermalOn) {
      // Wärmebildkamera-Ansicht: Szene abgedunkelt, Hitze als Glut sichtbar
      dynG.beginFill(0x00081a, 0.66).drawRect(0, 0, W, H).endFill();
      terminals.forEach(t => {
        const hot = state.hotTerm === t.id && state.faults.uebergangswiderstand;
        if (hot) { dynG.beginFill(0xffdd33, 0.30).drawCircle(t.x, t.y, 42).endFill(); dynG.beginFill(0xff5a1e, 0.75).drawCircle(t.x, t.y, 24).endFill(); dynG.beginFill(0xffffff, 0.7).drawCircle(t.x, t.y, 9).endFill(); }
        else dynG.beginFill(0x1c5fb0, 0.40).drawCircle(t.x, t.y, 11).endFill();
      });
    } else {
      const lp = SC().lamp;
      if (lampLit()) dynG.beginFill(0xffd34d, 0.9).drawCircle(lp.x, lp.y, 28).endFill().beginFill(0xffd34d, 0.25).drawCircle(lp.x, lp.y, 44).endFill();
      else dynG.beginFill(0x2a3a4e, 1).drawCircle(lp.x, lp.y, 24).endFill();
    }
    // FI-Anzeige-LED: orange unter Spannung, dunkel wenn ausgelöst/aus
    if (fiDot) { const on = powerOn(); if (on) dynG.beginFill(0xf5a623, 0.35).drawCircle(fiDot.x, fiDot.y, 11).endFill(); dynG.beginFill(on ? 0xf5a623 : 0x33465c, 1).drawCircle(fiDot.x, fiDot.y, 5).endFill(); }
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
    readout.leds.forEach(led => { led.g.clear(); const on = m.v != null && m.v >= led.v; const col = led.v <= 50 ? 0x3ddc84 : led.v <= 120 ? 0xf5a623 : 0xff5c5c; led.g.beginFill(on ? col : 0x24384f).drawRoundedRect(0, 0, 34, 12, 3).endFill(); });
  }

  /* ======================================================================
   * AUFGABE / DIAGNOSE / BEDIENUNG
   * ====================================================================*/
  function newTask() {
    const pool = SC().pool, active = pool[Math.floor(Math.random() * pool.length)], keys = SC().faults;
    state.faults = {}; keys.forEach(k => state.faults[k] = (k === active));
    state.active = active; state.taskDone = false;
    state.fuseOn = true; state.switchOn = true; state.fiArmed = true; state.fiTestTrip = false; state.p1 = 0; state.p2 = 0; state.pk = 0;
    state.brokenTrav = Math.random() < 0.5 ? 1 : 2; state.brokenSeg = ['A1', 'A2', 'B1', 'B2'][Math.floor(Math.random() * 4)]; state.defSwitch = 1 + Math.floor(Math.random() * 3);
    const socks = (SC().sockets || []); state.steckWhich = socks.length ? socks[Math.floor(Math.random() * socks.length)].id : 'A';
    if (active === 'uebergangswiderstand') { const cur = terminals.filter(t => t.ader === 'L' || t.ader === 'N'); state.hotTerm = cur.length ? cur[Math.floor(Math.random() * cur.length)].id : null; } else state.hotTerm = null;
    probes.red.x = START.red.x; probes.red.y = START.red.y; probes.red.snap = null;
    probes.black.x = START.black.x; probes.black.y = START.black.y; probes.black.snap = null;
    redraw(); return active;
  }
  function diagnose(claim) { const correct = claim === state.active; if (correct && !state.taskDone) { state.score++; state.taskDone = true; if (typeof Board !== 'undefined') Board.add('werkstatt'); } return { correct, done: state.taskDone, label: FAULTS[state.active] }; }
  function toggle(key) {
    if (key === 'fuse') state.fuseOn = !state.fuseOn;
    else if (key === 'switch') state.switchOn = !state.switchOn;
    else if (key === 'fi') { state.fiArmed = !state.fiArmed; state.fiTestTrip = false; }
    else if (key === 'fitest') { state.fiArmed = false; state.fiTestTrip = true; }   // Prüftaste löst FI aus
    else if (key === 'p1') state.p1 = state.p1 ? 0 : 1;
    else if (key === 'p2') state.p2 = state.p2 ? 0 : 1;
    else if (key === 'pk') state.pk = state.pk ? 0 : 1;
    redraw();
  }
  function opState(key) {
    if (key === 'fuse') return state.fuseOn ? 'EIN' : 'AUS';
    if (key === 'switch') return state.switchOn ? 'EIN' : 'AUS';
    if (key === 'fi') {
      const koerperTrip = state.faults.koerper && state.fuseOn && !state.faults.fuseBlown && state.fiArmed;
      if (koerperTrip || state.fiTestTrip) return 'AUSGELÖST';
      return state.fiArmed ? 'ein' : 'aus';
    }
    if (key === 'fitest') return '';
    if (key === 'p1') return 'Stellung ' + (state.p1 + 1);
    if (key === 'p2') return 'Stellung ' + (state.p2 + 1);
    if (key === 'pk') return 'Stellung ' + (state.pk + 1);
    return '';
  }
  function faultOptions() { return ['none'].concat(SC().faults).map(k => ({ key: k, label: FAULTS[k] })); }
  function controls() { return SC().controls; }
  function toggleThermal() { state.thermalOn = !state.thermalOn; redraw(); return state.thermalOn; }
  function setScene(name) { if (SCENES[name]) loadScene(name); }
  function setState(patch) { Object.assign(state, patch); if (patch.faults) Object.assign(state.faults, patch.faults); redraw(); }

  const api = { init, setScene, setState, state, measure, pot, lampLit, newTask, diagnose, toggle, toggleThermal, opState, faultOptions, controls, FAULTS, getScore: () => state.score, probeSnaps: () => ({ red: probes.red && probes.red.snap, black: probes.black && probes.black.snap }) };
  return api;
})();
