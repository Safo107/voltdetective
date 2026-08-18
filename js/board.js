/* ============================================================================
 * VoltDetective — Board (Name + globale Bestenliste via Firebase Firestore)
 * ----------------------------------------------------------------------------
 * Schreibt Erfolge in Firestore (global, jeder sieht alle) UND lokal
 * (localStorage) als Fallback. Ohne Name -> "Anonym".
 * Hinweis: Der Firebase-apiKey ist ein öffentlicher Identifier (kein Secret) —
 * die Sicherheit läuft über die Firestore-Regeln.
 * ==========================================================================*/
var FIREBASE_CONFIG = {
  apiKey: "AIzaSyBo_ctLJBiWeoy7cJVvrX30Lr6N-f7yF4g",
  authDomain: "voltoffice-698df.firebaseapp.com",
  projectId: "voltoffice-698df",
  storageBucket: "voltoffice-698df.firebasestorage.app",
  messagingSenderId: "224234300463",
  appId: "1:224234300463:web:e81dbb5ffcb973735712da"
};

var Board = (function () {
  var NAME = 'eg_vd_name', LOG = 'eg_vd_board', SC = 'eg_vd_scores', COL = 'voltdetective_board';
  var db = null;
  try {
    if (typeof firebase !== 'undefined' && firebase.initializeApp) {
      if (!firebase.apps || !firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
      db = firebase.firestore();
    }
  } catch (e) { db = null; }

  function name() { return (localStorage.getItem(NAME) || '').trim() || 'Anonym'; }
  function setName(n) { localStorage.setItem(NAME, (n || '').trim().slice(0, 24)); }
  function localAll() { try { return JSON.parse(localStorage.getItem(LOG) || '[]'); } catch (e) { return []; } }

  // Ein Erfolg: mode = 'werkstatt' | 'lampen' | 'protokoll'
  function add(mode, extra) {
    var rec = Object.assign({ n: name(), m: mode, t: Date.now() }, extra || {});
    try { var b = localAll(); b.push(rec); localStorage.setItem(LOG, JSON.stringify(b.slice(-500))); } catch (e) {}
    if (db) { try { db.collection(COL).add({ name: rec.n, mode: mode, ts: rec.t }).catch(function () {}); } catch (e) {} }
  }

  // Challenge-Highscore (Installations-Punkte). Cloud-Doc: {name, mode:'inst_score', ts, score}
  function localScores() { try { return JSON.parse(localStorage.getItem(SC) || '[]'); } catch (e) { return []; } }
  function addScore(score) {
    score = Math.round(score) || 0;
    var rec = { n: name(), score: score, t: Date.now() };
    try { var b = localScores(); b.push(rec); localStorage.setItem(SC, JSON.stringify(b.slice(-300))); } catch (e) {}
    if (db) { try { db.collection(COL).add({ name: rec.n, mode: 'inst_score', ts: rec.t, score: score }).catch(function () {}); } catch (e) {} }
  }
  function bestPerName(list) {
    var m = {};
    list.forEach(function (e) { var nm = e.name || e.n || 'Anonym', s = +(e.score || 0); if (!(nm in m) || s > m[nm]) m[nm] = s; });
    return Object.keys(m).map(function (k) { return { name: k, score: m[k] }; }).sort(function (a, b) { return b.score - a.score; });
  }
  // async: cb(rows, source) — rows = [{name, score}] absteigend
  function topScores(cb) {
    if (!db) { cb(bestPerName(localScores()), 'lokal'); return; }
    var done = false, to = setTimeout(function () { if (!done) { done = true; cb(bestPerName(localScores()), 'lokal'); } }, 3500);
    db.collection(COL).get().then(function (snap) {
      if (done) return; done = true; clearTimeout(to);
      var rows = []; snap.forEach(function (d) { var x = d.data(); if (x.mode === 'inst_score' && typeof x.score === 'number') rows.push(x); });
      if (!rows.length) rows = localScores();
      cb(bestPerName(rows), 'global');
    }).catch(function () { if (done) return; done = true; clearTimeout(to); cb(bestPerName(localScores()), 'lokal'); });
  }

  function aggregate(list) {
    var agg = {};
    list.forEach(function (e) {
      var nm = (e.name || e.n || 'Anonym'), md = (e.mode || e.m);
      agg[nm] = agg[nm] || { name: nm, werkstatt: 0, lampen: 0, protokoll: 0, installation: 0 };
      if (md === 'werkstatt') agg[nm].werkstatt++;
      else if (md === 'lampen') agg[nm].lampen++;
      else if (md === 'protokoll') agg[nm].protokoll++;
      else if (md === 'installation') agg[nm].installation++;
    });
    return Object.keys(agg).map(function (k) { var r = agg[k]; r.total = r.werkstatt + r.lampen + r.protokoll + r.installation; return r; })
      .sort(function (a, b) { return b.total - a.total; });
  }

  function leaderboard() { return aggregate(localAll()); } // lokal, synchron

  // async: cb(rows, source)  source = 'global' | 'lokal'
  function load(cb) {
    if (!db) { cb(aggregate(localAll()), 'lokal'); return; }
    var done = false;
    var to = setTimeout(function () { if (!done) { done = true; cb(aggregate(localAll()), 'lokal'); } }, 3500);
    db.collection(COL).get().then(function (snap) {
      if (done) return; done = true; clearTimeout(to);
      var rows = []; snap.forEach(function (d) { rows.push(d.data()); });
      cb(aggregate(rows), 'global');
    }).catch(function () { if (done) return; done = true; clearTimeout(to); cb(aggregate(localAll()), 'lokal'); });
  }

  return { name: name, setName: setName, add: add, addScore: addScore, topScores: topScores, leaderboard: leaderboard, load: load, hasCloud: function () { return !!db; } };
})();
