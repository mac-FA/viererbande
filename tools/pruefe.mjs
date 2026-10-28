// Prüft js/raetsel.js auf Formfehler: 4 Gruppen × 4 Wörter, keine Dubletten,
// keine leeren Titel. Mehrdeutigkeiten (Wort passt gleichwertig in zwei Gruppen)
// kann das Skript nicht erkennen – die bleiben Handarbeit.
// Aufruf:  node tools/pruefe.mjs
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const quelle = readFileSync(new URL('../js/raetsel.js', import.meta.url), 'utf8');
const ctx = { module: {} };
vm.runInNewContext(quelle, ctx);
const RAETSEL = ctx.module.exports;

let fehler = 0;
const melde = (nr, text) => { fehler++; console.log(`Rätsel ${nr}: ${text}`); };
const klar = w => w.replace(/\|/g, '');
const titelZaehler = new Map();

RAETSEL.forEach((r, i) => {
  const nr = i + 1;
  if (r.length !== 4) melde(nr, `${r.length} statt 4 Gruppen`);
  const gesehen = new Set();
  for (const g of r) {
    if (g.length !== 5) melde(nr, `Gruppe "${g[0]}" hat ${g.length - 1} statt 4 Wörter`);
    if (!g[0] || !g[0].trim()) melde(nr, 'leerer Gruppentitel');
    titelZaehler.set(g[0], (titelZaehler.get(g[0]) || 0) + 1);
    for (const w of g.slice(1)) {
      const k = klar(w).toLocaleLowerCase('de');
      if (!k.trim()) melde(nr, `leeres Wort in "${g[0]}"`);
      if (gesehen.has(k)) melde(nr, `Wort doppelt: ${klar(w)}`);
      gesehen.add(k);
      // Lange Wörter ohne Trennstelle passen auf dem Handy schlecht in die Kachel
      const laengstes = Math.max(...w.split('|').map(t => t.length));
      if (laengstes > 11) melde(nr, `"${klar(w)}" braucht eine Trennstelle (|)`);
    }
  }
});

const doppelt = [...titelZaehler].filter(([, n]) => n > 1).map(([t, n]) => `${t} (${n}×)`);
console.log(`${RAETSEL.length} Rätsel geprüft, ${fehler} Fehler.`);
if (doppelt.length) console.log(`Hinweis – Gruppentitel mehrfach: ${doppelt.join(', ')}`);
process.exit(fehler ? 1 : 0);
