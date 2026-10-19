/* Puzzl · shared leaderboard
   Adds a Leaderboard button (top right, next to Stats) for players who've joined
   your group through the invite link. Today's results are sent automatically when
   a player comes back to the homepage, and everyone sees the same board.
   Add to index.html with one line, AFTER the stats.js line:
     <script src="leaderboard.js"></script>
   It uses GAMES, COLOURS, get, londonNow, dayNumber and RESET_HOUR from the main script. */
(() => {
  /* ================= Settings ================= */
  const SUPABASE_URL = 'https://eaojznfqcptctqgtvfbj.supabase.co';        // ← e.g. https://abcdefgh.supabase.co
  const SUPABASE_KEY = 'sb_publishable_DsNChX74tHAfCAH-oL5a8w_7uigHhz-';         // ← the anon public / publishable key (never the service_role key)

  const ME_KEY = 'puzzl-league', SENT_KEY = 'puzzl-league-sent';
  const configured = /^https?:\/\/.+/.test(SUPABASE_URL) && !SUPABASE_KEY.startsWith('PASTE');

  /* ---------- Points: every game scores 0 to 100, so a day is out of 600 ---------- */
  const POINTS = {
    dub:  d => { const s = get('dtl-state-v4'); return s && s.day === d ? Math.round((s.score || 0) / 30 * 100) : 0; },
    geo:  d => { const s = get('geoclue-v2-' + d); return s && s.status === 'won' ? [100, 80, 60, 40, 20][s.guesses.length - 1] || 0 : 0; },
    peck: d => { const s = get('pecking-state'); return s && s.day === d && s.status === 'won' ? [100, 67, 33][s.tries.length - 1] || 0 : 0; },
    teth: d => { const s = get('tethered-state'); return s && s.day === d && s.status === 'won' ? Math.max(0, 100 - (s.guesses.length - 4) * 25) : 0; },
    code: d => { const s = get('codebreaker-state'); return s && s.day === d && s.status === 'won' ? Math.round((7 - s.guesses.length) / 6 * 100) : 0; },
    quid: d => { const s = get('quidsin-state'); if (!s || s.day !== d) return 0;
                 const b = (s.results || []).reduce((t, r) => t + (r && (r.k === 'clean' || r.k === 'helped') ? r.t || 0 : 0), 0);
                 return Math.min(100, Math.round(b / 180 * 100)); },
  };
  window.puzzlPoints = POINTS;   // share.js uses the same points rules
  /* Porkies, the bonus game: shown on the board but not in the daily total */
  const PORK = {name: 'Porkies', colour: '#ff4d6d', launch: '2026-10-08'};
  function porkResult(d) {
    const st = get('porkies-stats') || {}, s = get('porkies-state');
    if (st.lastDay !== d || !s || s.day !== d) return null;
    const h = s.hints || 0, won = s.status === 'won';
    return {pts: won ? Math.max(25, 100 - h * 25) : 0, txt: won ? (h ? `Caught with ${h} hint${h > 1 ? 's' : ''}` : 'Caught them clean') : 'Fooled!'};
  }

  /* ---------- Helpers ---------- */
  const esc = s => String(s).replace(/[&<>"']/g, m => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[m]));
  const load = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  function dayKey(offset = 0) {
    const o = londonNow(RESET_HOUR);
    return new Date(Date.UTC(+o.year, +o.month - 1, +o.day + offset)).toISOString().slice(0, 10);
  }
  async function rpc(fn, body) {
    const h = {'Content-Type': 'application/json', apikey: SUPABASE_KEY};
    if (SUPABASE_KEY.startsWith('eyJ')) h.Authorization = 'Bearer ' + SUPABASE_KEY;   // older-style anon keys
    const r = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {method: 'POST', headers: h, body: JSON.stringify(body)});
    const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
    if (!r.ok) throw new Error((j && j.message) || 'Something went wrong. Try again in a moment.');
    return j;
  }
  let me = load(ME_KEY, null);
  /* Called when this phone's player has been removed from the group */
  function leaveGroup() {
    try { localStorage.removeItem(ME_KEY); localStorage.removeItem(SENT_KEY); } catch (e) {}
    me = null; data = null;
    document.body.classList.remove('show-board');
    if (typeof btn !== 'undefined') btn.hidden = true;
    if (location.hash === '#board') history.replaceState(null, '', location.pathname + location.search);
  }

  /* ================= Styles ================= */
  document.head.insertAdjacentHTML('beforeend', `<style>
  .board{display:none}
  body.show-board .board{display:block;animation:statsIn .35s cubic-bezier(.2,.8,.2,1)}
  body.show-board .wrap > .head, body.show-board #grid, body.show-board .bonus, body.show-board .stats{display:none!important}
  .board-btn{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 14px 0 12px;border-radius:99px;cursor:pointer;
    background:var(--panel);border:1px solid var(--line2);color:var(--text);font:500 13px var(--sans);transition:background .15s,border-color .15s}
  .board-btn:hover{background:var(--panel2);border-color:rgba(168,85,247,.6)}
  .board-btn:focus-visible{outline:2px solid var(--purple);outline-offset:2px}
  .board-btn svg{width:16px;height:16px;flex:none}
  .board-btn[hidden]{display:none}
  body.show-board .board-btn{background:var(--grad);border-color:transparent;color:#fff}
  .board .head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:14px}
  .board .grp{font:400 22px var(--serif);text-transform:none;letter-spacing:0;color:var(--text)}
  .board .sub2{font:500 11px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
  .lb-panel{background:var(--panel);border:1px solid var(--line);border-radius:16px;overflow:hidden;margin-bottom:12px}
  .lb-title{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 16px;font:500 11px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--muted);background:rgba(150,165,230,.05);border-bottom:1px solid var(--line)}
  .lb-title b{color:var(--text);font-weight:500}
  .lb-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:11px 16px;border-top:1px solid var(--line)}
  .lb-row:first-of-type{border-top:0}
  .lb-row .rk{font:500 13px var(--mono);color:var(--muted);text-align:center}
  .lb-row .nm{font:400 18px var(--serif);color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .lb-row .nm small{font:500 10px var(--mono);letter-spacing:.12em;color:var(--purple);margin-left:6px;vertical-align:middle}
  .lb-row .dots{display:flex;gap:4px}
  .lb-row .dots i{width:9px;height:9px;border-radius:50%;background:rgba(150,165,230,.16)}
  .lb-row .dots i.on{background:var(--c)}
  .lb-row .pt{font:500 15px var(--mono);color:var(--text);text-align:right;min-width:56px}
  .lb-row .pt span{color:var(--muted);font-size:11px}
  .lb-row.me{background:rgba(168,85,247,.09)}
  .lb-row.wait .nm,.lb-row.wait .pt{color:var(--muted)}
  .lb-games{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px}
  .lb-games .lb-panel{margin:0}
  .lb-games .lb-title{color:var(--c)}
  .lb-games .lb-row{grid-template-columns:22px minmax(0,1fr) auto;padding:9px 14px;gap:8px}
  .lb-games .lb-row .nm{font-size:16px}
  .lb-games .lb-row .tx{font:400 12px var(--mono);color:var(--ice);text-align:right;white-space:nowrap}
  .lb-games .lb-row.zero .tx{color:#ff5d73}
  .lb-empty{padding:14px 16px;color:var(--muted);font-size:14px}
  .lb-foot{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-top:14px;font-size:13px;color:var(--muted)}
  .lb-foot b{color:var(--text);font-weight:500}
  .lb-link{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:99px;border:1px solid var(--line2);background:transparent;color:var(--text);font:500 13px var(--sans);cursor:pointer}
  .lb-link:hover{background:var(--panel2)}
  .lb-how{margin-top:12px;font-size:13px;color:var(--muted)}
  .lb-how summary{cursor:pointer;color:var(--ice)}
  .lb-how p{margin-top:8px;line-height:1.55}
  .lb-msg{background:var(--panel);border:1px dashed var(--line2);border-radius:16px;padding:22px;color:var(--ice);text-align:center}
  .lb-msg button{margin-top:12px}
  dialog.lb-join{margin:auto;max-width:400px;width:calc(100% - 32px);border:1px solid var(--line2);border-radius:20px;background:var(--panel);color:var(--text);padding:24px}
  dialog.lb-join::backdrop{background:rgba(5,7,18,.72)}
  .lb-join h3{font:400 28px/1.1 var(--serif)}
  .lb-join p{color:var(--ice);margin-top:8px;font-size:15px;line-height:1.5}
  .lb-join input{width:100%;margin-top:16px;height:46px;border-radius:12px;border:1px solid var(--line2);background:var(--ink);color:var(--text);font:500 17px var(--sans);padding:0 14px}
  .lb-join input:focus{outline:2px solid var(--purple);outline-offset:1px}
  .lb-join .lb-err{color:#ff5d73;font-size:14px;margin-top:8px;min-height:1.2em}
  .lb-join form{display:block;margin:0;padding:0;border:0}
  .lb-join .lb-hint{font-size:13px;color:var(--muted);margin-top:2px}
  .lb-join .lb-actions{display:flex;gap:10px;justify-content:flex-end;align-items:center;margin-top:18px;padding:0;border:0}
  .lb-join .lb-go,.lb-join .lb-cancel{position:static;width:auto;height:44px;border-radius:99px;cursor:pointer;margin:0;letter-spacing:0;text-transform:none}
  .lb-join .lb-go{padding:0 24px;border:0;background:var(--grad);color:#fff;font:700 15px var(--sans)}
  .lb-join .lb-go[disabled]{opacity:.6;cursor:wait}
  .lb-join .lb-cancel{padding:0 18px;border:1px solid var(--line2);background:transparent;color:var(--muted);font:500 14px var(--sans)}
  .lb-join .lb-cancel:hover{color:var(--text);background:var(--panel2)}
  @media (max-width:860px){.lb-games{grid-template-columns:repeat(2,1fr)}}
  @media (max-width:600px){
    .board-btn .lbl-long{display:none}
    .board-btn,.stats-btn{padding:0 12px 0 10px}
    .top-right{gap:8px}
    .lb-games{grid-template-columns:1fr}
    .lb-row{padding:10px 12px;gap:8px;grid-template-columns:24px minmax(0,1fr) auto auto}
    .lb-row .dots i{width:7px;height:7px}
    .lb-row .dots{gap:3px}
    .lb-row .nm{font-size:16px}
    dialog.lb-join{padding:20px}
    .lb-join h3{font-size:25px}
    .lb-join .lb-actions{flex-direction:column-reverse;align-items:stretch}
    .lb-join .lb-go,.lb-join .lb-cancel{width:100%}
  }
  @media (min-width:601px){.board-btn .lbl-short{display:none}}
  </style>`);

  /* ================= Button + section ================= */
  const ICON_TROPHY = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 1.5h8v1.2h2.3v1.6c0 2-1.3 3.5-3 3.8A4 4 0 0 1 8.8 10v1.8H11v2.7H5v-2.7h2.2V10a4 4 0 0 1-2.5-1.9c-1.7-.3-3-1.8-3-3.8V2.7H4zm0 2.8H3.2v.1c0 1 .5 1.8 1.1 2.1A6 6 0 0 1 4 4.3zm8 0v.2a6 6 0 0 1-.3 2c.6-.3 1.1-1.1 1.1-2.1v-.1z"/></svg>';
  const ICON_GAMES = '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1.5"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1.5"/><rect x="9" y="9" width="5.5" height="5.5" rx="1.5"/></svg>';
  const right = document.querySelector('.top-right') || document.querySelector('.top');
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'board-btn'; btn.hidden = true;
  const statsBtn = document.querySelector('.stats-btn');
  statsBtn ? statsBtn.before(btn) : right.append(btn);

  const sec = document.createElement('section'); sec.className = 'board'; sec.id = 'board';
  document.querySelector('.foot-site').before(sec);

  /* ================= Open / close (works alongside the Stats view) ================= */
  const isOpen = () => location.hash === '#board';
  function paintBtn() {
    const open = document.body.classList.contains('show-board');
    btn.innerHTML = open ? `${ICON_GAMES}<span>Puzzles</span>`
                         : `${ICON_TROPHY}<span class="lbl-long">Leaderboard</span><span class="lbl-short">Board</span>`;
    btn.setAttribute('aria-label', open ? "Back to today's puzzles" : 'Show the leaderboard');
  }
  function showView() {
    const open = isOpen() && !!me;
    document.body.classList.toggle('show-board', open);
    paintBtn();
    if (open) refresh();
  }
  btn.addEventListener('click', () => {
    if (document.body.classList.contains('show-board')) {
      if (history.state === 'puzzl-board') history.back();
      else { history.replaceState(null, '', location.pathname + location.search); showView(); }
    } else {
      history.pushState('puzzl-board', '', '#board');
      window.dispatchEvent(new PopStateEvent('popstate', {state: 'puzzl-board'}));   // lets Stats close itself
      window.scrollTo({top: 0});
    }
  });
  window.addEventListener('popstate', showView);
  window.addEventListener('hashchange', showView);
  // if Stats opens while the board is showing, step aside
  new MutationObserver(() => {
    if (document.body.classList.contains('show-stats') && document.body.classList.contains('show-board')) {
      document.body.classList.remove('show-board'); paintBtn();
    }
  }).observe(document.body, {attributes: true, attributeFilter: ['class']});

  /* ================= Sending today's results ================= */
  let sending = false, sendJob = null;
  /* If a send is already running, hand back that one, so anyone waiting (e.g. nav.js) waits for it to finish */
  function sendResults() {
    if (!me) return Promise.resolve(0);
    if (!sendJob) sendJob = doSend().finally(() => { sendJob = null; });
    return sendJob;
  }
  window.puzzlLeague = {send: sendResults};   // used by nav.js when hopping between games
  async function doSend() {
    if (!me || sending) return 0;
    sending = true;
    const day = dayKey(), sent = load(SENT_KEY, {});
    const jobs = [];
    for (const g of GAMES) {
      if (!POINTS[g.id]) continue;
      const d = dayNumber(g.launch);
      let r = null; try { r = g.read(d); } catch (e) {}
      if (!r || !r.done) continue;
      const k = `${g.id}:${day}`;
      if (sent[k]) continue;
      let pts = 0; try { pts = POINTS[g.id](d); } catch (e) {}
      jobs.push([k, {p_game: g.id, p_points: Math.max(0, Math.min(100, pts | 0)), p_detail: String(r.result || '')}]);
    }
    try {
      const pr = porkResult(dayNumber(PORK.launch));
      if (pr && !sent[`pork:${day}`]) jobs.push([`pork:${day}`, {p_game: 'pork', p_points: pr.pts, p_detail: pr.txt}]);
    } catch (e) {}
    for (const [k, body] of jobs) {
      try { await rpc('puzzl_submit', Object.assign({p_code: me.code, p_player: me.id, p_day: day}, body)); sent[k] = 1; }
      catch (e) {
        if (/Not in this group/.test(e.message)) { sending = false; leaveGroup(); return 0; }
        if (/Wrong day|Unknown game|Impossible/.test(e.message)) sent[k] = 1;   // don't keep retrying those
      }
    }
    // forget sends older than a week
    for (const k of Object.keys(sent)) if (k.split(':')[1] < dayKey(-7)) delete sent[k];
    save(SENT_KEY, sent);
    sending = false;
    return jobs.length;
  }

  /* ================= Drawing the board ================= */
  let data = null, loading = false, lastErr = '';
  const FULL = GAMES.map(g => g.id);
  async function refresh() {
    if (!me || loading) return;
    loading = true;
    if (!data) draw();
    try {
      await sendResults();
      if (!me) { loading = false; return; }
      data = await rpc('puzzl_board', {p_code: me.code, p_since: dayKey(-6)}); lastErr = '';
      if (!(data.players || []).some(p => p.id === me.id)) { loading = false; leaveGroup(); return; }   // removed from the group
    }
    catch (e) { lastErr = e.message; if (/invite link/.test(e.message)) { loading = false; leaveGroup(); return; } }
    loading = false;
    draw();
  }

  function rankRows(list, val) {
    let prev = null, rank = 0;
    return list.map((x, i) => { const v = val(x); if (v !== prev) { rank = i + 1; prev = v; } return Object.assign({rank}, x); });
  }
  const medal = r => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : r;

  function draw() {
    if (!me) return;
    if (!data) {
      sec.innerHTML = lastErr ? `<div class="lb-msg">Couldn't load the leaderboard.<br>${esc(lastErr)}<br><button class="lb-link" id="lbRetry">Try again</button></div>`
                              : `<div class="lb-msg">Loading the leaderboard…</div>`;
      const rb = document.getElementById('lbRetry'); if (rb) rb.onclick = refresh;
      return;
    }
    const today = data.today, players = data.players || [], scores = data.scores || [];
    const nameOf = Object.fromEntries(players.map(p => [p.id, p.name]));
    const todays = scores.filter(s => s.d === today);
    const byPlayer = id => todays.filter(s => s.p === id && FULL.includes(s.g));

    // today's totals
    const totals = rankRows(players.map(p => { const mine = byPlayer(p.id);
        return {id: p.id, name: p.name, played: new Set(mine.map(s => s.g)), pts: mine.reduce((t, s) => t + s.pts, 0)}; })
      .sort((a, b) => (b.played.size > 0) - (a.played.size > 0) || b.pts - a.pts || a.name.localeCompare(b.name)), x => x.played.size ? x.pts : -1);
    const totalRows = totals.map(t => `
      <div class="lb-row${t.id === me.id ? ' me' : ''}${t.played.size ? '' : ' wait'}">
        <span class="rk">${t.played.size ? medal(t.rank) : '–'}</span>
        <span class="nm">${esc(t.name)}${t.id === me.id ? '<small>YOU</small>' : ''}</span>
        <span class="dots">${GAMES.map(g => `<i class="${t.played.has(g.id) ? 'on' : ''}" style="--c:${COLOURS[g.id]}"></i>`).join('')}</span>
        <span class="pt">${t.played.size ? `${t.pts}<span>/600</span>` : 'Not yet'}</span>
      </div>`).join('');

    // per game
    const gameCard = (id, name, colour) => {
      const rows = rankRows(todays.filter(s => s.g === id).sort((a, b) => b.pts - a.pts), s => s.pts);
      return `<div class="lb-panel" style="--c:${colour}">
        <div class="lb-title"><span>${esc(name)}</span><span>${rows.length}/${players.length}</span></div>
        ${rows.length ? rows.map(s => `<div class="lb-row${s.p === me.id ? ' me' : ''}${s.pts ? '' : ' zero'}">
            <span class="rk">${s.pts ? medal(s.rank) : '·'}</span><span class="nm">${esc(nameOf[s.p] || '?')}</span><span class="tx">${esc(s.txt)}</span></div>`).join('')
          : '<div class="lb-empty">No one yet</div>'}
      </div>`;
    };

    // last 7 days
    const week = rankRows(players.map(p => { const mine = scores.filter(s => s.p === p.id && FULL.includes(s.g));
        return {id: p.id, name: p.name, n: mine.length, pts: mine.reduce((t, s) => t + s.pts, 0)}; })
      .filter(x => x.n).sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name)), x => x.pts);
    const weekRows = week.length ? week.map(w => `
      <div class="lb-row${w.id === me.id ? ' me' : ''}"><span class="rk">${medal(w.rank)}</span><span class="nm">${esc(w.name)}</span>
        <span class="tx" style="font:400 12px var(--mono);color:var(--muted)">${w.n} game${w.n > 1 ? 's' : ''}</span><span class="pt">${w.pts}</span></div>`).join('')
      : '<div class="lb-empty">No scores yet this week</div>';

    sec.innerHTML = `
      <div class="head"><h2 class="grp">${esc(me.group || 'Leaderboard')}</h2><span class="sub2">${players.length} player${players.length === 1 ? '' : 's'}</span></div>
      <div class="lb-panel">
        <div class="lb-title"><span><b>Today's puzzles</b></span><span>Puzzl points</span></div>
        ${totalRows || '<div class="lb-empty">No players yet</div>'}
      </div>
      <div class="lb-games">${GAMES.map(g => gameCard(g.id, g.name, COLOURS[g.id])).join('')}</div>
      ${todays.some(s => s.g === 'pork') ? `<div class="lb-games" style="grid-template-columns:1fr">${gameCard('pork', PORK.name + ' · bonus, not in the total', PORK.colour)}</div>` : ''}
      <div class="lb-panel">
        <div class="lb-title"><span><b>Last 7 days</b></span><span>Points</span></div>
        ${weekRows}
      </div>
      <div class="lb-foot">
        <span>Playing as <b>${esc(me.name)}</b>${lastErr ? ` · <span style="color:#ff5d73">Couldn't refresh</span>` : ''}</span>
        <button class="lb-link" id="lbInvite" type="button">Invite a Puzzl Pal</button>
      </div>
      <details class="lb-how"><summary>How Puzzl Points work</summary>
        <p>Each daily game is worth up to 100 points, so the best possible day is 600.<br><br>
        <b>Dub Titles:</b> your score out of 30.<br>
        <b>Geo Clue:</b> 100 for one clue, 20 less for each extra.<br>
        <b>Pecking Order:</b> 100, 67 or 33 by tries.<br>
        <b>Tethered:</b> 100, minus 25 a mistake.<br>
        <b>Codebreaker:</b> 100 for one attempt, down to 17 for six.<br>
        <b>Quids In:</b> your winnings out of £180.<br><br>
        A loss scores 0. Results are sent when you come back to this page, and only your first go each day counts.<br><br>
        Porkies is a bonus game and doesn't count towards the total.</p></details>`;
    document.getElementById('lbInvite').onclick = invite;
  }

  async function invite() {
    const link = `${location.origin}${location.pathname}?join=${encodeURIComponent(me.code)}`;
    const text = `Join my Puzzl leaderboard, ${me.group}: ${link}`;
    const b = document.getElementById('lbInvite');
    try { if (navigator.share) { await navigator.share({title: 'Puzzl', text: `Join my Puzzl leaderboard, ${me.group}`, url: link}); return; } } catch (e) { return; }
    try { await navigator.clipboard.writeText(text); b.textContent = 'Link copied'; }
    catch (e) { prompt('Copy this invite link:', link); }
    setTimeout(() => { b.textContent = 'Invite a mate'; }, 2200);
  }

  /* ================= Joining through the invite link ================= */
  function joinDialog(code) {
    const dlg = document.createElement('dialog'); dlg.className = 'lb-join';
    dlg.innerHTML = `<form method="dialog">
      <h3>Think you can top the board?</h3>
      <p>Pick a name your Puzzl Pals will recognise. Your scores will appear on the leaderboard as you play.</p>
      <input id="lbName" maxlength="16" autocomplete="nickname" placeholder="Your name" required>
      <div class="lb-err" id="lbErr"></div>
      <p class="lb-hint">On a new device? Use the same name to carry on where you left off.</p>
      <div class="lb-actions"><button type="button" class="lb-cancel" id="lbNo">Not now</button><button type="submit" class="lb-go" id="lbGo">I'm in!</button></div>
    </form>`;
    document.body.append(dlg);
    const name = dlg.querySelector('#lbName'), err = dlg.querySelector('#lbErr'), go = dlg.querySelector('#lbGo');
    dlg.querySelector('#lbNo').onclick = () => dlg.close();
    dlg.querySelector('form').addEventListener('submit', async ev => {
      ev.preventDefault();
      const n = name.value.trim();
      if (!n) { err.textContent = 'Pop a name in first.'; return; }
      go.disabled = true; go.textContent = 'Joining…'; err.textContent = '';
      try {
        const j = await rpc('puzzl_join', {p_code: code, p_name: n});
        me = {code, id: j.id, name: j.name, group: j.group};
        save(ME_KEY, me);
        dlg.close();
        btn.hidden = false;
        history.replaceState(null, '', location.pathname);
        history.pushState('puzzl-board', '', '#board');
        window.dispatchEvent(new PopStateEvent('popstate', {state: 'puzzl-board'}));
      } catch (e) { err.textContent = e.message; go.disabled = false; go.textContent = 'Join'; }
    });
    dlg.addEventListener('close', () => dlg.remove());
    dlg.showModal(); setTimeout(() => name.focus(), 50);
  }

  /* ================= Start ================= */
  if (!configured) { console.warn('Puzzl leaderboard: add your Supabase URL and key at the top of leaderboard.js'); return; }
  const joinCode = new URLSearchParams(location.search).get('join');
  if (joinCode) {
    history.replaceState(null, '', location.pathname + location.hash);   // tidy the address bar
    if (!me || me.code !== joinCode) joinDialog(joinCode);
  }
  btn.hidden = !me;
  paintBtn();
  showView();
  if (me) sendResults();
  // send again when coming back from a game, and keep the board fresh while it's open
  window.addEventListener('pageshow', () => { if (me) isOpen() ? refresh() : sendResults(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && me) isOpen() ? refresh() : sendResults(); });
  setInterval(() => { if (me && isOpen() && !document.hidden) refresh(); }, 60000);
})();
