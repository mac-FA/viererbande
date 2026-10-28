'use strict';

(() => {
  const FARBEN = ['gelb', 'gruen', 'blau', 'lila'];
  const EMOJI = ['🟨', '🟩', '🟦', '🟪'];
  const START = Date.UTC(2026, 9, 28);            // Tagesrätsel Nr. 1 = 28.10.2026
  const SPEICHER = 'viererbande-v1';
  const BEWEGUNG = !matchMedia('(prefers-reduced-motion: reduce)').matches;

  const $ = s => document.querySelector(s);
  const warte = ms => new Promise(r => setTimeout(r, BEWEGUNG ? ms : 0));
  const klar = w => w.replace(/\|/g, '');
  const gross = w => w.replace(/ß/g, 'ẞ').toUpperCase();
  const anzeige = w => gross(w).replace(/\|/g, '­');

  function heuteNr() {
    const d = new Date();
    return Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - START) / 864e5) + 1;
  }
  const tagesNr = Math.max(1, heuteNr());
  const tagesId = (tagesNr - 1) % RAETSEL.length;

  // ---------- Speicher ----------
  const leer = () => ({
    spiele: {},
    statistik: { gespielt: 0, gewonnen: 0, perfekt: 0, verteilung: [0, 0, 0, 0, 0], serie: 0, besteSerie: 0, letzterSieg: 0 },
    dunkel: null,
    hilfeGesehen: false,
  });
  let daten;
  try { daten = Object.assign(leer(), JSON.parse(localStorage.getItem(SPEICHER)) || {}); } catch (e) { daten = leer(); }
  const speichern = () => { try { localStorage.setItem(SPEICHER, JSON.stringify(daten)); } catch (e) {} };

  // ---------- Zufall ----------
  function zufall(seed) {
    return () => {
      seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function mische(arr, rnd = Math.random) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // ---------- Spielzustand ----------
  const brett = $('#brett');
  const kacheln = new Map();   // Wort → Kachel-Element
  const balken = new Map();    // Gruppenindex → Balken-Element
  let id, gruppen, gruppeVon, roh, z;
  let auswahl = new Set();
  let sperre = false;

  function lade(neueId) {
    id = neueId;
    gruppen = RAETSEL[id].map(([titel, ...ws]) => ({ titel, woerter: ws.map(klar), roh: ws }));
    gruppeVon = {}; roh = {};
    gruppen.forEach((g, gi) => g.roh.forEach(w => { gruppeVon[klar(w)] = gi; roh[klar(w)] = w; }));
    z = daten.spiele[id] || {
      reihenfolge: mische(Object.keys(gruppeVon), zufall(id * 7919 + 17)),
      geloest: [], fehler: 0, versuche: [], fertig: false, gewonnen: false,
    };
    auswahl = new Set();
    sperre = false;
    baueBrett();
    render(false);
    kopfzeile();
  }

  // Erst beim ersten Zug zählt ein Rätsel als begonnen
  function merke() { daten.spiele[id] = z; speichern(); }

  function baueBrett() {
    brett.textContent = '';
    kacheln.clear();
    balken.clear();
    for (const w of Object.keys(gruppeVon)) {
      const k = document.createElement('button');
      k.type = 'button';
      k.className = 'kachel';
      const s = document.createElement('span');
      s.textContent = anzeige(roh[w]);
      k.append(s);
      k._roh = roh[w];
      k.addEventListener('click', () => waehle(w));
      kacheln.set(w, k);
    }
  }

  function baueBalken(gi, neu) {
    const b = document.createElement('div');
    b.className = `balken ${FARBEN[gi]}${neu ? ' neu' : ''}`;
    const t = document.createElement('strong');
    t.textContent = gross(gruppen[gi].titel);
    const ws = document.createElement('span');
    ws.textContent = gruppen[gi].woerter.map(gross).join(', ');
    b.append(t, ws);
    return b;
  }

  function render(animieren = true) {
    const vorher = animieren && BEWEGUNG ? positionen() : null;
    for (const gi of z.geloest) if (!balken.has(gi)) balken.set(gi, baueBalken(gi, animieren));
    kacheln.forEach((k, w) => { if (!z.reihenfolge.includes(w)) k.remove(); });
    for (const gi of z.geloest) brett.append(balken.get(gi));
    for (const w of z.reihenfolge) brett.append(kacheln.get(w));
    kacheln.forEach((k, w) => {
      k.classList.toggle('gewaehlt', auswahl.has(w));
      k.setAttribute('aria-pressed', auswahl.has(w));
      k.disabled = z.fertig;
    });
    if (vorher) flip(vorher);
    passeAlle();
    fehlerAnzeige();
    knoepfe();
  }

  // FLIP: Kacheln gleiten von ihrer alten an die neue Position
  function positionen() {
    const m = new Map();
    kacheln.forEach((k, w) => { if (k.isConnected) m.set(w, k.getBoundingClientRect()); });
    return m;
  }
  function flip(vorher) {
    kacheln.forEach((k, w) => {
      const a = vorher.get(w);
      if (!a || !k.isConnected) return;
      const b = k.getBoundingClientRect();
      const dx = a.left - b.left, dy = a.top - b.top;
      if (!dx && !dy) return;
      k.style.transition = 'none';
      k.style.transform = `translate(${dx}px, ${dy}px)`;
      k.offsetWidth;
      k.style.transition = 'transform .4s cubic-bezier(.3, .7, .3, 1), background-color .15s, color .15s';
      k.style.transform = '';
    });
  }

  // Schrift verkleinern, bis das Wort in die Kachel passt. Erst ungetrennt
  // (bis 80 % der Grundgröße), danach an den Trennstellen umbrechen.
  function passe(k) {
    const s = k.firstChild;
    const breite = k.clientWidth;
    if (!breite || k._breite === breite) return;
    k._breite = breite;
    const maxH = k.clientHeight - 6;
    const zuGross = () => s.scrollWidth > s.clientWidth || s.offsetHeight > maxH;
    const schrumpfe = grenze => {
      s.style.fontSize = '';
      let f = parseFloat(getComputedStyle(s).fontSize);
      const min = f * grenze;
      while (f > min && zuGross()) { f -= 0.5; s.style.fontSize = f + 'px'; }
      return !zuGross();
    };
    s.textContent = gross(klar(k._roh));
    if (k._roh.includes('|') && schrumpfe(0.8)) return;
    s.textContent = anzeige(k._roh);
    schrumpfe(0.45);
  }
  function passeAlle() { kacheln.forEach(k => { if (k.isConnected) passe(k); }); }
  let rsTimer;
  addEventListener('resize', () => { clearTimeout(rsTimer); rsTimer = setTimeout(passeAlle, 80); });

  function fehlerAnzeige() {
    const p = $('#punkte');
    if (p.children.length !== 4) p.innerHTML = '<i></i><i></i><i></i><i></i>';
    [...p.children].forEach((d, i) => d.classList.toggle('weg', i >= 4 - z.fehler));
    p.setAttribute('aria-label', `${4 - z.fehler} von 4`);
    $('#fehler-zeile').style.visibility = z.fertig ? 'hidden' : '';
  }

  function knoepfe() {
    $('#knoepfe-spiel').hidden = z.fertig;
    $('#knoepfe-ende').hidden = !z.fertig;
    $('#btn-abschicken').disabled = sperre || auswahl.size !== 4;
    $('#btn-abwaehlen').disabled = sperre || auswahl.size === 0;
    $('#btn-mischen').disabled = sperre;
  }

  function kopfzeile() {
    const ut = $('#untertitel');
    if (id === tagesId) {
      const datum = new Date().toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'long' });
      ut.textContent = `Tagesrätsel Nr. ${tagesNr} · ${datum}`;
    } else {
      ut.innerHTML = `Rätsel ${id + 1} aus dem Archiv · <a href="#" id="zum-tag">zum Tagesrätsel</a>`;
      $('#zum-tag').addEventListener('click', e => { e.preventDefault(); oeffneRaetsel(tagesId); });
    }
  }

  // ---------- Spielzüge ----------
  function waehle(w) {
    if (sperre || z.fertig) return;
    if (auswahl.has(w)) auswahl.delete(w);
    else if (auswahl.size < 4) auswahl.add(w);
    else return;
    const k = kacheln.get(w);
    k.classList.toggle('gewaehlt', auswahl.has(w));
    k.setAttribute('aria-pressed', auswahl.has(w));
    knoepfe();
  }

  function abwaehlen() {
    if (sperre || z.fertig) return;
    auswahl.clear();
    render(false);
  }

  function mischen() {
    if (sperre || z.fertig) return;
    z.reihenfolge = mische(z.reihenfolge);
    merke();
    render();
  }

  function animiere(el, klasse) {
    el.classList.remove(klasse);
    el.offsetWidth;
    el.classList.add(klasse);
    el.addEventListener('animationend', () => el.classList.remove(klasse), { once: true });
  }

  async function abschicken() {
    if (sperre || z.fertig || auswahl.size !== 4) return;
    const tipp = z.reihenfolge.filter(w => auswahl.has(w));
    const schluessel = tipp.slice().sort().join('|');
    if (z.versuche.some(v => v.slice().sort().join('|') === schluessel)) {
      toast('Schon versucht!');
      return;
    }
    sperre = true;
    knoepfe();
    z.versuche.push(tipp);
    merke();

    tipp.forEach((w, i) => setTimeout(() => animiere(kacheln.get(w), 'huepf'), BEWEGUNG ? i * 90 : 0));
    await warte(tipp.length * 90 + 300);

    const gi = gruppeVon[tipp[0]];
    if (tipp.every(w => gruppeVon[w] === gi)) {
      await loese(gi);
      if (z.geloest.length === 4) { await ende(true); return; }
    } else {
      const treffer = Math.max(...[0, 1, 2, 3].map(g => tipp.filter(w => gruppeVon[w] === g).length));
      if (treffer === 3) toast('Einer fehlt …');
      tipp.forEach(w => animiere(kacheln.get(w), 'wackel'));
      z.fehler++;
      merke();
      fehlerAnzeige();
      await warte(450);
      if (z.fehler >= 4) {
        toast('Schade – hier ist die Lösung');
        await warte(700);
        auswahl.clear();
        render(false);
        await aufdecken();
        await ende(false);
        return;
      }
    }
    sperre = false;
    knoepfe();
  }

  // Gruppe nach oben ziehen und zum farbigen Balken zusammenfassen
  async function loese(gi) {
    const ws = gruppen[gi].woerter;
    const rest = z.reihenfolge.filter(w => !ws.includes(w));
    z.reihenfolge = [...z.reihenfolge.filter(w => ws.includes(w)), ...rest];
    render();
    await warte(430);
    z.reihenfolge = rest;
    z.geloest.push(gi);
    ws.forEach(w => auswahl.delete(w));
    merke();
    render();
    await warte(380);
  }

  async function aufdecken() {
    for (let gi = 0; gi < 4; gi++) {
      if (z.geloest.includes(gi)) continue;
      auswahl = new Set(gruppen[gi].woerter);
      render(false);
      await warte(350);
      await loese(gi);
    }
  }

  async function ende(gewonnen) {
    z.fertig = true;
    z.gewonnen = gewonnen;
    verbuche(gewonnen);
    merke();
    sperre = false;
    render(false);
    await warte(gewonnen ? 600 : 900);
    zeigeErgebnis();
  }

  function verbuche(gewonnen) {
    const s = daten.statistik;
    s.gespielt++;
    if (gewonnen) {
      s.gewonnen++;
      s.verteilung[z.fehler]++;
      if (z.fehler === 0) s.perfekt++;
    } else {
      s.verteilung[4]++;
    }
    if (id === tagesId) {
      if (gewonnen) {
        s.serie = s.letzterSieg === tagesNr - 1 ? s.serie + 1 : 1;
        s.letzterSieg = tagesNr;
        s.besteSerie = Math.max(s.besteSerie, s.serie);
      } else {
        s.serie = 0;
      }
    }
    speichern();
  }

  // ---------- Ergebnis ----------
  function zeigeErgebnis() {
    const titel = z.gewonnen ? ['Perfekt!', 'Großartig!', 'Gut gemacht!', 'Puh, knapp!'][z.fehler] : 'Nächstes Mal!';
    $('#erg-titel').textContent = titel;
    $('#erg-text').textContent = z.gewonnen
      ? (z.fehler === 0 ? 'Ohne einen einzigen Fehler gelöst.' : `Gelöst mit ${z.fehler} Fehler${z.fehler === 1 ? '' : 'n'}.`)
      : `Du hast ${selbstGefunden(z.versuche, w => gruppeVon[w]).size} von 4 Gruppen gefunden.`;
    const r = $('#erg-raster');
    r.textContent = '';
    for (const v of z.versuche) {
      const zeile = document.createElement('div');
      zeile.className = 'raster-zeile';
      for (const w of v) {
        const i = document.createElement('i');
        i.className = FARBEN[gruppeVon[w]];
        zeile.append(i);
      }
      r.append(zeile);
    }
    naechstesRaetsel();
    oeffne('dlg-ergebnis');
  }

  // Gruppen, die der Spieler selbst gefunden hat (nicht beim Verlieren aufgedeckt)
  function selbstGefunden(versuche, gruppe) {
    return new Set(versuche.filter(v => v.every(w => gruppe(w) === gruppe(v[0]))).map(v => gruppe(v[0])));
  }

  let uhr;
  function naechstesRaetsel() {
    clearInterval(uhr);
    const feld = $('#erg-naechstes');
    const tick = () => {
      const jetzt = new Date();
      const morgen = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() + 1);
      const s = Math.max(0, Math.floor((morgen - jetzt) / 1000));
      const hh = String(Math.floor(s / 3600)).padStart(2, '0');
      const mm = String(Math.floor(s / 60) % 60).padStart(2, '0');
      const ss = String(s % 60).padStart(2, '0');
      feld.innerHTML = `Nächstes Tagesrätsel in <b>${hh}:${mm}:${ss}</b>`;
    };
    tick();
    uhr = setInterval(tick, 1000);
  }

  async function teilen() {
    const zeilen = z.versuche.map(v => v.map(w => EMOJI[gruppeVon[w]]).join(''));
    const kopf = id === tagesId ? `Viererbande Nr. ${tagesNr}` : `Viererbande – Rätsel ${id + 1}`;
    const text = `${kopf}\n${zeilen.join('\n')}\n${location.origin}${location.pathname}`;
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('In die Zwischenablage kopiert');
    } catch (e) {
      toast('Kopieren nicht möglich');
    }
  }

  // ---------- Statistik ----------
  function zeigeStatistik() {
    const s = daten.statistik;
    const serie = s.letzterSieg >= tagesNr - 1 ? s.serie : 0;
    const quote = s.gespielt ? Math.round(100 * s.gewonnen / s.gespielt) : 0;
    const felder = [[s.gespielt, 'Gespielt'], [quote, 'Gewonnen %'], [s.perfekt, 'Perfekt'], [serie, 'Serie'], [s.besteSerie, 'Beste Serie']];
    $('#stat-zahlen').innerHTML = felder.map(([n, t]) => `<div class="zahl"><b>${n}</b><span>${t}</span></div>`).join('');
    const max = Math.max(1, ...s.verteilung);
    const aktuell = z.fertig ? (z.gewonnen ? z.fehler : 4) : -1;
    const namen = ['0 Fehler', '1 Fehler', '2 Fehler', '3 Fehler', 'Verloren'];
    $('#stat-verteilung').innerHTML = s.verteilung.map((n, i) =>
      `<div class="vt-zeile"><span>${namen[i]}</span><div><div class="vt-balken${i === aktuell ? ' aktuell' : ''}" style="width:${Math.max(8, 100 * n / max)}%">${n}</div></div></div>`
    ).join('');
    oeffne('dlg-statistik');
  }

  function statistikZuruecksetzen() {
    if (!confirm('Statistik wirklich zurücksetzen? Gespielte Rätsel bleiben gespeichert.')) return;
    daten.statistik = leer().statistik;
    speichern();
    zeigeStatistik();
  }

  // ---------- Archiv ----------
  function zeigeArchiv() {
    const liste = $('#archiv-liste');
    liste.textContent = '';
    const geloest = RAETSEL.filter((_, i) => daten.spiele[i] && daten.spiele[i].gewonnen).length;
    $('#archiv-info').textContent = `${RAETSEL.length} Rätsel · ${geloest} gelöst. Jedes kannst du jederzeit spielen – das heutige ist markiert.`;
    RAETSEL.forEach((_, i) => {
      const sp = daten.spiele[i];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'archiv-feld' + (i === id ? ' aktiv' : '') + (sp && sp.fertig && !sp.gewonnen ? ' verloren' : '');
      let status = '';
      if (sp && sp.fertig) status = sp.gewonnen ? (sp.fehler ? `${sp.fehler} Fehler` : 'perfekt') : 'verloren';
      else if (sp) status = 'begonnen';
      if (i === tagesId) status = status ? `heute · ${status}` : 'heute';
      const mini = [0, 1, 2, 3].map(g => {
        const an = sp && sp.fertig ? true : sp && sp.geloest.includes(g);
        return `<i class="${an ? FARBEN[g] : ''}"></i>`;
      }).join('');
      b.innerHTML = `<b>Nr. ${i + 1}</b><span class="mini">${mini}</span><small>${status}</small>`;
      if (sp && sp.fertig && !sp.gewonnen) {
        // Verlorene Rätsel: nur die selbst gefundenen Gruppen farbig zeigen
        const selbst = selbstGefunden(sp.versuche, w => gruppeVonIn(i, w));
        b.querySelectorAll('.mini i').forEach((el, g) => { el.className = selbst.has(g) ? FARBEN[g] : ''; });
      }
      b.addEventListener('click', () => { schliesse(); oeffneRaetsel(i); });
      liste.append(b);
    });
    oeffne('dlg-archiv');
    const aktiv = liste.querySelector('.aktiv');
    if (aktiv) aktiv.scrollIntoView({ block: 'nearest' });
  }

  function gruppeVonIn(raetselId, wort) {
    return RAETSEL[raetselId].findIndex(g => g.slice(1).some(w => klar(w) === wort));
  }

  function oeffneRaetsel(i) {
    const ziel = i === tagesId ? '' : `#${i + 1}`;
    if (location.hash !== ziel) history.replaceState(null, '', ziel || location.pathname + location.search);
    lade(i);
    if (z.fertig) setTimeout(zeigeErgebnis, 250);
  }

  function idAusHash() {
    const n = parseInt(location.hash.slice(1), 10);
    return n >= 1 && n <= RAETSEL.length ? n - 1 : tagesId;
  }

  // ---------- Dialoge & Toasts ----------
  let zuletztFokus = null;
  function oeffne(dlgId) {
    schliesse();
    zuletztFokus = document.activeElement;
    const d = document.getElementById(dlgId);
    d.hidden = false;
    d.querySelector('[data-schliessen]').focus();
  }
  function schliesse() {
    let offen = false;
    document.querySelectorAll('.dialog').forEach(d => { if (!d.hidden) { offen = true; d.hidden = true; } });
    clearInterval(uhr);
    if (offen && zuletztFokus && zuletztFokus.focus) zuletztFokus.focus();
    return offen;
  }
  document.querySelectorAll('.dialog').forEach(d => {
    d.addEventListener('click', e => { if (e.target === d || e.target.closest('[data-schliessen]')) schliesse(); });
  });

  function toast(text, dauer = 1600) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    $('#toasts').append(t);
    setTimeout(() => { t.classList.add('weg'); setTimeout(() => t.remove(), 300); }, dauer);
  }

  // ---------- Bedienung ----------
  $('#btn-abschicken').addEventListener('click', abschicken);
  $('#btn-abwaehlen').addEventListener('click', abwaehlen);
  $('#btn-mischen').addEventListener('click', mischen);
  $('#btn-ergebnis').addEventListener('click', zeigeErgebnis);
  $('#btn-teilen').addEventListener('click', teilen);
  $('#btn-hilfe').addEventListener('click', () => oeffne('dlg-hilfe'));
  $('#btn-statistik').addEventListener('click', zeigeStatistik);
  $('#btn-reset').addEventListener('click', statistikZuruecksetzen);
  $('#btn-archiv').addEventListener('click', zeigeArchiv);
  $('#btn-archiv2').addEventListener('click', zeigeArchiv);
  $('#btn-erg-archiv').addEventListener('click', zeigeArchiv);
  $('#btn-dunkel').addEventListener('click', () => {
    const dunkel = !document.documentElement.classList.contains('dunkel');
    document.documentElement.classList.toggle('dunkel', dunkel);
    daten.dunkel = dunkel;
    speichern();
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!schliesse()) abwaehlen(); return; }
    const dialogOffen = [...document.querySelectorAll('.dialog')].some(d => !d.hidden);
    if (dialogOffen || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter' && auswahl.size === 4 && !(document.activeElement && document.activeElement.classList.contains('kachel'))) {
      e.preventDefault();
      abschicken();
    }
  });

  addEventListener('hashchange', () => { const n = idAusHash(); if (n !== id) oeffneRaetsel(n); });

  // ---------- Start ----------
  lade(idAusHash());
  if (!daten.hilfeGesehen) {
    daten.hilfeGesehen = true;
    speichern();
    oeffne('dlg-hilfe');
  } else if (z.fertig) {
    setTimeout(zeigeErgebnis, 300);
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
