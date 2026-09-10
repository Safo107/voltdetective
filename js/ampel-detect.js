/* ============================================================================
 * VoltDetective — Ampel-Assistent: Erkennungs-Engine
 * ----------------------------------------------------------------------------
 * Reine Bildauswertung, KEINE DOM-Zugriffe. Dadurch ist die Engine sowohl im
 * Browser (Kamera-Frames) als auch in Node (synthetische Testframes) nutzbar.
 *
 * Verfahren (bewusst ohne KI-Modell, laeuft auf jedem Handy in Echtzeit):
 *   1. Frame stark verkleinern (Standard 128x96) -> ~12k Pixel pro Durchlauf.
 *   2. Jedes Pixel nach HSV klassifizieren: nur helle UND satte Pixel zaehlen,
 *      denn eine Ampellampe ist eine punktfoermige, sehr helle Lichtquelle.
 *   3. Zusammenhaengende Flaechen (Blobs) je Farbe suchen (Flood-Fill).
 *   4. Blobs filtern: Mindestflaeche, rundliche Form (Fuellgrad der Bounding-Box,
 *      Kreis ~0.785), Seitenverhaeltnis, und deutlich heller als der Bildschnitt.
 *   5. Bester Blob gewinnt -> 'red' | 'amber' | 'green' | null.
 *
 * Danach glaettet die Zustandsmaschine (AmpelState) das Ergebnis ueber mehrere
 * Frames, damit ein einzelner Fehltreffer keinen Alarm ausloest.
 * ==========================================================================*/
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AmpelDetect = api;
})(typeof self !== 'undefined' ? self : this, function () {

  const DEFAULTS = {
    minValue:         0.55, // HSV V: ab hier gilt ein Pixel als "leuchtend"
    minSat:           0.40, // HSV S: Ampel-LEDs sind stark gesaettigt
    minBlobPx:        8,    // Mindestflaeche in Pixeln der verkleinerten Analyse
    minFill:          0.42, // Blobflaeche / Bounding-Box (Kreis = 0.785)
    maxAspect:        2.4,  // Breite/Hoehe bzw. Hoehe/Breite
    brightnessFactor: 1.15, // Blob muss um diesen Faktor heller sein als das Bild
    // Farbtonfenster in Grad (0..360). Rot laeuft ueber die 0-Grenze.
    hue: {
      redLow: 340, redHigh: 14,
      amberLow: 14, amberHigh: 50,
      greenLow: 85, greenHigh: 200,
    },
  };

  /* ── Pixel -> Farbklasse ─────────────────────────────────────────────── */
  function classifyPixel(r, g, b, o) {
    const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
    const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
    const v = max / 255;
    if (v < o.minValue) return null;
    const d = max - min;
    const s = max === 0 ? 0 : d / max;
    if (s < o.minSat) return null;

    let h;
    if (d === 0) return null;
    if (max === r)      h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else                h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;

    const H = o.hue;
    if (h >= H.redLow || h < H.redHigh)      return 'red';
    if (h >= H.amberLow && h < H.amberHigh)  return 'amber';
    if (h >= H.greenLow && h <= H.greenHigh) return 'green';
    return null;
  }

  const CLASSES = ['red', 'amber', 'green'];

  /**
   * Wertet einen Frame aus.
   * @param {{data:Uint8ClampedArray|Array, width:number, height:number}} img
   * @param {object} [options]
   * @returns {{color:string|null, score:number, blob:object|null, meanV:number, blobs:object}}
   */
  function analyzeFrame(img, options) {
    const o = Object.assign({}, DEFAULTS, options || {});
    o.hue = Object.assign({}, DEFAULTS.hue, (options && options.hue) || {});
    const w = img.width, h = img.height, px = img.data;
    const n = w * h;

    // Maske: 0 = uninteressant, 1..3 = Farbklasse (Index in CLASSES + 1)
    const mask = new Uint8Array(n);
    const val  = new Float32Array(n);
    let sumV = 0;

    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const r = px[p], g = px[p + 1], b = px[p + 2];
      const maxc = r > g ? (r > b ? r : b) : (g > b ? g : b);
      val[i] = maxc / 255;
      sumV += val[i];
      const c = classifyPixel(r, g, b, o);
      if (c) mask[i] = CLASSES.indexOf(c) + 1;
    }
    const meanV = sumV / n;

    // Flood-Fill je Farbklasse (4-Nachbarschaft, iterativ ueber einen Stack).
    const seen  = new Uint8Array(n);
    const stack = new Int32Array(n);
    const best  = { red: null, amber: null, green: null };

    for (let i = 0; i < n; i++) {
      const cls = mask[i];
      if (!cls || seen[i]) continue;

      let sp = 0, area = 0, sumBlobV = 0;
      let minX = w, maxX = -1, minY = h, maxY = -1;
      stack[sp++] = i; seen[i] = 1;

      while (sp > 0) {
        const q = stack[--sp];
        const x = q % w, y = (q / w) | 0;
        area++; sumBlobV += val[q];
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;

        if (x > 0     && !seen[q - 1] && mask[q - 1] === cls) { seen[q - 1] = 1; stack[sp++] = q - 1; }
        if (x < w - 1 && !seen[q + 1] && mask[q + 1] === cls) { seen[q + 1] = 1; stack[sp++] = q + 1; }
        if (y > 0     && !seen[q - w] && mask[q - w] === cls) { seen[q - w] = 1; stack[sp++] = q - w; }
        if (y < h - 1 && !seen[q + w] && mask[q + w] === cls) { seen[q + w] = 1; stack[sp++] = q + w; }
      }

      if (area < o.minBlobPx) continue;

      const bw = maxX - minX + 1, bh = maxY - minY + 1;
      const fill = area / (bw * bh);
      const aspect = bw > bh ? bw / bh : bh / bw;
      const blobV = sumBlobV / area;
      if (fill < o.minFill) continue;
      if (aspect > o.maxAspect) continue;
      if (blobV < meanV * o.brightnessFactor) continue;

      const name = CLASSES[cls - 1];
      // Score: Flaeche gewichtet mit Rundheit und Helligkeitsvorsprung.
      const score = area * fill * (blobV / Math.max(meanV, 0.05));
      const blob = {
        color: name, area, fill, aspect, brightness: blobV, score,
        x: minX, y: minY, w: bw, h: bh,
        cx: (minX + maxX + 1) / 2 / w, cy: (minY + maxY + 1) / 2 / h, // 0..1 relativ
      };
      if (!best[name] || blob.score > best[name].score) best[name] = blob;
    }

    let winner = null;
    for (const c of CLASSES) if (best[c] && (!winner || best[c].score > winner.score)) winner = best[c];

    return {
      color: winner ? winner.color : null,
      score: winner ? winner.score : 0,
      blob: winner,
      meanV,
      blobs: best,
    };
  }

  /* ── Zustandsmaschine ────────────────────────────────────────────────── *
   * Ein einzelner Frame reicht nie fuer einen Alarm: erst wenn dieselbe
   * Farbe `confirmFrames` mal hintereinander erkannt wurde, gilt sie als
   * bestaetigt. Ausgeloest wird beim Wechsel nach Gruen (und optional bei
   * Gelb), gebremst durch eine Sperrzeit.                                  */
  function AmpelState(opts) {
    const o = Object.assign({
      confirmFrames: 3,      // so viele gleiche Frames = bestaetigter Zustand
      lostFrames:    6,      // so viele Frames ohne Fund = "keine Ampel"
      cooldownMs:    3000,   // Mindestabstand zwischen zwei Alarmen
      alertAmber:    false,  // auch bei Gelb melden
      requireRedFirst: true, // Gruen-Alarm nur nach zuvor gesehenem Rot/Gelb
    }, opts || {});

    this.opts = o;
    this.state = null;        // bestaetigter Zustand
    this.candidate = null;    // laufender Kandidat
    this.streak = 0;
    this.lost = 0;
    // Sperrzeit wird PRO Alarmart gefuehrt: Rot-Gelb geht real nur ~1 s dem
    // Gruen voraus — eine gemeinsame Sperre wuerde die Gruen-Meldung schlucken.
    this.lastAlertAt = { green: -Infinity, amber: -Infinity };
    this.sawStop = false;     // Rot oder Gelb wurde bestaetigt gesehen
  }

  /**
   * @param {string|null} color Ergebnis von analyzeFrame().color
   * @param {number} now Zeitstempel in ms
   * @returns {{type:string, color:string, at:number}|null} Alarm oder null
   */
  AmpelState.prototype.push = function (color, now) {
    const o = this.opts;

    if (color === null) {
      this.lost++;
      this.candidate = null;
      this.streak = 0;
      if (this.lost >= o.lostFrames) { this.state = null; }
      return null;
    }
    this.lost = 0;

    if (color === this.candidate) this.streak++;
    else { this.candidate = color; this.streak = 1; }

    if (this.streak < o.confirmFrames) return null;

    const prev = this.state;
    if (color === prev) return null; // Zustand haelt an -> kein neues Ereignis
    this.state = color;

    if (color === 'red' || color === 'amber') this.sawStop = true;

    let alert = null;
    if (color === 'green' && (!o.requireRedFirst || this.sawStop)) {
      alert = { type: 'green', color: 'green', at: now };
      this.sawStop = false;
    } else if (color === 'amber' && o.alertAmber) {
      alert = { type: 'amber', color: 'amber', at: now };
    }

    if (!alert) return null;
    if (now - this.lastAlertAt[alert.type] < o.cooldownMs) return null;
    this.lastAlertAt[alert.type] = now;
    return alert;
  };

  AmpelState.prototype.reset = function () {
    this.state = null; this.candidate = null; this.streak = 0;
    this.lost = 0; this.sawStop = false;
    this.lastAlertAt = { green: -Infinity, amber: -Infinity };
  };

  return { DEFAULTS, analyzeFrame, classifyPixel, AmpelState };
});
