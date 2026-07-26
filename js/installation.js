/* ============================================================================
 * VoltDetective — Installations-Modus (Phase 1): Installationszonen
 * ----------------------------------------------------------------------------
 * Wand-Frontansicht in cm (SVG-Koordinaten: x rechts, y nach UNTEN).
 * Der Spieler setzt Bauteile der Reihe nach an die richtige Stelle gemäß
 * DIN 18015-3. Falsche Position (außerhalb der Zone) -> Fehler (rot).
 * ==========================================================================*/
var Installation = (function () {
  var W = 400, H = 260;                 // 4,00 m breit · 2,60 m hoch
  var door = { x: 20, y: 60, w: 90, h: 200 };   // Tür links, 0,90 m × 2,00 m
  function hy(cm) { return H - cm; }    // Höhe über OKFF -> SVG-y

  // Installationszonen (DIN 18015-3), als SVG-Rechtecke
  var zones = {
    untenW: { label: 'untere waagerechte Zone · 15–45 cm', x: 0, y: hy(45), w: W, h: 30 },
    mitteW: { label: 'mittlere waagerechte Zone · 100–130 cm', x: 0, y: hy(130), w: W, h: 30 },
    obenW:  { label: 'obere waagerechte Zone · 15–45 cm unter Decke', x: 0, y: 15, w: W, h: 30 },
    senkTuer: { label: 'senkrechte Zone neben Tür · 10–30 cm', x: door.x + door.w + 10, y: 0, w: 20, h: H }
  };

  function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
  function notBehindDoor(x, y) { return !(x >= door.x && x <= door.x + door.w && y >= door.y); }

  // Aufgaben in fester Reihenfolge
  var TASKS = [
    { key: 'schalter', label: 'Lichtschalter — neben der Tür (senkrechte Zone), Schalterhöhe ~105 cm',
      ok: function (x, y) { return inRect(x, y, zones.senkTuer) && inRect(x, y, zones.mitteW); },
      zone: 'senkrechte Zone neben der Tür + mittlere waagerechte Zone (~105 cm)' },
    { key: 'steckdose', label: 'Steckdose — in einer waagerechten Zone (z. B. 30 cm über dem Boden)',
      ok: function (x, y) { return notBehindDoor(x, y) && (inRect(x, y, zones.untenW) || inRect(x, y, zones.mitteW)); },
      zone: 'untere oder mittlere waagerechte Zone' },
    { key: 'leuchte', label: 'Leuchtenauslass — an der Decke (Raummitte)',
      ok: function (x, y) { return y <= 22 && x >= 150 && x <= 300; },
      zone: 'Decke, mittig' }
  ];

  function newRound() { return { W: W, H: H, door: door, zones: zones, tasks: TASKS.map(function (t) { return { key: t.key, label: t.label, zone: t.zone }; }) }; }
  function check(i, x, y) { var t = TASKS[i]; return !!(t && t.ok(x, y)); }
  function count() { return TASKS.length; }
  // Beliebtheit auf Basis der Treffer beim ersten Versuch
  function beliebtheit(firstTryHits) {
    var p = Math.round(firstTryHits / TASKS.length * 100);
    var label = p >= 100 ? 'Sehr beliebt — normgerecht!' : p >= 66 ? 'Beliebt — kleine Mängel' : p >= 33 ? 'Durchschnitt' : 'Durchgefallen';
    return { prozent: p, label: label };
  }

  return { newRound: newRound, check: check, count: count, beliebtheit: beliebtheit, geom: { W: W, H: H, door: door, zones: zones } };
})();
