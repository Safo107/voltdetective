/* ============================================================================
 * VoltDetective v2 — Fehler-Generator (Runden-Aufbau)
 * ----------------------------------------------------------------------------
 * Trennt sauber zwischen:
 *   (a) ECHTEN Defekten  -> Glühwendel/Kabel kaputt -> Diagnoseliste
 *   (b) der 30%-TRAP     -> Sicherung/Schalter nur AUSGESCHALTET -> KEIN Defekt
 *
 * Lernziel des Spielers: erst Sichtprüfung/Einschalten, DANN messen.
 * ==========================================================================*/
const Faults = (() => {

  const chance = p => Math.random() < p;
  const pick   = arr => arr[Math.floor(Math.random() * arr.length)];

  function generateRound(circuit) {
    // 1) Alles auf intakt + eingeschaltet zurücksetzen
    circuit.fuse.isOn = true;
    circuit.switches.forEach(s => s.channels.forEach(c => (c.isOn = true)));
    circuit.lamps.forEach(l => (l.filamentIntact = true));
    Object.values(circuit.wires).forEach(w => (w.intact = true));

    const realDefects = []; // nur echte Schäden

    // 2) Echte Defekte injizieren (mit Deckel)
    for (const lamp of shuffle(circuit.lamps.slice())) {
      if (realDefects.length >= CONFIG.maxRealDefects) break;
      if (chance(CONFIG.probabilities.filamentDefect)) {
        lamp.filamentIntact = false;
        realDefects.push({ lampId: lamp.id, type: 'filament' });
      } else if (chance(CONFIG.probabilities.wireDefect)) {
        circuit.wires[lamp.wireId].intact = false;
        realDefects.push({ lampId: lamp.id, type: 'wire' });
      }
    }

    // Mind. 1 echter Defekt, damit die Runde etwas zu finden hat
    if (CONFIG.guaranteeOneDefect && realDefects.length === 0) {
      const lamp = pick(circuit.lamps);
      lamp.filamentIntact = false;
      realDefects.push({ lampId: lamp.id, type: 'filament' });
    }

    // 3) 30%-TRAP: Sicherung ODER ein Schalter/Wippe nur ausschalten
    let trap = null;
    if (chance(CONFIG.probabilities.switchedOffTrap)) {
      const options = [{ kind: 'fuse' }];
      circuit.switches.forEach(s =>
        s.channels.forEach(c =>
          options.push({ kind: 'channel', switchId: s.id, channelId: c.id })
        )
      );
      const choice = pick(options);
      if (choice.kind === 'fuse') {
        circuit.fuse.isOn = false;
        trap = { kind: 'fuse', label: circuit.fuse.label };
      } else {
        const ch = Simulation.getChannel(circuit, choice.switchId, choice.channelId);
        ch.isOn = false;
        trap = {
          kind: 'channel', switchId: choice.switchId,
          channelId: choice.channelId, label: ch.label,
        };
      }
    }

    return { realDefects, trap };
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  return { generateRound };
})();
