/* ============================================================================
 * VoltDetective v2 — Bootstrap & Spiel-Zustand
 * ==========================================================================*/
const Game = {
  circuit: null,
  round: null,        // { realDefects, trap }
  diagnoses: {},      // lampId -> 'filament' | 'wire' | 'none'
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
    this.diagnoses = {};
    this.solved = false;
    this.stats.played++;
    this.saveStats();
    if (!silent) UI.refresh();
  },

  setDiagnosis(lampId, type) { this.diagnoses[lampId] = type; },

  // Anzahl echter Defekte, die korrekt diagnostiziert wurden
  correctDiagnosisCount() {
    return this.round.realDefects.filter(d => {
      const lamp = this.circuit.lamps.find(l => l.id === d.lampId);
      return this.diagnoses[d.lampId] === Simulation.actualDefect(this.circuit, lamp);
    }).length;
  },

  // Runde gelöst, wenn: (1) alle echten Defekte korrekt diagnostiziert,
  // (2) keine falsche Diagnose eingetragen, (3) die 30%-Trap aufgelöst ist,
  // d.h. alle prinzipiell intakten Lampen leuchten wieder.
  evaluateSolved() {
    const allDefectsFound =
      this.correctDiagnosisCount() === this.round.realDefects.length;

    const noFalsePositive = Object.entries(this.diagnoses).every(([lampId, type]) => {
      if (!type || type === 'none') return true;
      const lamp = this.circuit.lamps.find(l => l.id === lampId);
      return Simulation.actualDefect(this.circuit, lamp) === type;
    });

    const lit = Simulation.evaluate(this.circuit);
    const trapResolved = this.circuit.lamps.every(lamp => {
      const hasRealDefect = Simulation.actualDefect(this.circuit, lamp) !== null;
      return hasRealDefect || lit[lamp.id]; // intakte Lampen müssen leuchten
    });

    const wasSolved = this.solved;
    this.solved = allDefectsFound && noFalsePositive && trapResolved;
    if (this.solved && !wasSolved) { this.stats.solved++; this.saveStats(); }
  },

  // Zentraler Änderungs-Hook: neu auswerten + UI aktualisieren (sofort)
  onChange() {
    this.evaluateSolved();
    UI.refresh();
  },

  /* --- lokale Statistik (nur im Browser) --------------------------------*/
  loadStats() {
    try { const s = JSON.parse(localStorage.getItem('eg_vd_stats')); if (s) this.stats = s; } catch (e) {}
  },
  saveStats() {
    try { localStorage.setItem('eg_vd_stats', JSON.stringify(this.stats)); } catch (e) {}
  },
};

window.addEventListener('DOMContentLoaded', () => Game.init());
