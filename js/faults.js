/* ============================================================================
 * VoltDetective v2 — Fehler-Generator (Runden-Aufbau)
 * ----------------------------------------------------------------------------
 * Verteilt echte Fehler über den GANZEN Kreis (nicht nur an Lampen) und trennt
 * sie sauber von der 30%-Falle (Bauteil nur ausgeschaltet = KEIN Defekt).
 * ==========================================================================*/
const Faults = (() => {

  const chance = p => Math.random() < p;
  const pick   = arr => arr[Math.floor(Math.random() * arr.length)];

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function generateRound(circuit) {
    Simulation.resetCircuit(circuit);
    const P = CONFIG.probabilities;

    // Kandidaten: Bauteil -> mögliche Fehlerart
    const candidates = [];
    candidates.push({ el: circuit.fuse,     type: 'sicherung_defekt', prob: P.faults.sicherung_defekt });
    candidates.push({ el: circuit.feeds.S1, type: 'klemme_lose',      prob: P.faults.klemme_lose });
    candidates.push({ el: circuit.feeds.S2, type: 'klemme_lose',      prob: P.faults.klemme_lose });
    circuit.switches.forEach(s => s.channels.forEach(c =>
      candidates.push({ el: c, type: 'schalter_defekt', prob: P.faults.schalter_defekt })));
    circuit.lamps.forEach(l => {
      candidates.push({ el: l.wire,     type: 'kabelbruch',     prob: P.faults.kabelbruch, wire: true });
      candidates.push({ el: l.socket,   type: 'fassung_defekt', prob: P.faults.fassung_defekt });
      candidates.push({ el: l.filament, type: 'gluehwendel',    prob: P.faults.gluehwendel });
    });

    const realFaults = [];
    let shortUsed = false;

    for (const c of shuffle(candidates)) {
      if (realFaults.length >= CONFIG.maxRealFaults) break;
      if (c.el.fault) continue;
      if (!chance(c.prob)) continue;

      let type = c.type;
      // Leitung: evtl. Kurzschluss statt Kabelbruch (max. 1 Kurzschluss/Runde)
      if (c.wire && !shortUsed && chance(P.shortInsteadOfBreak)) { type = 'kurzschluss'; shortUsed = true; }

      c.el.fault = type;
      realFaults.push({ id: c.el.id, type, label: c.el.label });
    }

    // Mind. 1 echter Fehler, damit es etwas zu finden gibt
    while (realFaults.length < CONFIG.minRealFaults) {
      const lamp = pick(circuit.lamps);
      if (lamp.filament.fault) continue;
      lamp.filament.fault = 'gluehwendel';
      realFaults.push({ id: lamp.filament.id, type: 'gluehwendel', label: lamp.filament.label });
    }

    // 30%-FALLE: Sicherung ODER ein Schalter/Wippe nur AUSSCHALTEN (kein Defekt)
    let trap = null;
    if (chance(P.switchedOffTrap)) {
      const opts = [circuit.fuse, ...circuit.switches.flatMap(s => s.channels)];
      const el = pick(opts);
      el.isOn = false;
      trap = { id: el.id, label: el.label };
    }

    return { realFaults, trap };
  }

  return { generateRound };
})();
