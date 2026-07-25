/* ============================================================================
 * VoltDetective v2 — Kern-Simulation (Bauteil-/Pfad-Modell)
 * ----------------------------------------------------------------------------
 * Der Zustand einer Lampe (an/aus) wird NIEMALS direkt gesetzt. Er ergibt sich
 * aus dem Durchgang ENTLANG DES GESAMTEN PFADES vom LS-Schalter bis zur Lampe:
 *
 *   Sicherung -> Zuleitung/Klemme -> Schalter(-kontakt) -> Leitung -> Fassung -> Glühwendel
 *
 * Jedes dieser Bauteile kann einen Fehler tragen. Dadurch sitzen Fehler NICHT
 * nur an der Lampe, sondern an jeder Stelle des Stromkreises.
 * ==========================================================================*/
const Simulation = (() => {

  /* --- Katalog der echten Fehlerarten -----------------------------------*/
  const FAULT_TYPES = {
    sicherung_defekt: { label: 'Sicherung defekt (LS ausgelöst)',        short: 'Sicherung defekt' },
    klemme_lose:      { label: 'Lose Klemme / Wackelkontakt',            short: 'Lose Klemme' },
    schalter_defekt:  { label: 'Schaltkontakt defekt',                   short: 'Schaltkontakt defekt' },
    kabelbruch:       { label: 'Kabelbruch (Leitung unterbrochen)',      short: 'Kabelbruch' },
    kurzschluss:      { label: 'Kurzschluss',                            short: 'Kurzschluss' },
    fassung_defekt:   { label: 'Fassungskontakt defekt (Lampe locker)',  short: 'Fassung defekt' },
    gluehwendel:      { label: 'Glühwendel defekt',                      short: 'Glühwendel defekt' },
  };

  /* --- Topologie einer Runde aufbauen ------------------------------------
   * Serienschalter (Merten): EIN Bauteil, ZWEI unabhängige Wippen. Gemeinsame
   * Zuleitung L (feedS1), zwei geschaltete Ausgänge (w1->L1, w2->L2).
   * Lampenkette: EIN Ausschalter (c1) steuert alle Kettenlampen parallel;
   * jede Lampe hat aber eigenes Leitungssegment, eigene Fassung, eigenen Wendel.
   * ----------------------------------------------------------------------*/
  function createCircuit() {
    const fuse   = { id: 'F1',    kind: 'fuse',   label: 'LS-Schalter (Sicherung)',    isOn: true, fault: null };
    const feedS1 = { id: 'feedS1', kind: 'klemme', label: 'Zuleitung L — Serienschalter', fault: null };
    const feedS2 = { id: 'feedS2', kind: 'klemme', label: 'Zuleitung L — Lampenkette',     fault: null };
    const w1 = { id: 'w1', kind: 'switch', label: 'Wippe 1 (L′)',  isOn: true, fault: null };
    const w2 = { id: 'w2', kind: 'switch', label: 'Wippe 2 (L″)',  isOn: true, fault: null };
    const c1 = { id: 'c1', kind: 'switch', label: 'Ausschalter',    isOn: true, fault: null };

    const lamps = [];
    const elements = { F1: fuse, feedS1, feedS2, w1, w2, c1 };

    function mkLamp(id, label, feed, channel) {
      const wire   = { id: 'wire_'   + id, kind: 'wire',     label: 'Leitung — '   + label, fault: null };
      const socket = { id: 'socket_' + id, kind: 'socket',   label: 'Fassung — '   + label, fault: null };
      const fil    = { id: 'fil_'    + id, kind: 'filament', label: 'Glühwendel — ' + label, fault: null };
      elements[wire.id] = wire; elements[socket.id] = socket; elements[fil.id] = fil;
      const lamp = {
        id, label, feed, channel, wire, socket, filament: fil,
        // Reihenfolge = Stromweg von der Quelle zur Lampe:
        path: [fuse, feed, channel, wire, socket, fil],
      };
      lamps.push(lamp);
      return lamp;
    }

    mkLamp('L1', 'Deckenlampe 1', feedS1, w1);
    mkLamp('L2', 'Deckenlampe 2', feedS1, w2);
    for (let i = 1; i <= CONFIG.lampChain.count; i++) mkLamp('K' + i, 'Kettenlampe ' + i, feedS2, c1);

    const switches = [
      { id: 'S1', type: 'series', label: 'Serienschalter',            channels: [w1, w2] },
      { id: 'S2', type: 'single', label: 'Ausschalter (Lampenkette)', channels: [c1] },
    ];

    return { fuse, feeds: { S1: feedS1, S2: feedS2 }, switches, lamps, elements };
  }

  // Alle Fehler entfernen + alles einschalten (Rundenstart / Reset)
  function resetCircuit(circuit) {
    Object.values(circuit.elements).forEach(el => {
      el.fault = null;
      if ('isOn' in el) el.isOn = true;
    });
  }

  /* --- Leitet ein einzelnes Bauteil? (ohne globalen Kurzschluss) ---------*/
  function conducts(el) {
    switch (el.kind) {
      case 'fuse':     return el.isOn && el.fault !== 'sicherung_defekt';
      case 'switch':   return el.isOn && el.fault !== 'schalter_defekt';
      case 'klemme':   return !el.fault;                 // klemme_lose unterbricht
      case 'wire':     return !el.fault;                 // kabelbruch ODER kurzschluss unterbrechen den Lampenpfad
      case 'socket':   return !el.fault;                 // fassung_defekt
      case 'filament': return !el.fault;                 // gluehwendel
      default:         return true;
    }
  }

  // Erster Kurzschluss im Kreis (lässt die Sicherung fliegen)
  function findShort(circuit) {
    for (const id in circuit.elements) if (circuit.elements[id].fault === 'kurzschluss') return circuit.elements[id];
    return null;
  }

  // Sicherung wirksam? (an, nicht defekt, kein Kurzschluss)
  function fuseEffective(circuit) {
    return circuit.fuse.isOn && circuit.fuse.fault !== 'sicherung_defekt' && !findShort(circuit);
  }

  /* --- Kernformel: leuchtet eine Lampe? ----------------------------------*/
  function isLampLit(circuit, lamp) {
    if (!fuseEffective(circuit)) return false;
    for (const el of lamp.path) {
      if (el.kind === 'fuse') continue;   // Sicherung oben schon geprüft
      if (!conducts(el)) return false;
    }
    return true;
  }

  function evaluate(circuit) {
    const result = {};
    for (const lamp of circuit.lamps) result[lamp.id] = isLampLit(circuit, lamp);
    return result;
  }

  /* --- Erste blockierende Stelle auf dem Pfad ----------------------------
   * Für Messgerät & Diagnose: liefert wo/warum der Strom stehen bleibt.
   *   { kind:'fault', el, type } | { kind:'off', el } | { kind:'short', el } | null
   * 'off'  = nur ausgeschaltet (KEIN Defekt -> Meister-Falle)
   * 'short'= Kurzschluss in einem ANDEREN Zweig (Sicherung fliegt)
   * ----------------------------------------------------------------------*/
  function firstBlock(circuit, lamp) {
    const fuse = circuit.fuse;
    if (fuse.fault === 'sicherung_defekt') return { kind: 'fault', el: fuse, type: 'sicherung_defekt' };
    if (!fuse.isOn)                        return { kind: 'off',   el: fuse };

    const shortEl = findShort(circuit);
    if (shortEl) {
      if (lamp.path.indexOf(shortEl) !== -1) return { kind: 'fault', el: shortEl, type: 'kurzschluss' };
      return { kind: 'short', el: shortEl };
    }

    for (const el of lamp.path) {
      if (el.kind === 'fuse') continue;
      if (el.kind === 'switch') {
        if (el.fault === 'schalter_defekt') return { kind: 'fault', el, type: 'schalter_defekt' };
        if (!el.isOn)                        return { kind: 'off',   el };
      } else if (el.fault) {
        return { kind: 'fault', el, type: el.fault };
      }
    }
    return null; // Lampe müsste leuchten
  }

  /* --- Hilfszugriffe (für UI) -------------------------------------------*/
  function getChannel(circuit, switchId, channelId) {
    const sw = circuit.switches.find(s => s.id === switchId);
    return sw ? (sw.channels.find(c => c.id === channelId) || null) : null;
  }

  return {
    FAULT_TYPES, createCircuit, resetCircuit,
    conducts, findShort, fuseEffective, isLampLit, evaluate, firstBlock, getChannel,
  };
})();
