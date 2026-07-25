/* ============================================================================
 * VoltDetective v2 — Zentrale Konfiguration
 * ----------------------------------------------------------------------------
 * Alle Wahrscheinlichkeiten, Mengen und Timings liegen HIER, damit das
 * Balancing später ohne Eingriff in die Spiel-Logik angepasst werden kann.
 * (Entspricht der geforderten "ScriptableObject / Config.js"-Idee.)
 * ==========================================================================*/
const CONFIG = {
  probabilities: {
    // 30%-Start-Chance: Sicherung ODER ein Schalter ist zu Rundenbeginn nur
    // AUSGESCHALTET. Das ist KEIN Defekt und taucht nicht in der Diagnoseliste auf.
    switchedOffTrap: 0.30,

    // Echte Fehlerarten — je passendes Bauteil ausgewürfelt (0..1):
    faults: {
      sicherung_defekt: 0.06, // LS ausgelöst/defekt  -> ganzer Kreis tot
      klemme_lose:      0.12, // lose Klemme / Wackelkontakt -> Zweig tot
      schalter_defekt:  0.10, // Schaltkontakt defekt (Schalter an, kein Durchgang)
      kabelbruch:       0.12, // Leitung unterbrochen -> Zweig/Lampe tot
      fassung_defekt:   0.12, // Fassungskontakt / Lampe locker -> Lampe tot
      gluehwendel:      0.16, // Glühwendel durchgebrannt -> Lampe tot
    },
    // Wird eine Leitung defekt, ist es mit dieser Chance ein KURZSCHLUSS
    // (Sicherung fliegt sofort), sonst ein Kabelbruch.
    shortInsteadOfBreak: 0.30,
  },

  minRealFaults: 1,  // mind. so viele echte Fehler pro Runde (spielbar)
  maxRealFaults: 4,  // Deckel pro Runde

  lampChain: { count: 6 }, // Lampenkette: 1 Ausschalter -> N parallele Lampen

  timing: {
    // Lampen reagieren praktisch verzögerungsfrei (Vorgabe < 50 ms); dies ist
    // nur die kurze optische Glüh-Blende.
    lampGlowMs: 40,
    flipMs: 160, // mechanische Kipp-Animation
  },
};
