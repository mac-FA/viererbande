# Viererbande

Deutscher Klon von „Connections“: 16 Begriffe, vier Gruppen à vier, höchstens vier Fehler.
Statisches Vanilla-JS, läuft als PWA (offline spielbar über `sw.js`).

**Live: https://mac-fa.github.io/viererbande/** – Repo `mac-FA/viererbande`, Pages aus `main` (Root). Jeder Push auf `main` ist ein neues Deployment.

- **Tagesrätsel:** Nr. 1 = 28.10.2026, danach jeden Tag das nächste der 60 Rätsel aus `js/raetsel.js` (läuft nach dem letzten wieder von vorn).
- **Archiv:** alle Rätsel jederzeit spielbar, Direktlink `#7` öffnet Rätsel 7.
- **Statistik, Serie, Teilen** (Emoji-Raster), Hell/Dunkel, „Einer fehlt …“-Hinweis.

## Lokal starten

```
node node_modules/http-server/bin/http-server Viererbande -p 8124 -c-1
```
(aus dem Ordner „Claude Code“; in `.claude/launch.json` als `viererbande` eingetragen)

## Neue Rätsel

In `js/raetsel.js` hinten anhängen – vorne einfügen verschiebt alle Tagesrätsel.
Gruppenreihenfolge = Schwierigkeit (gelb, grün, blau, lila). Lange Wörter bekommen
mit `|` Trennstellen. Danach prüfen:

```
node tools/pruefe.mjs
```

Das Skript findet Formfehler, aber keine Mehrdeutigkeiten. Faustregel: Ein Ablenker
darf in eine zweite Gruppe passen, aber es darf kein Wortpaar geben, das man zwischen
zwei Gruppen tauschen kann und dabei wieder vier gültige Gruppen erhält.
