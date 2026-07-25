/* ============================================================================
 * VoltDetective v2 — Kern-Simulation
 * ----------------------------------------------------------------------------
 * WICHTIG: Der Zustand einer Lampe (an/aus) wird NIEMALS direkt gesetzt.
 * Er ist immer das abgeleitete Ergebnis der geschlossenen logischen Kette:
 *
 *   Lampe.leuchtet = Sicherung.istAn
 *                 && Schalter.istAn
 *                 && Verkabelung.istIntakt
 *                 && Lampe.glühwendelIntakt
 *
 * Die Auswertung ist eine reine Funktion ohne Seiteneffekte und läuft
 * synchron -> die Reaktion auf Schalten ist verzögerungsfrei (< 50 ms).
 * ==========================================================================*/
const Simulation = (() => {

  /* --- Topologie einer Runde aufbauen -------------------------------------
   * Serienschalter (Merten-Prinzip): EIN Bauteil, aber ZWEI unabhängige
   * Wippen (Kanäle). Gemeinsame Zuleitung L unten, zwei geschaltete Ausgänge
   * L' (Wippe 1 -> Lampe 1) und L'' (Wippe 2 -> Lampe 2) oben.
   *
   * Lampenkette: EIN Ausschalter (ein Kanal) steuert alle Kettenlampen parallel;
   * jede Lampe hat aber ihr eigenes Leitungssegment + eigenen Glühwendel.
   * ----------------------------------------------------------------------*/
  function createCircuit() {
    const circuit = {
      // Sicherung / LS-Schalter = Hauptschalter für den gesamten Kreis.
      fuse: { id: 'F1', label: 'LS-Schalter (Sicherung)', isOn: true },

      switches: [
        {
          id: 'S1', type: 'series', label: 'Serienschalter',
          channels: [
            { id: 'w1', label: 'Wippe 1 (L′)',  isOn: true }, // steuert Lampe 1
            { id: 'w2', label: 'Wippe 2 (L″)', isOn: true }, // steuert Lampe 2
          ],
        },
        {
          id: 'S2', type: 'single', label: 'Ausschalter (Lampenkette)',
          channels: [ { id: 'c1', label: 'Schalter', isOn: true } ],
        },
      ],

      // Verkabelung PRO SEGMENT (nicht global!) — sonst ließe sich ein
      // Kabelbruch nicht von einem Glühwendel-Defekt unterscheiden.
      wires: {},

      lamps: [],
    };

    // Serienschalter-Lampen (zwei getrennte geschaltete Ausgänge)
    addLamp(circuit, 'L1', 'Deckenlampe 1', 'S1', 'w1');
    addLamp(circuit, 'L2', 'Deckenlampe 2', 'S1', 'w2');

    // Lampenkette (parallel an einem Ausschalter)
    for (let i = 1; i <= CONFIG.lampChain.count; i++) {
      addLamp(circuit, 'K' + i, 'Kettenlampe ' + i, 'S2', 'c1');
    }

    return circuit;
  }

  function addLamp(circuit, id, label, switchId, channelId) {
    const wireId = 'seg_' + id;
    circuit.wires[wireId] = { id: wireId, intact: true };
    circuit.lamps.push({
      id, label, switchId, channelId, wireId,
      filamentIntact: true,
    });
  }

  /* --- Hilfszugriffe -----------------------------------------------------*/
  function getSwitch(circuit, switchId) {
    return circuit.switches.find(s => s.id === switchId) || null;
  }
  function getChannel(circuit, switchId, channelId) {
    const sw = getSwitch(circuit, switchId);
    return sw ? (sw.channels.find(c => c.id === channelId) || null) : null;
  }

  /* --- DIE Kernformel: eine einzelne Lampe ------------------------------*/
  function isLampLit(circuit, lamp) {
    const fuseOn   = circuit.fuse.isOn;                           // Sicherung.istAn
    const channel  = getChannel(circuit, lamp.switchId, lamp.channelId);
    const switchOn = channel ? channel.isOn : false;             // Schalter.istAn
    const wire     = circuit.wires[lamp.wireId];
    const wireOk   = wire ? wire.intact : false;                 // Verkabelung.istIntakt
    const filament = lamp.filamentIntact;                        // Lampe.glühwendelIntakt

    return fuseOn && switchOn && wireOk && filament;             // Boolean-AND-Kette
  }

  /* --- Ableitung für ALLE Lampen (nie direkt gesetzt) -------------------*/
  function evaluate(circuit) {
    const result = {};
    for (const lamp of circuit.lamps) {
      result[lamp.id] = isLampLit(circuit, lamp);
    }
    return result;
  }

  /* --- Diagnose-Wahrheit: was ist an einer Lampe WIRKLICH defekt? -------
   * Liefert 'filament' | 'wire' | null. Ein bloß ausgeschalteter Schalter
   * oder eine ausgeschaltete Sicherung ist KEIN Defekt -> null.
   * ----------------------------------------------------------------------*/
  function actualDefect(circuit, lamp) {
    if (!lamp.filamentIntact) return 'filament';
    if (!circuit.wires[lamp.wireId].intact) return 'wire';
    return null;
  }

  return {
    createCircuit, getSwitch, getChannel,
    isLampLit, evaluate, actualDefect,
  };
})();
