# Zurich traffic field-validation plan

Prepared for 0.11.0. **No field observations have been collected in this pass.** The user has deferred shadow and traffic field validation. Software regressions and source metadata checks do not establish real-world traffic benefits. Keep the [shadow protocol](shadow-observations.md) separate.

## What to check

The traffic model predicts mapped street context, not a vehicle count or sound level. Validate its inputs first: pedestrian/restricted versus motor-access streets, actual Tempo-30 and Begegnungszone signs, main-road proximity, crossings, deliveries, bridges/tunnels, and changes since the source snapshot. Then assess whether the selected alternative is preferable on the ground. A correct map classification can still produce an unpleasant route.

Use the three [recorded route pairs](traffic-route-validation.json) as initial walks: Bahnhofquai–Bürkliplatz, Bahnhof Oerlikon–Campus Irchel, and Stauffacherstrasse–Lindenhof. Preserve model/data versions and predictions before observing. Select six representative locations per pair, including at least one main-road segment, one path/restricted area, one T20/T30 street and one crossing or level-sensitive association where available. Choose points independently of whether their predictions look favourable; record missing categories rather than inventing examples.

## Observation record

Record exact date, local time and UTC offset, location/accuracy, route/segment identifier, visible signs and a timestamped photo where appropriate. Describe motor-access exceptions separately from the signed regime. Note roadworks, diversions, unusual events and weather. Keep precise field records and original photographs in ignored `data/raw/traffic-validation/`; publish only reviewed, de-identified evidence.

For vehicle counts, use a fixed **15-minute interval** at a defined observation line. Record each direction separately, distinguishing cars/vans, heavy vehicles, buses, trams and cycles. Mark interrupted/incomplete sessions. Do not add counts from different streets into a route-wide total, extrapolate a short interval to a definitive daily volume, or infer noise from vehicle numbers. Subjective noise/comfort notes are qualitative; phone audio is not a calibrated sound meter.

Repeat the paired observations on at least two ordinary weekdays, covering a daytime and a peak-hour interval. Prefer simultaneous observers; otherwise alternate which route is observed first and retain exact windows. A single route walked at a quieter time is not evidence that the routing preference reduced traffic.

## Review before claims

- Review every incorrectly tagged/associated point, especially a main road classified as a separate path, a crossing treated as a quiet link, or an incorrect bridge/tunnel level. Preserve failures and their cause; do not quietly move sample locations.
- Before calling mapped context validated for these test trips, require at least 90% agreement among independently classifiable points and no unresolved main-road/level misclassification that changes the selected route. Retain unknown/ambiguous points and report the denominator. This is a local engineering acceptance criterion, not a citywide confidence probability.
- Report paired traffic observations with their actual intervals and vehicle classes. Do not claim a quantified reduction or update a model weight from a handful of observations. First assess repeatability, temporal comparability and coverage; design an adequate separate study before generalizing.
- Compare the 2025 weekday/hour counter reference with current observations only as historical context. Changed traffic patterns and a 15-minute sample differ from an annual hourly mean. Nearby counters are not proof that the walker is on the measured street or the same level.
- A zero-extra-time request must still return the fastest valid route; actual crossing waits and individual walking speeds are not modelled. Keep the app's 80 m/min duration assumption visible in the method.

Version any data/ranking correction and rerun affected automated checks before publication. A good field result on these trips does not establish live traffic accuracy, safety, noise reduction or citywide performance.
