/* Puzzl · bonus game
   Adds a "Bonus game" card under the six daily puzzles. It stays out of the
   "x of 6 played" bar, the Full house count and the stats, so the daily six are unchanged.
   Add to index.html with one line, just before the stats.js line:
     <script src="bonus.js"></script>
   It uses get, dayNumber and TICK from the main script. */
(() => {
  const BONUS = {
    name: 'Porkies', kind: 'Deduction', tag: "Someone's telling porkies",
    meta: '4 suspects · 1 fibber', label: 'Work in progress',
    url: '/Porkies/', launch: '2026-10-07',
  };

  /* Reads what Porkies saves in the browser */
  function read(d) {
    const st = get('porkies-stats') || {}, s = get('porkies-state');
    const today = s && s.day === d ? s : null;
    const done = st.lastDay === d, won = !!today && today.status === 'won', h = today ? today.hints || 0 : 0;
    return {
      done, lost: done && !!today && today.status === 'lost',
      started: !!today && (today.pick >= 0 || h > 0 || today.secs > 0),
      streak: st.lastWin >= d - 1 ? st.streak || 0 : 0,
      result: won ? (h ? `Caught with ${h} hint${h > 1 ? 's' : ''}` : 'Caught them clean') : done ? 'Fooled!' : '',
    };
  }

  const css = `
  .bonus{margin-top:30px}
  body.show-stats .bonus{display:none}
  .bonus .head{display:flex;align-items:center;justify-content:flex-start;gap:10px;margin-bottom:14px}
  .wip{font:500 10px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:#ff4f8b;border:1px solid rgba(255,79,139,.45);background:rgba(255,79,139,.1);padding:4px 9px;border-radius:99px}
  .card.wide{flex-direction:row;height:auto}
  .card.wide .art{height:auto;min-height:170px;width:300px;flex:none;border-bottom:0;border-right:1px solid var(--line)}
  .card.wide .art > svg{width:100px;height:100px}
  .card.wide .body{padding:18px 20px}
  .g-pork{--ac:#ff4d6d;--onac:#22050c;--artfg:#f5c26b;--art:radial-gradient(120% 110% at 50% 0%,#4a1520,#200c11 55%,#120709)}
  .g-pork .art::before{background:linear-gradient(45deg,rgba(255,77,109,.09) 25%,transparent 25%,transparent 75%,rgba(255,77,109,.09) 75%) 0 0/22px 22px,linear-gradient(45deg,rgba(255,77,109,.09) 25%,transparent 25%,transparent 75%,rgba(255,77,109,.09) 75%) 11px 11px/22px 22px}
  @media (max-width:600px){
    .bonus{margin-top:24px}
    .card.wide .art{width:108px;min-height:0}
    .card.wide .art > svg{width:62px;height:62px}
    .card.wide .body{padding:12px 14px 13px}
  }`;
  document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);

  const ART = `<svg viewBox="0 0 64 64" fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 34h34l-3 16a3 3 0 0 1-3 2.5H15a3 3 0 0 1-3-2.5z" fill="#c9852f" stroke="#f5c26b" stroke-width="2.4"/>
    <path d="M8 34c0-9 8-15 18-15s18 6 18 15z" fill="#e3a547" stroke="#f5c26b" stroke-width="2.4"/>
    <path d="M14 34c1-5 5-9 12-9" stroke="#fff4d6" stroke-opacity=".55" stroke-width="2"/>
    <path d="M15 42h22M14.5 47h23" stroke="#8a5420" stroke-width="1.6" stroke-opacity=".7"/>
    <circle cx="44" cy="25" r="11" fill="rgba(255,77,109,.18)" stroke="#ff4d6d" stroke-width="3.2"/>
    <path d="M52 33l7 7" stroke="#ff4d6d" stroke-width="5"/>
    <path d="M39 21a6 6 0 0 1 6-3" stroke="#fff" stroke-opacity=".6" stroke-width="2"/></svg>`;
  const CROSS_ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg>';

  const sec = document.createElement('section');
  sec.className = 'bonus';
  sec.innerHTML = `
    <div class="head"><h2>Bonus game</h2><span class="wip">${BONUS.label}</span></div>
    <a class="card wide g-pork" id="card-pork" href="${BONUS.url}" data-state="new">
      <div class="art">${ART}<span class="tick" aria-hidden="true"></span><span class="no"></span></div>
      <div class="body">
        <span class="kind">${BONUS.kind}</span>
        <h3 class="name">${BONUS.name}</h3>
        <p class="tag">${BONUS.tag}</p>
        <p class="meta">${BONUS.meta}</p>
        <div class="foot"><span class="btn">Play</span><span class="streak"></span></div>
      </div>
    </a>`;
  document.querySelector('.foot-site').before(sec);

  function renderBonus() {
    const d = dayNumber(BONUS.launch), card = document.getElementById('card-pork');
    let r = {done: false, lost: false, started: false, streak: 0, result: ''};
    try { r = read(d); } catch (e) {}
    const state = r.done ? 'done' : r.started ? 'started' : 'new';
    card.dataset.state = state;
    card.classList.toggle('lost', r.lost);
    card.querySelector('.tick').innerHTML = r.lost ? CROSS_ICON : TICK;
    card.querySelector('.no').textContent = 'Case ' + d;
    card.querySelector('.btn').textContent = state === 'done' ? r.result : state === 'started' ? 'Continue' : 'Play';
    card.querySelector('.streak').innerHTML = r.streak > 0 ? `🔥 <b>${r.streak}</b> day${r.streak > 1 ? 's' : ''}` : '';
    card.setAttribute('aria-label', `Bonus game: ${BONUS.name}, case ${d}. ${state === 'done' ? 'Played today: ' + r.result : state === 'started' ? 'In progress' : 'Not played yet'}.`);
  }

  renderBonus();
  window.addEventListener('pageshow', renderBonus);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderBonus(); });
  window.addEventListener('storage', renderBonus);
})();
