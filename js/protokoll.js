/* ============================================================================
 * VoltDetective — Messprotokoll (E-Check nach DIN VDE 0100-600)
 * ----------------------------------------------------------------------------
 * Erzeugt prüflingsabhängige Messwerte mit physikalisch korrekten Grenzwerten:
 * - Zs-Grenzwert dynamisch je LS-Typ und Nennstrom (Tabelle A.6)
 * - Bedingte Messungen: Drehfeld nur bei Drehstrom, RCD nur wenn vorhanden
 * - Messwerte leitungsphysikalisch konsistent (R_PE / Zs aus Länge + Querschnitt)
 * - evaluate() liefert {ok, grenzwert, erlaeuterung} mit Normverweis
 * - allValues() für Protokoll-Generierung
 * ==========================================================================*/
var Protokoll = (function () {

  var UO = 230; // Nennspannung Phase-Erde (V)

  /* --- Hilfsfunktionen -------------------------------------------------- */
  function rnd(min, max, dec) {
    var v = min + Math.random() * (max - min), p = Math.pow(10, dec);
    return Math.round(v * p) / p;
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

  /* Zs-Grenzwert nach DIN VDE 0100-600 Tab. A.6
   * Zs_max = Uo / (k × In)  mit  k = B:5, C:10, D:20
   */
  function zsMax(lsTyp, lsIn) {
    var k = lsTyp === 'C' ? 10 : lsTyp === 'D' ? 20 : 5;
    return Math.round(UO / (k * lsIn) * 1000) / 1000; // 3 Nachkomme für exakte Formel
  }

  /* Mindest-Kabelquerschnitt aus Nennstrom (vereinfacht nach DIN VDE 0298-4) */
  function querschnitt(lsIn) {
    if (lsIn <= 10)  return 1.5;
    if (lsIn <= 16)  return 1.5;
    if (lsIn <= 20)  return 2.5;
    if (lsIn <= 25)  return 2.5;
    if (lsIn <= 32)  return 4.0;
    return 6.0;
  }

  /* --- Prüflinge --------------------------------------------------------- */
  var PRUEFLINGE = [
    { label: 'Stromkreis 1 — Steckdosen Wohnzimmer', lsTyp: 'B', lsIn: 16, rcd: 30, drehstrom: false, laenge: 15 },
    { label: 'Stromkreis 2 — Licht Flur / Bad',       lsTyp: 'B', lsIn: 10, rcd: 30, drehstrom: false, laenge: 10 },
    { label: 'Stromkreis 3 — Küche Arbeitsplatte',    lsTyp: 'B', lsIn: 16, rcd: 30, drehstrom: false, laenge: 12 },
    { label: 'Stromkreis 4 — Waschmaschine',          lsTyp: 'B', lsIn: 16, rcd: 30, drehstrom: false, laenge: 8  },
    { label: 'Endstromkreis — Kinderzimmer',          lsTyp: 'B', lsIn: 16, rcd: 30, drehstrom: false, laenge: 22 },
    { label: 'Drehstromkreis — Herd / Kochfeld',      lsTyp: 'B', lsIn: 16, rcd: 30, drehstrom: true,  laenge: 6  },
    { label: 'Unterverteilung — Keller (kein RCD)',   lsTyp: 'C', lsIn: 16, rcd: null, drehstrom: true,  laenge: 25 },
    { label: 'Gartensteckdose — Außenanlage',         lsTyp: 'B', lsIn: 16, rcd: 30, drehstrom: false, laenge: 25 },
    { label: 'Klimaanlage — Technikraum',             lsTyp: 'C', lsIn: 16, rcd: 30, drehstrom: false, laenge: 18 },
    { label: 'Starkstromkreis — Schweißplatz',        lsTyp: 'B', lsIn: 32, rcd: null, drehstrom: true,  laenge: 10 },
  ];

  /* --- Messliste aufbauen (prüflingsabhängig) ---------------------------- */
  function buildMess(pl) {
    var zs   = zsMax(pl.lsTyp, pl.lsIn);
    var q    = querschnitt(pl.lsIn);
    var rho  = 0.0175;                    // spez. Widerstand Cu 20 °C (Ω·mm²/m)
    var kChar = pl.lsTyp === 'C' ? 10 : 5;
    var ian  = pl.rcd;                    // RCD-Nennfehlerstrom (mA), null wenn kein RCD

    var items = [];

    /* 1 · Sichtprüfung */
    items.push({
      key: 'sicht', name: 'Sichtprüfung', unit: '',
      limit: 'ohne Mängel',
      erlaeuterung: 'DIN VDE 0100-600 Abschn. 6.1.1: Sichtprüfung ist die erste Maßnahme — '
        + 'Zustand der Anlage, Kennzeichnung, Schutzart, mechanischer Schutz, Leitungsverlegung.',
      gen: function () {
        return pick(['ohne Mängel', 'ohne Mängel', 'ohne Mängel',
          'Mangel: Steckdose locker', 'Mangel: Kabel nicht zugentlastet',
          'Mangel: Fehlende Leitungskennzeichnung']);
      },
      ok: function (v) { return v === 'ohne Mängel'; }
    });

    /* 2 · Schutzleiter-Durchgängigkeit R PE */
    var rpe_theo = Math.round(pl.laenge * rho / q * 1000) / 1000;
    items.push({
      key: 'rpe', name: 'Durchgängigkeit Schutzleiter (R PE)', unit: 'Ω',
      limit: '< 1,0 Ω',
      erlaeuterung: 'DIN VDE 0100-600 Abschn. 6.1.3.1: Widerstand des PE-Leiters '
        + 'vom UV bis zum letzten Betriebsmittel. Für ' + q + ' mm² Cu bei ' + pl.laenge + ' m '
        + 'theoretisch ca. ' + String(rpe_theo).replace('.', ',') + ' Ω '
        + '(ρ = 0,0175 Ω·mm²/m). Grenzwert < 1,0 Ω sichert wirksamen Schutzabschaltstrom.',
      gen: function () {
        var theo = pl.laenge * rho / q;
        return rnd(theo * 0.75, Math.min(theo * 2.4 + 0.05, 1.85), 2);
      },
      ok: function (v) { return v < 1.0; }
    });

    /* 3 · Isolationswiderstand R ISO */
    items.push({
      key: 'riso', name: 'Isolationswiderstand (R ISO)', unit: 'MΩ',
      limit: '≥ 1,0 MΩ',
      erlaeuterung: 'DIN VDE 0100-600 Tab. 6.1: Prüfspannung 500 V DC, '
        + 'Mindest-Iso-Widerstand 1 MΩ für 230/400-V-Anlagen. '
        + 'Gemessen bei spannungsfreier Anlage mit kurzgeschlossenen L, N, PE (alle Verbraucher abgeklemmt).',
      gen: function () {
        return Math.random() < 0.78 ? rnd(2.0, 999.0, 1) : rnd(0.20, 0.95, 2);
      },
      ok: function (v) { return v >= 1.0; }
    });

    /* 4 · Schleifenimpedanz Zs */
    var zsDisp = zs.toFixed(2).replace('.', ',');
    items.push({
      key: 'zs', name: 'Schleifenimpedanz (Zs)', unit: 'Ω',
      limit: '≤ ' + zsDisp + ' Ω (LS ' + pl.lsTyp + pl.lsIn + ' A)',
      erlaeuterung: 'DIN VDE 0100-600 Tab. A.6: Zs_max = Uo / (k × In) = '
        + '230 V / (' + kChar + ' × ' + pl.lsIn + ' A) = '
        + zs.toFixed(3).replace('.', ',') + ' Ω. '
        + 'Zs = Netzimpedanz Ri + Schleifenwiderstand Leitung (L-Hin + PE-Rück).',
      gen: function () {
        var ri      = rnd(0.12, 0.45, 2);
        var r_leitung = pl.laenge * 2 * rho / q;   // L-Hin + PE-Rück
        var v = ri + r_leitung + rnd(0.0, 0.18, 2);
        if (Math.random() < 0.22) v = zs * rnd(1.06, 1.65, 2); // gezielt n.i.O.
        return Math.round(v * 100) / 100;
      },
      ok: function (v) { return v <= zs; }
    });

    /* 5 · Netzinnenwiderstand Ri (informativ) */
    items.push({
      key: 'ri', name: 'Netzinnenwiderstand (Ri / Ze)', unit: 'Ω',
      limit: 'informativ — Ik = Uo / Zs',
      erlaeuterung: 'Ri (auch Ze) = Widerstand des Netzes bis zur Hausanschlussübergabe. '
        + 'Informativ für Netzkategorisierung (TN/TT). '
        + 'Kurzschlussstrom Ik = Uo / Zs gibt Auskunft über Selektivität.',
      gen: function () { return rnd(0.10, 0.55, 2); },
      ok: function ()  { return true; }        // stets i.O. — rein informativ
    });

    /* 6+7 · RCD — nur wenn Prüfling einen RCD hat */
    if (ian !== null) {
      items.push({
        key: 'rcdI', name: 'RCD-Auslösestrom (bei IΔN = ' + ian + ' mA)', unit: 'mA',
        limit: 'IΔN/2 … IΔN (' + (ian / 2) + '–' + ian + ' mA)',
        erlaeuterung: 'DIN VDE 0100-606 / IEC 61008: RCD muss bei Nennfehlerstrom IΔN = ' + ian + ' mA auslösen. '
          + 'Zulässiger Auslösebereich: ½ IΔN bis IΔN ('
          + (ian / 2) + '–' + ian + ' mA). '
          + 'Zu frühe Auslösung (< ½ IΔN) führt zu unerwünschten Abschaltungen.',
        gen: function () {
          return Math.random() < 0.82
            ? rnd(ian * 0.48, ian * 1.0, 0)
            : rnd(ian * 1.04, ian * 1.5, 0);
        },
        ok: function (v) { return v <= ian; }
      });

      items.push({
        key: 'rcdT', name: 'RCD-Auslösezeit (bei IΔN)', unit: 'ms',
        limit: '≤ 300 ms',
        erlaeuterung: 'DIN VDE 0100-600 Abschn. 6.1.3.6: '
          + 'Allstromsensitiver RCD (Typ A) muss bei Nennfehlerstrom ≤ 300 ms abschalten. '
          + 'Selektive RCDs (S-Typ) haben abweichende, längere Auslösezeiten.',
        gen: function () {
          return Math.random() < 0.87 ? rnd(18, 285, 0) : rnd(305, 490, 0);
        },
        ok: function (v) { return v <= 300; }
      });
    }

    /* 8 · Drehfeldprüfung — nur bei Drehstromkreisen */
    if (pl.drehstrom) {
      items.push({
        key: 'dreh', name: 'Drehfeldprüfung', unit: '',
        limit: 'rechtsdrehend (L1-L2-L3)',
        erlaeuterung: 'DIN VDE 0100-600 Abschn. 6.1.3.7: '
          + 'Phasenfolge L1-L2-L3 (rechtsdrehend) vorgeschrieben. '
          + 'Linksdrehfeld kehrt Drehrichtung von Drehstrommotoren um — '
          + 'bei Lüftungs- und Pumpenanlagen sicherheitskritisch.',
        gen: function () {
          return pick(['rechtsdrehend', 'rechtsdrehend', 'rechtsdrehend', 'linksdrehend']);
        },
        ok: function (v) { return v === 'rechtsdrehend'; }
      });
    }

    return items;
  }

  /* --- interner Zustand -------------------------------------------------- */
  var cur_pl   = null;
  var cur_mess = [];
  var cur_vals = {};

  /* --- öffentliche API --------------------------------------------------- */

  function newRound() {
    cur_pl   = pick(PRUEFLINGE);
    cur_mess = buildMess(cur_pl);
    cur_vals = {};
    cur_mess.forEach(function (m) { cur_vals[m.key] = m.gen(); });
    return { pruefling: cur_pl.label, mess: list() };
  }

  function list() {
    return cur_mess.map(function (m) {
      return { key: m.key, name: m.name, unit: m.unit, limit: m.limit };
    });
  }

  function measure(key) { return cur_vals[key]; }

  /* evaluate() — gibt Objekt zurück: { ok, grenzwert, erlaeuterung } */
  function evaluate(key) {
    for (var i = 0; i < cur_mess.length; i++) {
      if (cur_mess[i].key === key) {
        var m = cur_mess[i];
        return { ok: m.ok(cur_vals[key]), grenzwert: m.limit, erlaeuterung: m.erlaeuterung };
      }
    }
    return { ok: true, grenzwert: '', erlaeuterung: '' };
  }

  function overall() {
    return cur_mess.every(function (m) { return m.ok(cur_vals[m.key]); });
  }

  function count() { return cur_mess.length; }

  /* current() — Prüflingsdaten für UI (LS-Typ, RCD, Drehstrom) */
  function current() {
    if (!cur_pl) return {};
    return {
      pruefling: cur_pl.label,
      lsTyp:     cur_pl.lsTyp,
      lsIn:      cur_pl.lsIn,
      rcd:       cur_pl.rcd,
      drehstrom: cur_pl.drehstrom,
      laenge:    cur_pl.laenge
    };
  }

  /* allValues() — alle Messwerte inkl. Bewertung (für Protokollausdruck) */
  function allValues() {
    return cur_mess.map(function (m) {
      var v = cur_vals[m.key];
      return {
        key:         m.key,
        name:        m.name,
        unit:        m.unit,
        limit:       m.limit,
        value:       v,
        ok:          m.ok(v),
        erlaeuterung: m.erlaeuterung
      };
    });
  }

  return { newRound: newRound, list: list, measure: measure, evaluate: evaluate,
           overall: overall, count: count, current: current, allValues: allValues };
})();
