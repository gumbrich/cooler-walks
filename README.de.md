# Cooler Walks

**0.23.0 — München:** 3D-Gebäudeschatten, Höhenprofile und flachere Wege, verkehrsberuhigte Routen, Tempo-30-Strassen, 5.516 suchbare Adressen und das Meiden erfasster Hindernisse. Website, PWA und Android-App nutzen dieselben Funktionen im bisherigen **8,90 km² grossen Beta-Gebiet**. Baumschatten, vollständige Gehwegseiten und Fahrzeugzählungen bleiben offen. [Funktionen, Daten, Prüfungen und offene Punkte](docs/munich.md).

**0.22.0:** Sonne und Schatten beeinflussen die Routenwahl auch bei lückenhaften Baumdaten. Unbekannte Abschnitte dürfen einen Weg nicht besser erscheinen lassen; gegebenenfalls vergleicht die App ausdrücklich den Gebäudeschatten. Bei 48 Zürcher Berechnungen liefern Sonne und Schatten in 19 von 24 Weg-/Zeitpaaren unterschiedliche Wege. [Änderung, Prüfungen und Grenzen](docs/shade-routing-recovery.md).

**0.21.0:** Trottoirs und Querungen sind das Zürcher Standardnetz. Zwei Schaltflächen wählen Schatten oder Sonne; die Oberfläche wechselt zwischen Grün und warmen Sandtönen. Der Umweg ist mit 0/5/10/15 Minuten oder minutengenau einstellbar. Verkehrsberuhigt, Am Wasser, Flachere Wege und Barrierefreiheit lassen sich ohne nummerierte Reihenfolge kombinieren. Die Website bleibt passwortgeschützt. [Funktionsweise](docs/preferences.md) · [Zugangsschutz](docs/private-access.md).

**Barrierefreiheit:** meidet erfasste Treppen und Hindernisse und bevorzugt geringere Steigungen. Randsteine, Breiten, Beläge und Liftbetrieb sind nicht vollständig erfasst; keine Zusicherung durchgängiger Barrierefreiheit. [Grenzen](docs/accessibility-routing.md).

**Höhenprofil 0.19.0:** In Zürich **Flachere Wege bevorzugen** aktivieren. Auf- und Abstieg sowie das Höhenprofil werden mit dem kantonalen Geländemodell geschätzt – auf beiden Fusswegnetzen und innerhalb des gewählten Umwegs. Fehlende Weghöhen verhindern einen Vergleich; auch flachere Wege können Treppen enthalten. [Methode und Prüfungen](docs/elevation.md).

**Baumschatten:** im gesamten unterstützten Zürcher Kartengebiet (57,77 km²) integriert. 324 Kacheln aus klassifizierten LiDAR-Punkten liefern möglichen Baumschatten unter der Annahme dichter, voller Belaubung. Datenlücken bleiben unbekannt; saisonaler Laubverlust und Genauigkeit vor Ort sind noch nicht bestätigt. Online werden nur benötigte Kacheln geladen. [Methode und Grenzen](docs/tree-shade-expansion.md).

**Trottoirs und Querungen:** Adresse oder Kartenpunkt eingeben, dann die erreichbare Gehwegseite wählen. 25’740 amtliche Weg- und Querungsabschnitte decken das Zürcher Kartengebiet ab. Verkehrsberuhigung, Wasser und Höhenprofil sind hier verfügbar. [Planer öffnen](https://coolerwalks.ch/de/?view=planner) · [Daten und Prüfungen](docs/pavement-pilot.md).

Fusswege nach geschätztem Schatten, Grün, Wassernähe und Verkehrsberuhigung vergleichen.

**Oberfläche seit 0.12.0:** kürzere, direkte Texte auf Deutsch und Englisch. Kompakte Routenkarten; auf dem Handy steht die Startzeit direkt über den Ergebnissen. Website und native App nutzen dieselbe Oberfläche.

**Öffnen:** [Deutsche Website](https://coolerwalks.ch/de/) · [Direkt zum Planer](https://coolerwalks.ch/de/?view=planner) · [English / technische Dokumentation](README.md)

**Validierungsstand:** Das Verkehrsmodell wird weiterentwickelt. Schatten und Verkehr werden später vor Ort geprüft; beide bleiben experimentell. Offene Dach-Datenunterschiede und Schattenbeobachtungen bleiben zu klären, die gewünschte Erweiterung der 3D-Bibliothek bleibt experimentell. [Prüfergebnisse](docs/shadow-validation.md).

Die [aktuelle Untersuchung](docs/shadow-validation-followup.md) prüft alle 26 auffälligen Dachpunkte anhand der ursprünglichen LiDAR-Messpunkte sowie 14 Foto-Originale und deren Zeitangaben. Drei Fotos kommen für weitere Prüfungen infrage; ein vorläufiger Widerspruch am Münsterhof bleibt offen. Die Genauigkeit im Freien ist damit noch nicht bestätigt.

**Verkehr 0.11.0:** separate Wege und verkehrsbeschränkte Strassen werden von Tempo-30- und Begegnungszonen unterschieden. Verglichen werden absolute Strecken; historische Zählwerte beziehen sich auf die geschätzte Vorbeigehzeit. [Methode und Vor-Ort-Plan](docs/traffic.md).

**Zürich ist unser Schwerpunkt:** 57,77 km² mit Oerlikon, Altstetten, Höngg, dem Zentrum, Wiedikon und Seefeld. Basel (10,25 km²), München (8,90 km²) und Cambridge, Massachusetts (18,46 km²) bleiben **Beta**. Die Karte zeigt die tatsächliche Grenze. Zürich und München bieten experimentelle Gebäudeschattenschätzungen; Cambridge und Basel Grün- und Wassernähe. Baumschatten ist nur in Zürich integriert. Geländeschatten, Wetter und Live-Navigation sind nicht enthalten.

In Zürich berücksichtigt **Verkehrsberuhigt bevorzugen** offizielle Fussgänger-, Begegnungs- und Tempo-30-Zonen sowie die Nähe zu kartierten Hauptstrassen. Die Auswahl berücksichtigt Verkehrsmerkmale gemeinsam mit deinen weiteren Wünschen und hält dein Umweglimit ein. Das ist ein Strassenindikator, keine Messung von Verkehrsaufkommen, Lärm oder Sicherheit. [Daten und Berechnung](docs/traffic.md)

Wähle Start, Ziel, bis zu drei Zwischenziele, Startzeit und 0–15 zusätzliche Minuten. EN/DE wechselt die Sprache, ohne den aktuellen Weg zurückzusetzen. Ortsnamen, Zeitzone der Route und Einheiten sind davon unabhängig. Die Website funktioniert ohne Installation; PWA und native Android/iOS-Entwicklungsprojekte teilen denselben Planer. Es gibt noch keine App-Store-Veröffentlichung.

**3D-Dächer und LiDAR-Bodenhöhen · 0.13.0:** Das detaillierte Modell deckt jetzt alle 57,77 km² des unterstützten Zürcher Gehgebiets ab – etwa 17,2-mal so viel wie zuvor. 81 Kacheln enthalten 41.042 Gebäude einschliesslich der Umgebung, die Schatten hineinwerfen kann. Online werden nur benötigte Kacheln geladen; der damalige Zürich-Download umfasste 80,2 MB (mit Baumschatten heute rund 205 MB). Die ganze Stadtgemeinde ist damit noch nicht abgedeckt. [Daten und Prüfungen](docs/shade-library.md). Baumschatten ist inzwischen integriert, Geländeschatten fehlt; eine Überprüfung mit zeitlich dokumentierten Schattenbeobachtungen steht noch aus. [Methode und Daten](docs/detailed-shade.md)

**Schatten unterwegs · 0.9.0:** Der Sonnenstand wird für deine erwartete Ankunft an jedem Prüfpunkt entlang des Wegs berechnet. Jede Alternative berücksichtigt ihre eigene Gehzeit und alle Etappen über Zwischenziele. Die Karten zeigen die erwartete Ankunftszeit. Bei einem Wechsel zu tiefem Sonnenstand oder Dunkelheit entfällt der Schattenvergleich. Grundlage sind 4,8 km/h ohne Pausen oder Wartezeiten. Baumschatten ist inzwischen integriert; Geländeschatten fehlt.

**Fahrzeugzählungen in der Nähe:** 144 gerichtete Messstellen an 80 Standorten im Zürcher Pilotgebiet. Die Ansicht zeigt historische Durchschnittswerte aus 2025 für den gewählten Wochentag und die Stunde, mit Datenvollständigkeit und nummerierten Kartenmarkern. Keine Live-Daten oder Vorhersage. Die lückenhaften Zählungen ändern die Routenbewertung nicht; fehlende Messstellen bedeuten unbekannten Verkehr. [Quellen und Aufbereitung](docs/vehicle-counts.md)

Zum Ausprobieren: Bahnhofquai / Museumstrasse → Bürkliplatz / Stadthausquai, Montag **22. Juni 2026 um 14:00 Uhr**, «Schnellster Weg» wählen und «Fahrzeugzählungen in der Nähe» öffnen. Angezeigt werden historische Stundenmittel aus 2025, keine aktuellen Messungen.

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
