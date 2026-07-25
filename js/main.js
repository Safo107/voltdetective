/* ============================================================================
 * VoltDetective v2 — Bootstrap & Spiel-Zustand
 * ==========================================================================*/
const Game = {
  circuit: null,
  round: null,        // { realFaults:[{id,type,label}], trap }
  found: [],          // korrekt diagnostizierte (=behobene) Fehler
  wrong: 0,           // Anzahl Fehldiagnosen (für Feedback/Scoring)
  solved: false,
  stats: { played: 0, solved: 0 },   // lokal gespeichert (eg_vd_stats)

  init() {
    this.loadStats();
    this.circuit = Simulation.createCircuit();
    this.newRound(true);
    UI.init(this);
  },

  newRound(silent) {
    this.round = Faults.generateRound(this.circuit);
    this.found = [];
    this.wrong = 0;
    this.solved = false;
    this.stats.played++;
    this.saveStats();
    if (!silent) UI.refresh();
  },

  /* --- Diagnose aus der Detail-Ansicht einer Lampe -----------------------
   * claimed = Fehlerart-Schlüssel ODER 'none' ("kein Defekt, nur aus").
   * Liefert ein Ergebnis-Objekt, das die UI in Feedback übersetzt.
   * ----------------------------------------------------------------------*/
  diagnose(lamp, claimed) {
    const b = Simulation.firstBlock(this.circuit, lamp);

    if (claimed === 'none') {
      if (!b || b.kind === 'off') return { result: 'ok-none' };
      return { result: 'wrong-none' };
    }
    if (!b || b.kind === 'off')  return { result: 'trap' };        // Meister-Falle
    if (b.kind === 'short')      return { result: 'short-elsewhere' };

    // b.kind === 'fault'
    if (claimed === b.type) {
      this.repair(b.el, b.type);
      return { result: 'correct', type: b.type };
    }
    this.wrong++;
    return { result: 'wrong' };
  },

  // Korrekte Diagnose behebt den Fehler -> Lampe wird wieder intakt.
  repair(el, type) {
    el.fault = null;
    this.found.push({ id: el.id, type, label: el.label });
    this.evaluateSolved();
  },

  foundCount() { return this.found.length; },
  totalFaults() { return this.round.realFaults.length; },

  // Gelöst, wenn ALLE Lampen leuchten (= alle Fehler behoben UND alle nötigen
  // Schalter/Sicherung eingeschaltet, d.h. auch die 30%-Falle aufgelöst).
  evaluateSolved() {
    const lit = Simulation.evaluate(this.circuit);
    const was = this.solved;
    this.solved = this.circuit.lamps.every(l => lit[l.id]);
    if (this.solved && !was) { this.stats.solved++; this.saveStats(); if (typeof Board !== 'undefined') Board.add('lampen'); }
  },

  onChange() { this.evaluateSolved(); UI.refresh(); },

  /* --- lokale Statistik (nur im Browser) --------------------------------*/
  loadStats() {
    try { const s = JSON.parse(localStorage.getItem('eg_vd_stats')); if (s) this.stats = s; } catch (e) {}
  },
  saveStats() {
    try { localStorage.setItem('eg_vd_stats', JSON.stringify(this.stats)); } catch (e) {}
  },
};

window.addEventListener('DOMContentLoaded', () => Game.init());
