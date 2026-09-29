# Cooler Walks

Ein Atlas für bessere Fusswege: echte Routen, mehr Grün, Wassernähe, geschätzte Sonne oder Schatten und verkehrsberuhigte Wege in Zürich.

**Öffnen:** [Deutsche Website](https://coolerwalks.ch/de/) · [Direkt zum Planer](https://coolerwalks.ch/de/?view=planner) · [English / technische Dokumentation](README.md)

Die Pilotgebiete umfassen das Zentrum von Zürich (8,06 km²), München (8,90 km²), Cambridge, Massachusetts (Gemeindegrenze, 18,46 km²) und Basel (10,25 km²). Die Karte zeigt die tatsächliche Grenze. Zürich und München bieten experimentelle Gebäudeschattenschätzungen; Cambridge und Basel Grün- und Wassernähe. Baumschatten, Gelände, Wetter und Live-Navigation sind nicht enthalten.

In Zürich berücksichtigt **Verkehrsberuhigt bevorzugen** offizielle Fussgänger-, Begegnungs- und Tempo-30-Zonen sowie die Nähe zu kartierten Hauptstrassen. Die Route reduziert zuerst die Strecke nahe Hauptstrassen und hält dein Umweglimit ein. Das ist ein Strassenindikator, keine Messung von Verkehrsaufkommen, Lärm oder Sicherheit. [Daten und Berechnung](docs/traffic.md)

Wähle Start, Ziel, bis zu drei Zwischenziele, Startzeit und 0/5/10 zusätzliche Minuten. EN/DE wechselt die Sprache, ohne den aktuellen Weg zurückzusetzen. Ortsnamen, Zeitzone der Route und Einheiten sind davon unabhängig. Die Website funktioniert ohne Installation; PWA und native Android/iOS-Entwicklungsprojekte teilen denselben Planer. Es gibt noch keine App-Store-Veröffentlichung.

## Lokal entwickeln

Node.js 22.12+ und npm; keine API-Schlüssel erforderlich. Aufbereitete Pilotdaten sind enthalten.

```sh
npm ci
npm run dev
```

Öffne `http://127.0.0.1:5173/de/` oder `/de/?view=planner`.

```sh
npm run check
npm run data:verify
npm run build
npm run preview -- --port 4173
```

Das englische [README](README.md) dokumentiert Browserprüfungen, Datenaufbereitung, Hosting, App-Builds und Store-Vorbereitung. [Sprachpflege](docs/localization.md), [Quellen](docs/data-sources.md), [Abdeckung](docs/cities.md) und [Modellgrenzen](docs/traffic.md) gehören zur Projektdokumentation. Rohdaten und Zugangsdaten bleiben ausserhalb von Git.
