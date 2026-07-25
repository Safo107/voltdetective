/* ============================================================================
 * VoltDetective v2 — Zentrale Konfiguration
 * ----------------------------------------------------------------------------
 * Alle Wahrscheinlichkeiten, Mengen und Timings liegen HIER, damit das
 * Balancing später ohne Eingriff in die Spiel-Logik angepasst werden kann.
 * (Entspricht der geforderten "ScriptableObject / Config.js"-Idee.)
 * ==========================================================================*/
const CONFIG = {
  /* Wahrscheinlichkeiten (0..1) */
  probabilities: {
    // 30%-Start-Chance: Sicherung ODER ein Schalter ist zu Rundenbeginn nur
    // AUSGESCHALTET. Das ist KEIN Defekt und taucht nicht in der Diagnoseliste auf.
    switchedOffTrap: 0.30,

    // Echte Schäden (kommen in die Diagnoseliste) — pro Lampe ausgewürfelt:
    filamentDefect: 0.22, // Glühwendel defekt
    wireDefect:     0.10, // Kabelbruch / Verkabelung unterbrochen
  },

  /* Runden-Regeln */
  maxRealDefects:    3,    // Deckel: max. so viele echte Defekte pro Runde
  guaranteeOneDefect: true, // mind. 1 echter Defekt, damit die Runde lösbar/lohnend ist

  /* Aufbau */
  lampChain: { count: 6 }, // Lampenkette: 1 Ausschalter -> N parallele Lampen

  /* Timing (ms) */
  timing: {
    // Lampen müssen praktisch verzögerungsfrei reagieren (Vorgabe < 50 ms).
    // Der LOGISCHE Zustand wird synchron/sofort neu berechnet; dies ist nur
    // die kurze optische Glüh-Blende.
    lampGlowMs: 40,
    // Mechanische Kipp-Animation der Wippe/Sicherung.
    flipMs: 160,
  },
};
