/* ============================================================================
 * VoltDetective — Board (Name + Fortschritts-/Bestenliste)
 * ----------------------------------------------------------------------------
 * Speichert Name + Erfolge lokal (localStorage). Ohne Name -> "Anonym".
 * Vorbereitet für eine spätere globale Liste (Firebase): einfach Board.add()
 * zusätzlich an die Cloud schicken.
 * ==========================================================================*/
const Board = (function () {
  const NAME = 'eg_vd_name', LOG = 'eg_vd_board';

  function name() { return (localStorage.getItem(NAME) || '').trim() || 'Anonym'; }
  function setName(n) { localStorage.setItem(NAME, (n || '').trim().slice(0, 24)); }
  function all() { try { return JSON.parse(localStorage.getItem(LOG) || '[]'); } catch (e) { return []; } }

  // Ein Erfolg: mode = 'werkstatt' | 'lampen' | 'protokoll'
  function add(mode, extra) {
    try {
      const b = all();
      b.push(Object.assign({ n: name(), m: mode, t: Date.now() }, extra || {}));
      localStorage.setItem(LOG, JSON.stringify(b.slice(-500)));
    } catch (e) {}
  }

  // Aggregiert je Name
  function leaderboard() {
    const agg = {};
    all().forEach(e => {
      const k = e.n || 'Anonym';
      agg[k] = agg[k] || { name: k, werkstatt: 0, lampen: 0, protokoll: 0 };
      if (e.m === 'werkstatt') agg[k].werkstatt++;
      else if (e.m === 'lampen') agg[k].lampen++;
      else if (e.m === 'protokoll') agg[k].protokoll++;
    });
    return Object.values(agg)
      .map(r => Object.assign(r, { total: r.werkstatt + r.lampen + r.protokoll }))
      .sort((a, b) => b.total - a.total);
  }

  return { name, setName, add, all, leaderboard };
})();
