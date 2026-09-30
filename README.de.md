# Cooler Walks

Ein Atlas für bessere Fusswege: echte Routen, mehr Grün, Wassernähe, geschätzte Sonne oder Schatten und verkehrsberuhigte Wege in Zürich.

**Öffnen:** [Deutsche Website](https://coolerwalks.ch/de/) · [Direkt zum Planer](https://coolerwalks.ch/de/?view=planner) · [English / technische Dokumentation](README.md)

**Zürich ist unser Schwerpunkt:** 57,77 km² mit Oerlikon, Altstetten, Höngg, dem Zentrum, Wiedikon und Seefeld. Basel (10,25 km²), München (8,90 km²) und Cambridge, Massachusetts (18,46 km²) bleiben **Beta**. Die Karte zeigt die tatsächliche Grenze. Zürich und München bieten experimentelle Gebäudeschattenschätzungen; Cambridge und Basel Grün- und Wassernähe. Baumschatten, Gelände, Wetter und Live-Navigation sind nicht enthalten.

In Zürich berücksichtigt **Verkehrsberuhigt bevorzugen** offizielle Fussgänger-, Begegnungs- und Tempo-30-Zonen sowie die Nähe zu kartierten Hauptstrassen. Die Route reduziert zuerst die Strecke nahe Hauptstrassen und hält dein Umweglimit ein. Das ist ein Strassenindikator, keine Messung von Verkehrsaufkommen, Lärm oder Sicherheit. [Daten und Berechnung](docs/traffic.md)

Wähle Start, Ziel, bis zu drei Zwischenziele, Startzeit und 0/5/10 zusätzliche Minuten. EN/DE wechselt die Sprache, ohne den aktuellen Weg zurückzusetzen. Ortsnamen, Zeitzone der Route und Einheiten sind davon unabhängig. Die Website funktioniert ohne Installation; PWA und native Android/iOS-Entwicklungsprojekte teilen denselben Planer. Es gibt noch keine App-Store-Veröffentlichung.

**Fahrzeugzählungen in der Nähe:** 144 gerichtete Messstellen an 80 Standorten im Zürcher Pilotgebiet. Die Ansicht zeigt historische Durchschnittswerte aus 2025 für den gewählten Wochentag und die Stunde, mit Datenvollständigkeit und nummerierten Kartenmarkern. Keine Live-Daten oder Vorhersage. Die lückenhaften Zählungen ändern die Routenbewertung nicht; fehlende Messstellen bedeuten unbekannten Verkehr. [Quellen und Aufbereitung](docs/vehicle-counts.md)

Zum Ausprobieren: Bahnhofquai → Bürkliplatz, Montag **22. Juni 2026 um 14:00 Uhr**, «Schnellster Weg» wählen und «Fahrzeugzählungen in der Nähe» öffnen. Die drei Messstellen zeigen gerundet 310, 1.220 und 360 Fahrzeuge pro Stunde – historische Montag-14-Uhr-Mittel aus 2025. Für die verkehrsberuhigte Alternative fehlen passende Zählungen; ihr Verkehrsaufkommen bleibt unbekannt.

**Adresssuche:** 56.704 bestehende amtliche Zürcher Adressen sind offline durchsuchbar, davon 45.795 innerhalb des Gehgebiets. Strasse, Hausnummer und optional PLZ eingeben; alternativ auf die Karte tippen und Start, Ziel oder Zwischenziel wählen. Punkte ausserhalb des Gehgebiets ergeben keine Route. Adresspunkte sind keine geprüften Eingänge. [Quellen und Aufbereitung](docs/zurich-north-west.md)

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
