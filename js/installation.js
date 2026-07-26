/* ============================================================================
 * VoltDetective — Installations-Modus (Phase 2)
 * ----------------------------------------------------------------------------
 * Raum mit Steckdosen-Mindestanzahl (Ausstattungswerte) wählen, dann Bauteile
 * der Reihe nach in die richtigen Installationszonen (DIN 18015-3) setzen.
 * Falsche Position = Fehler. Am Ende ein Beliebtheits-Score.
 * ==========================================================================*/
var Installation = (function () {
  var W = 400, H = 260;
  var door = { x: 20, y: 60, w: 90, h: 200 };   // Tür links, 0,90 × 2,00 m
  function hy(cm) { return H - cm; }             // Höhe über OKFF -> SVG-y

  var zones = {
    untenW: { label: 'untere waagerechte Zone · 15–45 cm', x: 0, y: hy(45), w: W, h: 30 },
    mitteW: { label: 'mittlere waagerechte Zone · 100–130 cm', x: 0, y: hy(130), w: W, h: 30 },
    obenW:  { label: 'obere waagerechte Zone · 15–45 cm unter Decke', x: 0, y: 15, w: W, h: 30 },
    senkTuer: { label: 'senkrechte Zone neben Tür · 10–30 cm', x: door.x + door.w + 10, y: 0, w: 20, h: H }
  };

  // Räume mit Mindest-Steckdosenzahl (vereinfachte Ausstattungswerte, DIN 18015-2)
  var ROOMS = [
    { name: 'Wohnzimmer', minSteck: 5 },
    { name: 'Schlafzimmer', minSteck: 4 },
    { name: 'Kinderzimmer', minSteck: 4 },
    { name: 'Küche (Arbeitsbereich)', minSteck: 5 },
    { name: 'Arbeitszimmer', minSteck: 4 }
  ];

  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
  function notBehindDoor(x, y) { return !(x >= door.x && x <= door.x + door.w && y >= door.y); }

  var room;
  function newRoom() { room = pick(ROOMS); return { W: W, H: H, door: door, zones: zones, room: room }; }

  function placeOk(kind, x, y) {
    if (kind === 'schalter')  return inRect(x, y, zones.senkTuer) && Math.abs(y - hy(105)) <= 10;  // ~105 cm neben der Tür
    if (kind === 'steckdose') return notBehindDoor(x, y) && Math.abs(y - hy(30)) <= 6;              // mittig 30 cm über dem Boden
    if (kind === 'leuchte')   return y <= 22 && x >= 150 && x <= 300;                                // Decke, mittig
    return false;
  }

  // Beliebtheit: Zonen-Treffer (bis 70%) + Ausstattung (bis 30%)
  function beliebtheit(sockets, min, firstTryHits, totalPlacements) {
    var zoneScore = Math.round(firstTryHits / totalPlacements * 70);
    var countScore = sockets >= min + 2 ? 30 : sockets >= min ? 20 : 0;
    var p = Math.max(0, Math.min(100, zoneScore + countScore));
    var label = p >= 85 ? 'Sehr beliebt — top ausgestattet & normgerecht!'
              : p >= 60 ? 'Beliebt — solide Installation'
              : p >= 35 ? 'Durchschnitt — Mängel'
              : 'Durchgefallen';
    return { prozent: p, label: label };
  }

  return { newRoom: newRoom, placeOk: placeOk, beliebtheit: beliebtheit, geom: { W: W, H: H, door: door, zones: zones }, rooms: ROOMS };
})();
