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
