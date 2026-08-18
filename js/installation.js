/* ============================================================================
 * VoltDetective — Installations-Modus (Phase 3 · isometrische 3D-Ansicht)
 * ----------------------------------------------------------------------------
 * Koordinaten in Wand-Zentimetern:
 *   wx = 0..WW   waagerecht entlang der Hauptwand (0 = Türseite links)
 *   wy = 0..WH   Höhe über OKFF (0 = Boden, WH = Decke)
 * Die 3D-Projektion (Iso) macht die HTML-Seite; hier liegen nur Geometrie,
 * Zonen (DIN 18015-3) und die Platzierungs-/Bewertungslogik.
 * ==========================================================================*/
var Installation = (function () {
  var WW = 400, WH = 260;                          // Wand 4,00 m × 2,60 m
  var DEPTH = 170;                                 // sichtbare Raumtiefe (1,70 m) für 3D
  var door  = { x: 45,  w: 90, h: 200 };           // Tür an der Hauptwand (0,90 × 2,00 m)
  var win   = { x: 250, w: 95, sill: 90, h: 80 };  // Fenster (Brüstung 90 cm, 80 cm hoch)
  var vx    = door.x + door.w + 15;                // senkrechte Zone: 15 cm neben Tür
  var vpoint = { x: vx, y: 205 };                  // Abzweig/Unterverteilung oben in der senkr. Zone
  var herd  = { x1: 270, x2: 350, y: 50 };         // Herdanschlussdose (Drehstrom 400 V) ~50 cm

  // Installationszonen nach DIN 18015-3
  var zones = {
    unten:    { kind: 'h', label: '30 cm über Boden (± 15)',  y1: 15,      y2: 45      },
    oben:     { kind: 'h', label: '30 cm unter Decke (± 15)', y1: WH - 45, y2: WH - 15 },
    senkTuer: { kind: 'v', label: '10–30 cm neben der Tür',   x1: door.x + door.w + 10, x2: door.x + door.w + 30 },
    senkFenL: { kind: 'v', label: '10–30 cm neben dem Fenster', x1: win.x - 30, x2: win.x - 10 },
    senkFenR: { kind: 'v', label: '10–30 cm neben dem Fenster', x1: win.x + win.w + 10, x2: win.x + win.w + 30 }
  };

  // Räume mit Mindest-Steckdosenzahl (vereinfachte Ausstattungswerte, DIN 18015-2)
  var ROOMS = [
    { name: 'Wohnzimmer', minSteck: 5 },
    { name: 'Schlafzimmer', minSteck: 4 },
    { name: 'Kinderzimmer', minSteck: 4 },
    { name: 'Küche (Arbeitsbereich)', minSteck: 5, extras: ['herd'] },
    { name: 'Arbeitszimmer', minSteck: 4 },
    { name: 'Flur / Diele', minSteck: 2, extras: ['bewegung'] }
  ];

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function notBehindDoor(wx, wy) { return !(wx >= door.x && wx <= door.x + door.w && wy <= door.h); }

  var room;
  function newRoom() { room = pick(ROOMS); return { room: room }; }

  function placeOk(kind, wx, wy) {
    if (kind === 'schalter')  return Math.abs(wx - vx) <= 7 && Math.abs(wy - 105) <= 9;                         // 15 cm neben Tür, 105 cm
    if (kind === 'steckdose') return notBehindDoor(wx, wy) && Math.abs(wy - 30) <= 7 && wx > 8 && wx < WW - 8;  // mittig 30 cm über Boden
    if (kind === 'leuchte')   return wy >= WH - 18 && wx >= 150 && wx <= 300;                                   // Deckenauslass mittig
    if (kind === 'herd')      return wx >= herd.x1 && wx <= herd.x2 && Math.abs(wy - herd.y) <= 9;              // Herdanschluss ~50 cm
    if (kind === 'bewegung')  return Math.abs(wx - vx) <= 9 && Math.abs(wy - 110) <= 12;                        // Bewegungsmelder neben Tür ~110 cm
    return false;
  }

  // Beliebtheit: Zonen-Treffer (bis 70 %) + Ausstattung (bis 30 %)
  function beliebtheit(sockets, min, firstTryHits, totalPlacements) {
    var zoneScore  = Math.round(firstTryHits / totalPlacements * 70);
    var countScore = sockets >= min + 2 ? 30 : sockets >= min ? 20 : 0;
    var p = Math.max(0, Math.min(100, zoneScore + countScore));
    var label = p >= 85 ? 'Sehr beliebt — top ausgestattet & normgerecht!'
              : p >= 60 ? 'Beliebt — solide Installation'
              : p >= 35 ? 'Durchschnitt — Mängel'
              : 'Durchgefallen';
    return { prozent: p, label: label };
  }

  return {
    newRoom: newRoom, placeOk: placeOk, beliebtheit: beliebtheit,
    geom: { WW: WW, WH: WH, DEPTH: DEPTH, door: door, win: win, vx: vx, vpoint: vpoint, herd: herd, zones: zones },
    rooms: ROOMS
  };
})();
