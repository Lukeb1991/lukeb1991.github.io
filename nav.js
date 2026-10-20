/* Puzzl · joined-up games
   One shared file, loaded by every game AND the homepage:
     <script src="https://playpuzzl.com/nav.js"></script>
   In a game it adds:
     • a "← Puzzl" button (top-left corner on desktop, a slim strip above the header on phones)
     • a "Next up" card under the results once today's game is finished, pointing at the next one you haven't played
   On the homepage it quietly handles the hop between games, so leaderboard scores are sent on the way. */
(() => {
  /* ================= Settings ================= */
  const RESET_HOUR = 7;          // new puzzles at 7am UK time, same as the games
  const HOME = '/';
  /* The daily six in playing order, then the bonus game.
     done: reads the stats each game saves, so it knows if today's puzzle has been finished.
     If a game ever changes where it saves (e.g. a -v2 becomes -v3), change it here too. */
  const GAMES = [
    {id: 'dub',  name: 'Dub Titles',    path: '/Dub-Titles-2/',  launch: '2026-10-07', colour: '#ffd98a', stats: 'dtl-stats-v2',      field: 'lastDay'},
    {id: 'geo',  name: 'Geo Clue',      path: '/GeoClue/',       launch: '2026-10-07', colour: '#2dd4bf', stats: 'geoclue-stats',     field: 'lastPlayed'},
    {id: 'peck', name: 'Pecking Order', path: '/Pecking-Order/', launch: '2026-10-07', colour: '#ff5fa2', stats: 'pecking-stats',     field: 'lastDay'},
    {id: 'teth', name: 'Tethered',      path: '/Tethered/',      launch: '2026-10-07', colour: '#b591ff', stats: 'tethered-stats',    field: 'lastDay'},
    {id: 'code', name: 'Codebreaker',   path: '/Codebreaker/',   launch: '2026-10-07', colour: '#3fcf8e', stats: 'codebreaker-stats', field: 'lastDay'},
    {id: 'quid', name: 'Quids In',      path: '/QuidsIn/',       launch: '2026-10-07', colour: '#f7c948', stats: 'quidsin-stats',     field: 'lastDay'},
  ];
  const BONUS = {id: 'pork', name: 'Porkies', path: '/Porkies/', launch: '2026-10-07', colour: '#ff4d6d', stats: 'porkies-stats', field: 'lastDay', bonus: true};
  const ALL = [...GAMES, BONUS];
  const RESULTS = '#result, #end';   // each game's results section; the card goes straight underneath it

  /* ================= Helpers ================= */
  const get = k => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } };
  function dayNumber(launch) {
    const o = {};
    new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'})
      .formatToParts(new Date(Date.now() - RESET_HOUR * 3600e3)).forEach(p => o[p.type] = p.value);
    const [y, m, d] = launch.split('-').map(Number);
    return Math.max(1, Math.round((Date.UTC(+o.year, +o.month - 1, +o.day) - Date.UTC(y, m - 1, d)) / 864e5) + 1);
  }
  const isDone = g => { const s = get(g.stats); return !!s && s[g.field] === dayNumber(g.launch); };
  /* On a leaderboard? (signed in with a name, or the old crew login) Then hops go via the homepage so scores are sent */
  const inLeague = () => { const a = get('puzzl-account'), t = get('puzzl-auth'), m = get('puzzl-league');
    return !!((a && a.id && t && t.refresh_token) || (m && m.id)); };
  const path = location.pathname.replace(/index\.html$/, '');
  const here = ALL.find(g => path.toLowerCase().endsWith(g.path.toLowerCase()));
  const onHome = path === '/' || path === '';   // the homepage now sits at the root of playpuzzl.com
  const esc = s => String(s).replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));

  /* Where a "next" link should go. League players hop via the homepage so their score is sent first. */
  const linkTo = g => inLeague() ? `${HOME}?go=${g.id}` : g.path;

  /* ================= Homepage: pass straight through to the next game ================= */
  if (onHome) {
    const go = new URLSearchParams(location.search).get('go');
    const target = ALL.find(g => g.id === go);
    if (!target) return;
    document.documentElement.insertAdjacentHTML('beforeend', `<div id="pzHop" style="position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:#0b0f22;color:#c7d2ff;font:500 15px 'DM Sans',system-ui,sans-serif">
      <div style="text-align:center"><div style="font:400 30px 'DM Serif Display',Georgia,serif;color:#fff">Next up: ${esc(target.name)}</div>
      <div style="margin-top:10px;opacity:.8">Saving your score…</div></div></div>`);
    const leave = () => location.replace(target.path);
    const send = window.puzzlLeague && window.puzzlLeague.send ? window.puzzlLeague.send() : null;
    Promise.race([Promise.resolve(send), new Promise(r => setTimeout(r, 3000))]).then(leave, leave);
    return;
  }
  if (!here) return;   // not a Puzzl game page

  /* ================= Styles ================= */
  document.head.insertAdjacentHTML('beforeend', `<style>
  .pz-back,.pz-back *,.pz-next,.pz-next *{box-sizing:border-box;text-align:left;letter-spacing:normal;text-transform:none;text-shadow:none;margin:0}
  .pz-back{position:fixed;top:calc(16px + env(safe-area-inset-top,0px));left:16px;z-index:15;display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px 0 10px;
    border-radius:99px;background:rgba(11,15,34,.62);border:1px solid rgba(255,255,255,.2);color:#fff;text-decoration:none;
    font:600 14px 'DM Sans',system-ui,sans-serif;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);box-shadow:0 4px 14px -6px rgba(0,0,0,.5);transition:background .15s,transform .15s}
  .pz-back:hover{background:rgba(11,15,34,.82);transform:translateX(-2px)}
  .pz-back:focus-visible{outline:2px solid #a855f7;outline-offset:2px}
  .pz-back svg{width:15px;height:15px;flex:none}
  .pz-back .pz-mark{display:grid;grid-template-columns:repeat(3,5px);gap:2px}
  .pz-back .pz-mark i{width:5px;height:5px;border-radius:50%}
  .pz-strip{display:none}
  @media (max-width:640px){
    .pz-strip{display:flex;align-items:center;height:44px;padding:8px 16px 0}
    .pz-back{position:static;height:32px;font-size:13px;padding:0 12px 0 8px;box-shadow:none}
  }
  .pz-next{display:flex;align-items:center;gap:12px;width:100%;max-width:480px;margin:18px auto 4px;padding:12px 12px 12px 16px;border-radius:18px;
    background:rgba(11,15,34,.88);border:1px solid rgba(255,255,255,.16);color:#eef1ff;text-decoration:none;font-family:'DM Sans',system-ui,sans-serif;
    box-shadow:0 14px 34px -14px rgba(0,0,0,.55);animation:pzIn .45s cubic-bezier(.2,.8,.2,1);transition:transform .15s,border-color .15s}
  .pz-next:hover{transform:translateY(-2px);border-color:rgba(255,255,255,.3)}
  .pz-next:focus-visible{outline:2px solid #a855f7;outline-offset:3px}
  @keyframes pzIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  .pz-next .pz-dot{width:12px;height:12px;border-radius:50%;flex:none;background:var(--c);box-shadow:0 0 12px var(--c)}
  .pz-next .pz-txt{flex:1;min-width:0;line-height:1.2}
  .pz-next .pz-txt small{display:block;font:500 10px 'DM Mono',ui-monospace,monospace;letter-spacing:.14em;text-transform:uppercase;color:#939fca;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .pz-next .pz-txt b{display:block;font:400 20px 'DM Serif Display',Georgia,serif;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}
  .pz-next .pz-go{display:inline-flex;align-items:center;gap:6px;height:42px;padding:0 18px;border-radius:99px;background:linear-gradient(90deg,#a855f7,#ec4899);
    color:#fff;font:700 15px 'DM Sans',system-ui,sans-serif;white-space:nowrap;flex:none}
  @media (prefers-reduced-motion:reduce){.pz-next{animation:none;transition:none}}
  </style>`);

  /* ================= "← Puzzl" ================= */
  const MARK = ['#ffd98a', '#2dd4bf', '#ff5fa2', '#b591ff', '#3fcf8e', '#f7c948'].map(c => `<i style="background:${c}"></i>`).join('');
  const back = document.createElement('a');
  back.className = 'pz-back'; back.href = HOME; back.setAttribute('aria-label', 'Back to all Puzzl games');
  back.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3L5 8l5 5"/></svg><span class="pz-mark" aria-hidden="true">${MARK}</span>Puzzl`;
  const strip = document.createElement('div'); strip.className = 'pz-strip';
  document.body.prepend(strip);
  const placeBack = () => (matchMedia('(max-width:640px)').matches ? strip : document.body).append(back);
  placeBack(); matchMedia('(max-width:640px)').addEventListener('change', placeBack);

  /* ================= "Next puzzle →" ================= */
  function nextUp() {
    const i = GAMES.findIndex(g => g.id === here.id);
    const order = i < 0 ? GAMES : [...GAMES.slice(i + 1), ...GAMES.slice(0, i)];
    const g = order.find(x => !isDone(x));
    if (g) {
      const left = GAMES.filter(x => !isDone(x)).length;
      return {label: `Next up · ${left} left`, name: g.name, colour: g.colour, href: linkTo(g), btn: 'Play →'};
    }
    if (!here.bonus && !isDone(BONUS)) return {label: 'All six done · bonus game', name: BONUS.name, colour: BONUS.colour, href: linkTo(BONUS), btn: 'Play →'};
    return inLeague()
      ? {label: 'All done for today', name: 'See the leaderboard', colour: '#a855f7', href: `${HOME}#board`, btn: 'Go →'}
      : {label: 'All done for today', name: 'Back to Puzzl', colour: '#a855f7', href: HOME, btn: 'Go →'};
  }

  /* The card sits straight under the game's results, and only while they're on screen */
  const visible = el => !!el && !el.hidden && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none' && el.getClientRects().length > 0;
  let card = null;
  function paint() {
    const n = nextUp();
    card.href = n.href;
    card.innerHTML = `<span class="pz-dot" style="--c:${n.colour}"></span>
      <span class="pz-txt"><small>${esc(n.label)}</small><b>${esc(n.name)}</b></span>
      <span class="pz-go">${esc(n.btn)}</span>`;
    card.setAttribute('aria-label', `${n.label}: ${n.name}`);
  }
  function check() {
    const res = document.querySelector(RESULTS);
    const want = isDone(here) && visible(res);
    if (want && !card) {
      card = document.createElement('a'); card.className = 'pz-next';
      paint(); res.after(card);
    } else if (want && card && card.previousElementSibling !== res) {
      res.after(card);                                  // the game rebuilt its page: put the card back
    } else if (!want && card) { card.remove(); card = null; }
  }
  check();
  setInterval(check, 700);
  window.addEventListener('storage', () => { if (card) paint(); });   // finished another game in another tab
})();
