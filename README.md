# VoltDetective

Interaktives Stromkreis-Spiel (ElektroGenius) — echte, zustandsbasierte Simulation
statt starrer Klicks. Der Spieler findet Fehler an Sicherung, Serienschalter
(Merten-Prinzip, zwei Wippen) und Lampenkette.

- **Live:** https://spiel.elektrogenius.de
- **Stack:** reines HTML/CSS/JS (kein Build), GitHub Pages
- **Start lokal:** `index.html` im Browser öffnen (oder `python -m http.server`)

## Kernlogik

Jede Lampe wird nie direkt geschaltet, sondern abgeleitet:

```
Lampe.leuchtet = Sicherung.istAn && Schalter.istAn && Verkabelung.istIntakt && Glühwendel.intakt
```

## Struktur

| Datei | Zweck |
|---|---|
| `js/config.js` | Zentrale Config (Wahrscheinlichkeiten, Timing) |
| `js/simulation.js` | Kern-Engine: Zustand + Boolean-AND-Auswertung |
| `js/faults.js` | Fehler-Generator (echte Defekte vs. 30%-Trap) |
| `js/ui.js` | UI, Interaktions-Matrix, Detail-Ansicht |
| `js/main.js` | Bootstrap & Spiel-Zustand |
| `js/ampel-detect.js` | Ampel-Assistent: Erkennungs-Engine (DOM-frei, in Node testbar) |
| `js/ampel.js` | Ampel-Assistent: Kamera, Alarm, Bedienung |

## Ampel-Assistent (`ampel.html`)

Kamerabasierte Ampelerkennung fürs Handy in der Windschutzscheiben-Halterung:
Beim bestätigten Wechsel auf Gelb/Grün gibt es Ton, Vibration und optional eine
Sprachansage. Alles läuft lokal im Browser — kein Bild verlässt das Gerät.

**Verfahren** (bewusst ohne KI-Modell, damit es auf jedem Handy in Echtzeit läuft):
Suchbereich ausschneiden → auf 128×96 verkleinern → HSV-Klassifikation heller,
gesättigter Pixel → Blobs per Flood-Fill → Filter auf Fläche, Rundheit und
Helligkeitsvorsprung → Zustandsmaschine mit N-Frame-Bestätigung und Sperrzeit
je Alarmart.

`js/ampel-detect.js` ist DOM-frei und exportiert auch für Node
(`module.exports`), damit die Erkennung mit synthetischen Frames prüfbar ist.
Der **Demo-Modus** in der Seite speist eine gezeichnete Ampel durch dieselbe
Kette — so lässt sich Erkennung → Ton → Vibration ohne Auto testen.

> Test- und Studienwerkzeug, kein zugelassenes Fahrerassistenzsystem. Ersetzt
> nicht den Blick auf die Ampel; verantwortlich bleibt die fahrende Person.
