/* Puzzl · overall stats
   Adds a Stats button to the top right. Tapping it swaps the game cards for your
   stats; tapping Puzzles (or the browser back button) swaps them back.
   Add to index.html with one line, just before </body>:
     <script src="stats.js"></script>
   It uses GAMES, get, londonNow, dayNumber and RESET_HOUR from the main script. */
(() => {
  const css = `
  .stats{display:none}
  body.show-stats .stats{display:block;animation:statsIn .35s cubic-bezier(.2,.8,.2,1)}
  body.show-stats .wrap > .head, body.show-stats #grid{display:none}
  @keyframes statsIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  .top-right{display:flex;align-items:center;gap:14px}
  .stats-btn{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 14px 0 12px;border-radius:99px;cursor:pointer;
    background:var(--panel);border:1px solid var(--line2);color:var(--text);font:500 13px var(--sans);transition:background .15s,border-color .15s}
  .stats-btn:hover{background:var(--panel2);border-color:rgba(168,85,247,.6)}
  .stats-btn:focus-visible{outline:2px solid var(--purple);outline-offset:2px}
  .stats-btn svg{width:16px;height:16px;flex:none}
  body.show-stats .stats-btn{background:var(--grad);border-color:transparent;color:#fff}
  .kick-date{display:none;font:500 11px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:10px}
  .stats .head{margin-bottom:14px}
  .tiles{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
  .tile{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px 16px 14px}
  .tile b{display:block;font:400 34px/1 var(--serif);background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent;padding-bottom:4px}
  .tile span{display:block;font:500 11px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-top:6px}
  .tile small{display:block;font-size:13px;color:var(--ice);margin-top:6px;min-height:1.3em}
  .rows{margin-top:12px;background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden}
  .row{display:grid;grid-template-columns:minmax(0,1.6fr) .8fr 1.3fr .8fr .8fr;gap:10px;align-items:center;padding:12px 16px;border-top:1px solid var(--line);font:400 14px var(--mono);color:var(--ice);text-decoration:none}
  .row:first-child{border-top:0}
  a.row:hover{background:var(--panel2)}
  .row.th{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);padding-top:10px;padding-bottom:10px;background:rgba(150,165,230,.05)}
  .row .g{display:flex;align-items:center;gap:10px;font:400 18px var(--serif);color:var(--text);min-width:0}
  .row .g i{width:10px;height:10px;border-radius:50%;background:var(--c);flex:none}
  .row .g em{font-style:normal;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .row .n{text-align:right}
  .row .hot{color:var(--text)}
  .stats-empty{background:var(--panel);border:1px dashed var(--line2);border-radius:16px;padding:22px;color:var(--ice);text-align:center}
  .stats-note{margin-top:10px;font-size:12px;color:var(--muted)}
  @media (max-width:860px){.tiles{grid-template-columns:repeat(2,1fr)}}
  @media (max-width:600px){
    .top .date{display:none}
    .kick-date{display:block}
    .tile{padding:14px}
    .tile b{font-size:30px}
    .row{grid-template-columns:minmax(0,1.5fr) .7fr 1.25fr .75fr;padding:11px 12px;font-size:13px;gap:8px}
    .row .best{display:none}
    .row .g{font-size:16px;gap:8px;line-height:1.15}
    .row .g em{white-space:normal}
  }`;
  document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);

  const sec = document.createElement('section');
  sec.className = 'stats'; sec.id = 'stats';
  document.querySelector('.foot-site').before(sec);

  /* ---- the Stats button, top right ---- */
  const ICON_STATS = '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="1.5" y="8" width="3" height="6.5" rx="1"/><rect x="6.5" y="4.5" width="3" height="10" rx="1"/><rect x="11.5" y="1.5" width="3" height="13" rx="1"/></svg>';
  const ICON_GAMES = '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1.5"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1.5"/><rect x="9" y="9" width="5.5" height="5.5" rx="1.5"/></svg>';
  const date = document.getElementById('date');
  const right = document.createElement('div'); right.className = 'top-right';
  date.before(right); right.append(date);
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'stats-btn';
  right.append(btn);
  /* on phones the date moves down above the greeting, to make room for the button */
  const kick = document.createElement('div'); kick.className = 'kick-date';
  document.querySelector('.hero').prepend(kick);

  /* #stats in the address means the stats view is open, so the back button closes it */
  const isOpen = () => location.hash === '#stats';
  function showView() {
    const open = isOpen();
    document.body.classList.toggle('show-stats', open);
    btn.innerHTML = open ? `${ICON_GAMES}<span>Puzzles</span>` : `${ICON_STATS}<span>Stats</span>`;
    btn.setAttribute('aria-label', open ? 'Back to today\'s puzzles' : 'Show your stats');
    if (open) renderStats();
  }
  btn.addEventListener('click', () => {
    if (isOpen()) { history.length > 1 && history.state === 'puzzl-stats' ? history.back() : (history.replaceState(null, '', location.pathname + location.search), showView()); }
    else { history.pushState('puzzl-stats', '', '#stats'); showView(); window.scrollTo({top: 0}); }
  });
  window.addEventListener('popstate', showView);
  window.addEventListener('hashchange', showView);

  const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

  /* One line per game: played, current streak, best streak, and a headline record */
  function line(g, d) {
    switch (g.id) {
      case 'dub': {
        const s = get('dtl-stats-v2') || {}, p = s.played || 0;
        return {played: p, streak: s.lastDay >= d - 1 ? s.streak || 0 : 0, best: s.best || 0,
                record: p ? `avg ${Math.round((s.total || 0) / p)}/30` : '–'};
      }
      case 'geo': {
        const s = get('geoclue-stats') || {}, p = s.played || 0;
        return {played: p, streak: s.lastWon >= d - 1 ? s.streak || 0 : 0, best: s.max || 0,
                record: p ? `${pct(s.won || 0, p)}% found` : '–'};
      }
      case 'quid': {
        const s = get('quidsin-stats') || {}, p = s.played || 0;
        return {played: p, streak: s.lastDay >= d - 1 ? s.streak || 0 : 0, best: s.best || 0,
                record: p ? `top £${s.top || 0}` : '–'};
      }
      default: {
        const key = {peck: 'pecking-stats', teth: 'tethered-stats', code: 'codebreaker-stats'}[g.id];
        const word = {peck: 'sorted', teth: 'tied', code: 'cracked'}[g.id];
        const s = get(key) || {}, p = s.played || 0;
        return {played: p, streak: s.lastDay >= d - 1 ? s.streak || 0 : 0, best: s.best || 0,
                record: p ? `${pct(s.wins || 0, p)}% ${word}` : '–'};
      }
    }
  }

  /* Full houses: days you finished all six. The games don't record this,
     so Puzzl counts it itself whenever you open the homepage on that day. */
  function dateKey(offsetDays) {
    const o = londonNow(RESET_HOUR);
    return new Date(Date.UTC(+o.year, +o.month - 1, +o.day + offsetDays)).toISOString().slice(0, 10);
  }
  function fullHouses(allDone) {
    let h = get('puzzl-hub') || {};
    h = {full: h.full || 0, streak: h.streak || 0, best: h.best || 0, last: h.last || ''};
    const today = dateKey(0), yday = dateKey(-1);
    if (allDone && h.last !== today) {
      h.full++; h.streak = h.last === yday ? h.streak + 1 : 1; h.best = Math.max(h.best, h.streak); h.last = today;
      try { localStorage.setItem('puzzl-hub', JSON.stringify(h)); } catch (e) {}
    }
    h.current = h.last === today || h.last === yday ? h.streak : 0;
    return h;
  }

  function renderStats() {
    kick.textContent = date.textContent;
    const rows = GAMES.map(g => {
      const d = dayNumber(g.launch);
      let r = {played: 0, streak: 0, best: 0, record: '–'}, done = false;
      try { r = line(g, d); } catch (e) {}
      try { done = !!g.read(d).done; } catch (e) {}
      return Object.assign({g, done}, r);
    });
    const h = fullHouses(rows.every(r => r.done));
    const total = rows.reduce((a, r) => a + r.played, 0);

    if (!total) {
      sec.innerHTML = `<div class="head"><h2>Your stats</h2></div>
        <div class="stats-empty">Play any puzzle and your stats will start building here.</div>`;
      return;
    }
    const alive = rows.filter(r => r.streak > 0).length;
    const top = rows.reduce((a, r) => r.best > a.best ? r : a, rows[0]);
    sec.innerHTML = `
      <div class="head"><h2>Your stats</h2></div>
      <div class="tiles">
        <div class="tile"><b>${total}</b><span>Puzzles played</span><small>across all six games</small></div>
        <div class="tile"><b>${alive}/6</b><span>Streaks alive</span><small>${alive === 6 ? 'Every one. Lovely.' : alive ? 'Keep them going' : 'Start one today'}</small></div>
        <div class="tile"><b>${top.best}</b><span>Best streak</span><small>${top.best ? top.g.name : '&nbsp;'}</small></div>
        <div class="tile"><b>${h.full}</b><span>Full houses</span><small>${h.current > 1 ? `${h.current} days running` : 'All six in a day'}</small></div>
      </div>
      <div class="rows">
        <div class="row th"><span>Game</span><span class="n">Played</span><span class="n">Record</span><span class="n">Streak</span><span class="n best">Best</span></div>
        ${rows.map(r => `
        <a class="row" href="${r.g.url}">
          <span class="g"><i style="--c:${COLOURS[r.g.id]}"></i><em>${r.g.name}</em></span>
          <span class="n">${r.played}</span>
          <span class="n">${r.record}</span>
          <span class="n${r.streak ? ' hot' : ''}">${r.streak ? '🔥 ' + r.streak : '0'}</span>
          <span class="n best">${r.best}</span>
        </a>`).join('')}
      </div>
      <p class="stats-note">Stats are saved on this device and browser.</p>`;
  }

  renderStats();
  showView();
  window.addEventListener('pageshow', renderStats);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderStats(); });
  window.addEventListener('storage', renderStats);
})();
