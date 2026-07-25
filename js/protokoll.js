/* ============================================================================
 * VoltDetective — Messprotokoll (E-Check-Messungen nach DIN VDE 0100-600)
 * ----------------------------------------------------------------------------
 * Generiert einen Prüfling mit versteckten Messwerten. Der Spieler misst jeden
 * Wert und bewertet i.O. / n.i.O. anhand der Grenzwerte. Reine Lern-Simulation.
 * ==========================================================================*/
var Protokoll = (function () {
  function rnd(min, max, dec) { var v = min + Math.random() * (max - min), p = Math.pow(10, dec); return Math.round(v * p) / p; }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  var MESS = [
    { key: 'sicht', name: 'Sichtprüfung', unit: '', limit: 'ohne Mängel',
      gen: function () { return pick(['ohne Mängel', 'ohne Mängel', 'Mangel: Steckdose locker']); },
      ok: function (v) { return v === 'ohne Mängel'; } },
    { key: 'rpe', name: 'Durchgängigkeit Schutzleiter (R PE)', unit: 'Ω', limit: '< 1 Ω',
      gen: function () { return rnd(0.08, 1.9, 2); }, ok: function (v) { return v < 1.0; } },
    { key: 'riso', name: 'Isolationswiderstand (R ISO)', unit: 'MΩ', limit: '≥ 1 MΩ',
      gen: function () { return Math.random() < 0.7 ? rnd(1.5, 300, 1) : rnd(0.2, 0.9, 2); },
      ok: function (v) { return v >= 1.0; } },
    { key: 'zs', name: 'Schleifenimpedanz (Zs)', unit: 'Ω', limit: '≤ 2,87 Ω (LS B16)',
      gen: function () { return rnd(0.3, 4.5, 2); }, ok: function (v) { return v <= 2.87; } },
    { key: 'ri', name: 'Netzinnenwiderstand (Ri)', unit: 'Ω', limit: 'informativ (Ik = 230/Ri)',
      gen: function () { return rnd(0.2, 1.2, 2); }, ok: function () { return true; } },
    { key: 'rcdI', name: 'RCD-Auslösestrom (IΔN)', unit: 'mA', limit: '≤ 30 mA',
      gen: function () { return rnd(15, 42, 0); }, ok: function (v) { return v <= 30; } },
    { key: 'rcdT', name: 'RCD-Auslösezeit', unit: 'ms', limit: '≤ 300 ms',
      gen: function () { return rnd(18, 420, 0); }, ok: function (v) { return v <= 300; } },
    { key: 'dreh', name: 'Drehfeld', unit: '', limit: 'rechtsdrehend',
      gen: function () { return pick(['rechtsdrehend', 'rechtsdrehend', 'linksdrehend']); },
      ok: function (v) { return v === 'rechtsdrehend'; } },
  ];

  var PRUEFLINGE = [
    'Stromkreis 1 — Steckdosen Wohnzimmer · LS B16 · RCD 30 mA',
    'Stromkreis 2 — Licht Flur/Bad · LS B10 · RCD 30 mA',
    'Stromkreis 3 — Küche Arbeitsplatte · LS B16 · RCD 30 mA',
    'Stromkreis 4 — Waschmaschine · LS B16 · eigener RCD 30 mA',
    'Endstromkreis — Kinderzimmer · LS B16 · RCD 30 mA',
  ];

  var values = {}, pruefling = '';

  function newRound() {
    values = {}; pruefling = pick(PRUEFLINGE);
    MESS.forEach(function (m) { values[m.key] = m.gen(); });
    return { pruefling: pruefling, mess: list() };
  }
  function list() { return MESS.map(function (m) { return { key: m.key, name: m.name, unit: m.unit, limit: m.limit }; }); }
  function measure(key) { return values[key]; }
  function evaluate(key) { var m = find(key); return m ? m.ok(values[key]) : true; }
  function find(key) { for (var i = 0; i < MESS.length; i++) if (MESS[i].key === key) return MESS[i]; return null; }
  function overall() { return MESS.every(function (m) { return m.ok(values[m.key]); }); }
  function count() { return MESS.length; }
  function current() { return { pruefling: pruefling }; }

  return { newRound: newRound, list: list, measure: measure, evaluate: evaluate, overall: overall, count: count, current: current };
})();
