/* Puzzl · accounts and leaderboards
   • Sign in with a 6-digit code sent by email (no passwords). Optional: anyone can still just play.
   • A public "Everyone" board (Today, All-time, Streaks) that anyone can look at.
   • Private leagues (The Puzzl Crew) as extra tabs, joined through an invite link.
   • Today's results are sent automatically when a signed-in player comes back to the homepage.
   Loaded on the homepage AFTER stats.js. It uses GAMES, COLOURS, get, londonNow, dayNumber and
   RESET_HOUR from the main script. */
(() => {
  /* ================= Settings ================= */
  const SUPABASE_URL = 'https://eaojznfqcptctqgtvfbj.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_DsNChX74tHAfCAH-oL5a8w_7uigHhz-';   // the publishable key (never the secret one)
  const PROMPT_AGAIN_DAYS = 3;     // after "Not now", ask again this many days later

  const AUTH_KEY = 'puzzl-auth', ACCT_KEY = 'puzzl-account', LEGACY_KEY = 'puzzl-league', SENT_KEY = 'puzzl-sent-v2',
        PROMPT_KEY = 'puzzl-prompt', JOIN_KEY = 'puzzl-pending-join', SIGNIN_KEY = 'puzzl-signing-in', TAB_KEY = 'puzzl-board-tab';
  const BASE = SUPABASE_URL.replace(/\/$/, '');

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
  /* Porkies, the bonus game: shown on league boards but not in the daily total */
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
  const save = (k, v) => { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  function dayKey(offset = 0) {
    const o = londonNow(RESET_HOUR);
    return new Date(Date.UTC(+o.year, +o.month - 1, +o.day + offset)).toISOString().slice(0, 10);
  }
  const todayPoints = () => GAMES.reduce((t, g) => { const d = dayNumber(g.launch); let r = null; try { r = g.read(d); } catch (e) {}
    return r && r.done ? t + (POINTS[g.id] ? POINTS[g.id](d) | 0 : 0) : t; }, 0);
  const playedToday = () => GAMES.filter(g => { try { const r = g.read(dayNumber(g.launch)); return r && r.done; } catch (e) { return false; } }).length;

  /* ================= Signing in (Supabase Auth, email code) ================= */
  let session = load(AUTH_KEY, null);       // {access_token, refresh_token, expires_at, email}
  let account = load(ACCT_KEY, null);       // {id, name, groups:[{code,name}]}  (id null = signed in, no name yet)
  let legacy = load(LEGACY_KEY, null);      // the old name-only crew login on this device, until it's signed in
  const signedIn = () => !!(session && session.refresh_token);
  const hasName = () => signedIn() && account && account.id;

  function niceAuthError(j, status) {
    const m = (j && (j.msg || j.error_description || j.message || j.error)) || '';
    if (status === 429 || /seconds|rate limit/i.test(m)) {
      const s = (m.match(/(\d+)\s*seconds?/) || [])[1];
      return s ? `Hang on ${s} seconds before asking for another code.` : 'Too many tries. Give it a minute and try again.';
    }
    if (/expired|invalid/i.test(m) && /token|otp|code/i.test(m)) return "That code didn't work. Check it, or send a new one.";
    if (/email/i.test(m) && /invalid|valid/i.test(m)) return "That email address doesn't look right.";
    return m || 'Something went wrong. Try again in a moment.';
  }
  async function auth(path, body, token) {
    const h = {'Content-Type': 'application/json', apikey: SUPABASE_KEY};
    if (token) h.Authorization = 'Bearer ' + token;
    else if (SUPABASE_KEY.startsWith('eyJ')) h.Authorization = 'Bearer ' + SUPABASE_KEY;
    let r;
    try { r = await fetch(`${BASE}/auth/v1/${path}`, {method: 'POST', headers: h, body: JSON.stringify(body || {})}); }
    catch (e) { throw new Error("Couldn't reach Puzzl. Check your connection."); }
    const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
    if (!r.ok) { const err = new Error(niceAuthError(j, r.status)); err.status = r.status; throw err; }
    return j;
  }
  function keepSession(j, email) {
    session = {access_token: j.access_token, refresh_token: j.refresh_token,
               expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600),
               email: (j.user && j.user.email) || email || (session && session.email) || ''};
    save(AUTH_KEY, session);
  }
  const sendCode = email => auth('otp', {email, create_user: true});
  async function verifyCode(email, code) { keepSession(await auth('verify', {type: 'email', email, token: code}), email); }
  let refreshing = null;
  async function accessToken() {
    if (!signedIn()) return null;
    if (session.expires_at - 90 > Date.now() / 1000) return session.access_token;
    if (!refreshing) refreshing = auth('token?grant_type=refresh_token', {refresh_token: session.refresh_token})
      .then(j => keepSession(j))
      .catch(e => { if (e.status && e.status < 500) forget(); else throw e; })   // a dead login: sign out quietly
      .finally(() => { refreshing = null; });
    await refreshing;
    return signedIn() ? session.access_token : null;
  }
  function forget() {   // sign out on this device
    session = null; account = null;
    save(AUTH_KEY, null); save(ACCT_KEY, null);
  }
  async function signOut() {
    try { await Promise.race([syncStats(true), new Promise(r => setTimeout(r, 2500))]); } catch (e) {}   // back up first
    const t = session && session.access_token;
    forget();
    if (t) auth('logout', {}, t).catch(() => {});
    afterAccountChange();
  }

  /* ================= Calling the database ================= */
  async function rpc(fn, body, needAuth) {
    const h = {'Content-Type': 'application/json', apikey: SUPABASE_KEY};
    const tok = await accessToken().catch(() => null);
    if (tok) h.Authorization = 'Bearer ' + tok;
    else if (needAuth) throw new Error('Not signed in');
    else if (SUPABASE_KEY.startsWith('eyJ')) h.Authorization = 'Bearer ' + SUPABASE_KEY;
    let r;
    try { r = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {method: 'POST', headers: h, body: JSON.stringify(body || {})}); }
    catch (e) { throw new Error("Couldn't reach Puzzl. Check your connection."); }
    const t = await r.text(); let j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
    if (!r.ok) {
      if (r.status === 401 && tok && /jwt|expired|token/i.test((j && j.message) || '')) {   // login expired mid-call: refresh once
        session.expires_at = 0; return rpc(fn, body, needAuth);
      }
      throw new Error((j && j.message) || 'Something went wrong. Try again in a moment.');
    }
    return j;
  }
  async function loadAccount() {
    const j = await rpc('puzzl_me', {}, true);
    account = j.player ? {id: j.player.id, name: j.player.name, groups: j.groups || []} : {id: null, name: '', groups: []};
    save(ACCT_KEY, account);
    return account;
  }

  /* ================= Styles ================= */
  document.head.insertAdjacentHTML('beforeend', `<style>
  .board{display:none}
  body.show-board .board{display:block;animation:statsIn .35s cubic-bezier(.2,.8,.2,1)}
  body.show-board .wrap > .head, body.show-board #grid, body.show-board .bonus, body.show-board .stats, body.show-board .pz-prompt{display:none!important}
  .board-btn{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 14px 0 12px;border-radius:99px;cursor:pointer;
    background:var(--panel);border:1px solid var(--line2);color:var(--text);font:500 13px var(--sans);transition:background .15s,border-color .15s}
  .board-btn:hover{background:var(--panel2);border-color:rgba(168,85,247,.6)}
  .board-btn:focus-visible,.acct-btn:focus-visible{outline:2px solid var(--purple);outline-offset:2px}
  .board-btn svg{width:16px;height:16px;flex:none}
  body.show-board .board-btn{background:var(--grad);border-color:transparent;color:#fff}
  .acct-btn{width:36px;height:36px;border-radius:50%;flex:none;cursor:pointer;display:grid;place-items:center;padding:0;
    background:var(--panel);border:1px solid var(--line2);color:var(--ice);font:700 15px/1 var(--sans);transition:background .15s,border-color .15s}
  .acct-btn:hover{background:var(--panel2);border-color:rgba(168,85,247,.6)}
  .acct-btn svg{width:17px;height:17px}
  .acct-btn.in{background:var(--grad);border-color:transparent;color:#fff}
  .acct-btn.noname{background:var(--panel);border:1.5px dashed rgba(236,72,153,.8);color:#fff}

  .board .head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:14px}
  .board .grp{font:400 22px var(--serif);text-transform:none;letter-spacing:0;color:var(--text)}
  .board .sub2{font:500 11px var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--muted)}
  .lb-tabs{display:flex;gap:8px;margin-bottom:16px;overflow-x:auto;scrollbar-width:none}
  .lb-tabs::-webkit-scrollbar{display:none}
  .lb-tab{flex:none;height:38px;padding:0 16px;border-radius:99px;cursor:pointer;background:transparent;border:1px solid var(--line2);color:var(--ice);font:500 14px var(--sans);white-space:nowrap}
  .lb-tab:hover{background:var(--panel)}
  .lb-tab[aria-selected="true"]{background:var(--text);border-color:var(--text);color:var(--ink)}
  .lb-seg{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:4px;margin-bottom:12px;border-radius:14px;background:var(--panel);border:1px solid var(--line)}
  .lb-seg button{height:36px;border-radius:10px;border:0;background:transparent;color:var(--muted);font:500 12px var(--mono);letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
  .lb-seg button[aria-selected="true"]{background:var(--panel2);color:var(--text);box-shadow:inset 0 0 0 1px var(--line2)}
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
  .lb-row .tx{font:400 12px var(--mono);color:var(--muted);text-align:right;white-space:nowrap}
  .lb-row.me{background:rgba(168,85,247,.09)}
  .lb-row.wait .nm,.lb-row.wait .pt{color:var(--muted)}
  .lb-gap{padding:4px 16px;border-top:1px solid var(--line);color:var(--muted);font:500 13px var(--mono);text-align:center;letter-spacing:.3em}
  .lb-games{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px}
  .lb-games .lb-panel{margin:0}
  .lb-games .lb-title{color:var(--c)}
  .lb-games .lb-row{grid-template-columns:22px minmax(0,1fr) auto;padding:9px 14px;gap:8px}
  .lb-games .lb-row .nm{font-size:16px}
  .lb-games .lb-row .tx{color:var(--ice)}
  .lb-games .lb-row.zero .tx{color:#ff5d73}
  .lb-empty{padding:14px 16px;color:var(--muted);font-size:14px}
  .lb-foot{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-top:14px;font-size:13px;color:var(--muted)}
  .lb-foot b{color:var(--text);font-weight:500}
  .lb-link{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;padding:0 14px;border-radius:99px;border:1px solid var(--line2);background:transparent;color:var(--text);font:500 13px var(--sans);cursor:pointer;text-decoration:none}
  .lb-link:hover{background:var(--panel2)}
  .lb-cta{display:inline-flex;align-items:center;justify-content:center;height:40px;padding:0 20px;border-radius:99px;border:0;background:var(--grad);color:#fff;font:700 14px var(--sans);cursor:pointer;white-space:nowrap}
  .lb-how{margin-top:12px;font-size:13px;color:var(--muted)}
  .lb-how summary{cursor:pointer;color:var(--ice)}
  .lb-how p{margin-top:8px;line-height:1.55}
  .lb-msg{background:var(--panel);border:1px dashed var(--line2);border-radius:16px;padding:22px;color:var(--ice);text-align:center}
  .lb-msg button{margin-top:12px}
  .lb-join-card{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;padding:16px 18px;margin-bottom:14px;border-radius:16px;
    background:linear-gradient(135deg,rgba(168,85,247,.16),rgba(236,72,153,.12));border:1px solid rgba(168,85,247,.35);color:var(--ice);font-size:15px;line-height:1.45}
  .lb-join-card b{color:var(--text);font-weight:500}
  .pz-prompt{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:0 0 18px;padding:16px 18px;border-radius:18px;
    background:linear-gradient(135deg,rgba(168,85,247,.2),rgba(236,72,153,.14));border:1px solid rgba(168,85,247,.4);animation:statsIn .4s cubic-bezier(.2,.8,.2,1)}
  .pz-prompt .ic{font-size:26px;line-height:1}
  .pz-prompt .tx{flex:1 1 240px;color:var(--ice);font-size:15px;line-height:1.45}
  .pz-prompt .tx b{display:block;font:400 21px/1.2 var(--serif);color:var(--text);margin-bottom:2px}
  .pz-prompt .acts{display:flex;gap:8px;align-items:center}
  .pz-prompt .later{background:transparent;border:0;color:var(--muted);font:500 13px var(--sans);cursor:pointer;padding:8px}
  .pz-prompt .later:hover{color:var(--text)}

  dialog.lb-join{margin:auto;max-width:400px;width:calc(100% - 32px);border:1px solid var(--line2);border-radius:20px;background:var(--panel);color:var(--text);padding:24px}
  dialog.lb-join::backdrop{background:rgba(5,7,18,.72)}
  .lb-join h3{font:400 28px/1.1 var(--serif)}
  .lb-join p{color:var(--ice);margin-top:8px;font-size:15px;line-height:1.5}
  .lb-join p b{color:var(--text);font-weight:500;word-break:break-all}
  .lb-join input{width:100%;margin-top:16px;height:46px;border-radius:12px;border:1px solid var(--line2);background:var(--ink);color:var(--text);font:500 17px var(--sans);padding:0 14px}
  .lb-join input.code{font:500 26px var(--mono);letter-spacing:.35em;text-align:center;padding:0 0 0 .35em}
  .lb-join input:focus{outline:2px solid var(--purple);outline-offset:1px}
  .lb-join .lb-err{color:#ff5d73;font-size:14px;margin-top:8px;min-height:1.2em}
  .lb-join form{display:block;margin:0;padding:0;border:0}
  .lb-join .lb-hint{font-size:13px;color:var(--muted);margin-top:2px}
  .lb-join .lb-hint a,.lb-join .lb-hint button{color:var(--ice);background:none;border:0;padding:0;font:inherit;text-decoration:underline;cursor:pointer}
  .lb-join .lb-hint button[disabled]{color:var(--muted);text-decoration:none;cursor:default}
  .lb-join .lb-actions{display:flex;gap:10px;justify-content:flex-end;align-items:center;margin-top:18px;padding:0;border:0}
  .lb-join .lb-go,.lb-join .lb-cancel{position:static;width:auto;height:44px;border-radius:99px;cursor:pointer;margin:0;letter-spacing:0;text-transform:none}
  .lb-join .lb-go{padding:0 24px;border:0;background:var(--grad);color:#fff;font:700 15px var(--sans)}
  .lb-join .lb-go[disabled]{opacity:.6;cursor:wait}
  .lb-join .lb-go.danger{background:#ff5d73;color:#2a0610}
  .lb-join .lb-cancel{padding:0 18px;border:1px solid var(--line2);background:transparent;color:var(--muted);font:500 14px var(--sans)}
  .lb-join .lb-cancel:hover{color:var(--text);background:var(--panel2)}
  .acct-list{margin-top:16px;border-top:1px solid var(--line)}
  .acct-list button,.acct-list a{display:flex;width:100%;align-items:center;justify-content:space-between;gap:10px;padding:14px 2px;border:0;border-bottom:1px solid var(--line);
    background:none;color:var(--text);font:500 15px var(--sans);text-align:left;cursor:pointer;text-decoration:none}
  .acct-list button:hover,.acct-list a:hover{color:#fff}
  .acct-list span{color:var(--muted);font-size:13px}
  .acct-list .del{color:#ff5d73}
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
    .pz-prompt{padding:14px}
    .pz-prompt .acts{width:100%}
    .pz-prompt .acts .lb-cta{flex:1}
  }
  @media (max-width:389px){
    .board-btn span,.stats-btn span{display:none}
    .board-btn,.stats-btn{width:36px;padding:0;justify-content:center}
  }
  @media (min-width:601px){.board-btn .lbl-short{display:none}}
  </style>`);

  /* ================= Header buttons + section ================= */
  const ICON_TROPHY = '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 1.5h8v1.2h2.3v1.6c0 2-1.3 3.5-3 3.8A4 4 0 0 1 8.8 10v1.8H11v2.7H5v-2.7h2.2V10a4 4 0 0 1-2.5-1.9c-1.7-.3-3-1.8-3-3.8V2.7H4zm0 2.8H3.2v.1c0 1 .5 1.8 1.1 2.1A6 6 0 0 1 4 4.3zm8 0v.2a6 6 0 0 1-.3 2c.6-.3 1.1-1.1 1.1-2.1v-.1z"/></svg>';
  const ICON_GAMES = '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1.5"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1.5"/><rect x="9" y="9" width="5.5" height="5.5" rx="1.5"/></svg>';
  const ICON_PERSON = '<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="5" r="3"/><path d="M2.2 14.5c.5-3 2.9-4.8 5.8-4.8s5.3 1.8 5.8 4.8z"/></svg>';
  const right = document.querySelector('.top-right') || document.querySelector('.top');
  const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'board-btn';
  const statsBtn = document.querySelector('.stats-btn');
  statsBtn ? statsBtn.before(btn) : right.append(btn);
  const acctBtn = document.createElement('button'); acctBtn.type = 'button'; acctBtn.className = 'acct-btn';
  right.append(acctBtn);

  const sec = document.createElement('section'); sec.className = 'board'; sec.id = 'board';
  document.querySelector('.foot-site').before(sec);

  function paintAcct() {
    if (hasName()) {
      acctBtn.className = 'acct-btn in'; acctBtn.textContent = (account.name.match(/[A-Za-zÀ-ÿ0-9]/) || ['?'])[0].toUpperCase();
      acctBtn.setAttribute('aria-label', `Your account (${account.name})`);
    } else if (signedIn()) {
      acctBtn.className = 'acct-btn noname'; acctBtn.innerHTML = ICON_PERSON; acctBtn.setAttribute('aria-label', 'Pick your Puzzl name');
    } else {
      acctBtn.className = 'acct-btn'; acctBtn.innerHTML = ICON_PERSON; acctBtn.setAttribute('aria-label', 'Sign in');
    }
  }
  acctBtn.addEventListener('click', () => hasName() ? accountDialog() : signedIn() ? signInDialog({start: 'name'}) : signInDialog({}));

  /* ================= Open / close (works alongside the Stats view) ================= */
  const isOpen = () => location.hash === '#board';
  function paintBtn() {
    const open = document.body.classList.contains('show-board');
    btn.innerHTML = open ? `${ICON_GAMES}<span>Puzzles</span>`
                         : `${ICON_TROPHY}<span class="lbl-long">Leaderboard</span><span class="lbl-short">Board</span>`;
    btn.setAttribute('aria-label', open ? "Back to today's puzzles" : 'Show the leaderboard');
  }
  function showView() {
    const open = isOpen();
    document.body.classList.toggle('show-board', open);
    paintBtn();
    if (open) refresh();
  }
  function openBoard(tab) {
    if (tab) save(TAB_KEY, tab);
    if (isOpen()) { refresh(true); return; }
    history.pushState('puzzl-board', '', '#board');
    window.dispatchEvent(new PopStateEvent('popstate', {state: 'puzzl-board'}));   // lets Stats close itself
    window.scrollTo({top: 0});
  }
  btn.addEventListener('click', () => {
    if (document.body.classList.contains('show-board')) {
      if (history.state === 'puzzl-board') history.back();
      else { history.replaceState(null, '', location.pathname + location.search); showView(); }
    } else openBoard();
  });
  window.addEventListener('popstate', showView);
  window.addEventListener('hashchange', showView);
  new MutationObserver(() => {   // if Stats opens while the board is showing, step aside
    if (document.body.classList.contains('show-stats') && document.body.classList.contains('show-board')) {
      document.body.classList.remove('show-board'); paintBtn();
    }
  }).observe(document.body, {attributes: true, attributeFilter: ['class']});

  /* ================= Sending today's results ================= */
  let sendJob = null;
  function sendResults() {   // if a send is already running, hand back that one (nav.js waits for it)
    if (!hasName() && !(legacy && legacy.id)) return Promise.resolve(0);
    if (!sendJob) sendJob = doSend().finally(() => { sendJob = null; });
    return sendJob;
  }
  window.puzzlLeague = {send: sendResults};
  async function doSend() {
    const asAccount = hasName(), who = asAccount ? account.id : legacy.id;
    const day = dayKey(), sentAll = load(SENT_KEY, {}), sent = sentAll[who] || {};
    const jobs = [];
    for (const g of GAMES) {
      if (!POINTS[g.id]) continue;
      const d = dayNumber(g.launch);
      let r = null; try { r = g.read(d); } catch (e) {}
      if (!r || !r.done || sent[`${g.id}:${day}`]) continue;
      let pts = 0; try { pts = POINTS[g.id](d); } catch (e) {}
      jobs.push([`${g.id}:${day}`, {p_game: g.id, p_points: Math.max(0, Math.min(100, pts | 0)), p_detail: String(r.result || '')}]);
    }
    try {
      const pr = porkResult(dayNumber(PORK.launch));
      if (pr && !sent[`pork:${day}`]) jobs.push([`pork:${day}`, {p_game: 'pork', p_points: pr.pts, p_detail: pr.txt}]);
    } catch (e) {}
    for (const [k, body] of jobs) {
      try {
        if (asAccount) await rpc('puzzl_submit_me', Object.assign({p_day: day}, body), true);
        else await rpc('puzzl_submit', Object.assign({p_code: legacy.code, p_player: legacy.id, p_day: day}, body));
        sent[k] = 1;
      } catch (e) {
        if (!asAccount && /Not in this group/.test(e.message)) { legacy = null; save(LEGACY_KEY, null); return 0; }   // name now belongs to an account
        if (/Wrong day|Unknown game|Impossible/.test(e.message)) sent[k] = 1;   // don't keep retrying those
        if (/Not signed in|Pick a name/.test(e.message)) break;
      }
    }
    for (const k of Object.keys(sent)) if (k.split(':')[1] < dayKey(-7)) delete sent[k];   // forget sends older than a week
    sentAll[who] = sent; save(SENT_KEY, sentAll);
    return jobs.length;
  }

  /* ================= The boards ================= */
  let tab = load(TAB_KEY, 'all');      // 'all' (Everyone) or a league code
  let view = 'day';                    // Everyone: 'day' | 'all' | 'streak'
  let globalData = null, crewData = {}, loading = false, lastErr = '';
  const leagues = () => hasName() ? account.groups : (legacy && legacy.id ? [{code: legacy.code, name: legacy.group || 'Your league'}] : []);

  async function refresh(force) {
    if (loading && !force) return;
    loading = true;
    if (tab !== 'all' && !leagues().some(l => l.code === tab)) tab = 'all';
    draw();
    try {
      await sendResults();
      if (tab === 'all') globalData = await rpc('puzzl_global', {});
      else crewData[tab] = await rpc('puzzl_board', {p_code: tab, p_since: dayKey(-6)});
      lastErr = '';
    } catch (e) { lastErr = e.message; }
    loading = false;
    draw();
  }

  function rankRows(list, val) {
    let prev = null, rank = 0;
    return list.map((x, i) => { const v = val(x); if (v !== prev) { rank = i + 1; prev = v; } return Object.assign({rank}, x); });
  }
  const medal = r => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : r;
  const you = id => hasName() && id === account.id ? '<small>YOU</small>' : '';
  const meCls = id => hasName() && id === account.id ? ' me' : '';
  const gameDots = played => `<span class="dots">${GAMES.map(g => `<i class="${played.includes(g.id) ? 'on' : ''}" style="--c:${COLOURS[g.id]}"></i>`).join('')}</span>`;

  function draw() {
    const tabs = [{code: 'all', name: 'Everyone'}, ...leagues()];
    const tabBar = tabs.length < 2 ? '' : `<div class="lb-tabs" role="tablist">${tabs.map(t =>
      `<button class="lb-tab" role="tab" data-tab="${esc(t.code)}" aria-selected="${t.code === tab}">${t.code === 'all' ? '🌍 ' : ''}${esc(t.name)}</button>`).join('')}</div>`;
    let body = '';
    if (tab === 'all') body = drawGlobal();
    else body = drawCrew(tab);
    sec.innerHTML = tabBar + body;
    sec.querySelectorAll('.lb-tab').forEach(b => b.onclick = () => { tab = b.dataset.tab; save(TAB_KEY, tab); refresh(true); });
    sec.querySelectorAll('.lb-seg button').forEach(b => b.onclick = () => { view = b.dataset.v; draw(); });
    sec.querySelectorAll('[data-act="signin"]').forEach(b => b.onclick = () => signInDialog({}));
    sec.querySelectorAll('[data-act="name"]').forEach(b => b.onclick = () => signInDialog({start: 'name'}));
    const rb = sec.querySelector('#lbRetry'); if (rb) rb.onclick = () => refresh(true);
    const ib = sec.querySelector('#lbInvite'); if (ib) ib.onclick = () => invite(ib);
  }

  function joinCard() {
    if (hasName()) return '';
    if (signedIn()) return `<div class="lb-join-card"><span><b>One last step.</b> Pick a name to appear on the boards.</span><button class="lb-cta" data-act="name">Pick a name</button></div>`;
    if (legacy && legacy.id) return `<div class="lb-join-card"><span><b>Puzzl has proper accounts now.</b> Sign in once to lock in the name ${esc(legacy.name)} and keep your scores.</span><button class="lb-cta" data-act="signin">Sign in</button></div>`;
    const n = playedToday();
    return `<div class="lb-join-card"><span><b>Get on the board.</b> ${n ? `Sign in to add today's ${todayPoints()} points` : 'Sign in to save your scores'} and see how you rank against everyone.</span><button class="lb-cta" data-act="signin">Sign in</button></div>`;
  }

  function drawGlobal() {
    const seg = `<div class="lb-seg" role="tablist">${[['day', 'Today'], ['all', 'All-time'], ['streak', 'Streaks']].map(([v, l]) =>
      `<button role="tab" data-v="${v}" aria-selected="${view === v}">${l}</button>`).join('')}</div>`;
    if (!globalData) return joinCard() + seg + (lastErr
      ? `<div class="lb-msg">Couldn't load the leaderboard.<br>${esc(lastErr)}<br><button class="lb-link" id="lbRetry">Try again</button></div>`
      : `<div class="lb-msg">Loading the leaderboard…</div>`);
    const G = globalData, part = G[view === 'day' ? 'day' : view] || {top: [], me: null};
    const top = part.top || [], mine = part.me;
    const row = r => {
      if (view === 'day') return `<div class="lb-row${meCls(r.id)}"><span class="rk">${medal(r.rank)}</span><span class="nm">${esc(r.name)}${you(r.id)}</span>${gameDots(r.games || [])}<span class="pt">${r.pts}<span>/600</span></span></div>`;
      if (view === 'all') return `<div class="lb-row${meCls(r.id)}"><span class="rk">${medal(r.rank)}</span><span class="nm">${esc(r.name)}${you(r.id)}</span><span class="tx">${r.days} day${r.days === 1 ? '' : 's'}</span><span class="pt">${r.pts.toLocaleString('en-GB')}</span></div>`;
      return `<div class="lb-row${meCls(r.id)}"><span class="rk">${r.rank ? medal(r.rank) : '–'}</span><span class="nm">${esc(r.name)}${you(r.id)}</span><span class="tx">best ${r.best}</span><span class="pt">🔥 ${r.cur}</span></div>`;
    };
    let rows = top.map(row).join('');
    if (mine && !top.some(r => r.id === mine.id) && (view !== 'streak' || mine.cur > 0)) rows += `<div class="lb-gap">···</div>` + row(mine);
    const empty = {day: 'No scores yet today. Be the first!', all: 'No scores yet.', streak: 'No streaks going yet.'}[view];
    const title = {day: [`Today · ${G.day.count} player${G.day.count === 1 ? '' : 's'}`, 'Puzzl points'],
                   all: [`All-time · ${G.players} player${G.players === 1 ? '' : 's'}`, 'Points'],
                   streak: ['Days in a row', 'Streak']}[view];
    let note = '';
    if (view === 'streak' && hasName() && mine && !mine.cur) note = `<div class="lb-empty">Your best run is ${mine.best} day${mine.best === 1 ? '' : 's'}. Play today to start a new one.</div>`;
    return `${joinCard()}${seg}
      <div class="lb-panel"><div class="lb-title"><span><b>${title[0]}</b></span><span>${title[1]}</span></div>
        ${rows || `<div class="lb-empty">${empty}</div>`}${note}</div>
      <div class="lb-foot"><span>${hasName() ? `Playing as <b>${esc(account.name)}</b>` : 'Top 50 shown'}${lastErr ? ` · <span style="color:#ff5d73">Couldn't refresh</span>` : ''}</span></div>
      ${howPoints()}`;
  }

  function drawCrew(code) {
    const data = crewData[code];
    const meId = hasName() ? account.id : legacy && legacy.id;
    if (!data) return lastErr
      ? `<div class="lb-msg">Couldn't load the leaderboard.<br>${esc(lastErr)}<br><button class="lb-link" id="lbRetry">Try again</button></div>`
      : `<div class="lb-msg">Loading the leaderboard…</div>`;
    const FULL = GAMES.map(g => g.id);
    const today = data.today, players = data.players || [], scores = data.scores || [];
    const nameOf = Object.fromEntries(players.map(p => [p.id, p.name]));
    const todays = scores.filter(s => s.d === today);
    const isMe = id => id === meId;
    const totals = rankRows(players.map(p => { const mine = todays.filter(s => s.p === p.id && FULL.includes(s.g));
        return {id: p.id, name: p.name, played: mine.map(s => s.g), pts: mine.reduce((t, s) => t + s.pts, 0)}; })
      .sort((a, b) => (b.played.length > 0) - (a.played.length > 0) || b.pts - a.pts || a.name.localeCompare(b.name)), x => x.played.length ? x.pts : -1);
    const totalRows = totals.map(t => `
      <div class="lb-row${isMe(t.id) ? ' me' : ''}${t.played.length ? '' : ' wait'}">
        <span class="rk">${t.played.length ? medal(t.rank) : '–'}</span>
        <span class="nm">${esc(t.name)}${isMe(t.id) ? '<small>YOU</small>' : ''}</span>
        ${gameDots(t.played)}
        <span class="pt">${t.played.length ? `${t.pts}<span>/600</span>` : 'Not yet'}</span>
      </div>`).join('');
    const gameCard = (id, name, colour) => {
      const rows = rankRows(todays.filter(s => s.g === id).sort((a, b) => b.pts - a.pts), s => s.pts);
      return `<div class="lb-panel" style="--c:${colour}">
        <div class="lb-title"><span>${esc(name)}</span><span>${rows.length}/${players.length}</span></div>
        ${rows.length ? rows.map(s => `<div class="lb-row${isMe(s.p) ? ' me' : ''}${s.pts ? '' : ' zero'}">
            <span class="rk">${s.pts ? medal(s.rank) : '·'}</span><span class="nm">${esc(nameOf[s.p] || '?')}</span><span class="tx">${esc(s.txt)}</span></div>`).join('')
          : '<div class="lb-empty">No one yet</div>'}
      </div>`;
    };
    const week = rankRows(players.map(p => { const mine = scores.filter(s => s.p === p.id && FULL.includes(s.g));
        return {id: p.id, name: p.name, n: mine.length, pts: mine.reduce((t, s) => t + s.pts, 0)}; })
      .filter(x => x.n).sort((a, b) => b.pts - a.pts || a.name.localeCompare(b.name)), x => x.pts);
    const weekRows = week.length ? week.map(w => `
      <div class="lb-row${isMe(w.id) ? ' me' : ''}"><span class="rk">${medal(w.rank)}</span><span class="nm">${esc(w.name)}</span>
        <span class="tx">${w.n} game${w.n > 1 ? 's' : ''}</span><span class="pt">${w.pts}</span></div>`).join('')
      : '<div class="lb-empty">No scores yet this week</div>';
    return `${legacy && legacy.id && !hasName() ? joinCard() : ''}
      <div class="head"><h2 class="grp">${esc(data.group || 'Your league')}</h2><span class="sub2">${players.length} player${players.length === 1 ? '' : 's'}</span></div>
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
        <span>${lastErr ? `<span style="color:#ff5d73">Couldn't refresh</span>` : 'Private league'}</span>
        <button class="lb-link" id="lbInvite" type="button" data-code="${esc(code)}" data-name="${esc(data.group || '')}">Invite a Puzzl Pal</button>
      </div>
      ${howPoints()}`;
  }

  const howPoints = () => `<details class="lb-how"><summary>How Puzzl Points work</summary>
    <p>Each daily game is worth up to 100 points, so the best possible day is 600.<br><br>
    <b>Dub Titles:</b> your score out of 30.<br>
    <b>Geo Clue:</b> 100 for one clue, 20 less for each extra.<br>
    <b>Pecking Order:</b> 100, 67 or 33 by tries.<br>
    <b>Tethered:</b> 100, minus 25 a mistake.<br>
    <b>Codebreaker:</b> 100 for one attempt, down to 17 for six.<br>
    <b>Quids In:</b> your winnings out of £180.<br><br>
    A loss scores 0. Results are sent when you come back to this page, and only your first go each day counts.
    A streak is days in a row with at least one daily game played.<br><br>
    Porkies is a bonus game and doesn't count towards the total.</p></details>`;

  async function invite(b) {
    const code = b.dataset.code, gname = b.dataset.name || 'my Puzzl league';
    const link = `${location.origin}/?join=${encodeURIComponent(code)}`;
    try { if (navigator.share) { await navigator.share({title: 'Puzzl', text: `Join ${gname} on Puzzl`, url: link}); return; } } catch (e) { return; }
    try { await navigator.clipboard.writeText(`Join ${gname} on Puzzl: ${link}`); b.textContent = 'Link copied'; }
    catch (e) { prompt('Copy this invite link:', link); }
    setTimeout(() => { b.textContent = 'Invite a Puzzl Pal'; }, 2200);
  }

  /* ================= The sign-in dialog ================= */
  let dlgOpen = null;
  function signInDialog({start = 'email', joinName = '', email = ''} = {}) {
    if (dlgOpen) dlgOpen.close();
    const dlg = document.createElement('dialog'); dlg.className = 'lb-join'; dlgOpen = dlg;
    document.body.append(dlg);
    let em = email || (session && session.email) || '', resendAt = 0, timer = null;
    const set = html => { dlg.innerHTML = html; };
    const closeBtn = label => `<button type="button" class="lb-cancel" data-close>${label}</button>`;
    const wire = () => dlg.querySelectorAll('[data-close]').forEach(b => b.onclick = () => dlg.close());

    function stepEmail(msg = '') {
      set(`<form novalidate>
        <h3>${joinName ? `Join ${esc(joinName)}` : 'Save your scores'}</h3>
        <p>${joinName ? 'Sign in to join the league. ' : ''}Pop your email in and we'll send you a 6-digit code. No password needed.</p>
        <input id="pzEmail" type="email" inputmode="email" autocomplete="email" placeholder="you@example.com" value="${esc(em)}" required>
        <div class="lb-err">${esc(msg)}</div>
        <p class="lb-hint">We only use your email to sign you in. <a href="/privacy/" target="_blank" rel="noopener">Privacy</a></p>
        <div class="lb-actions">${closeBtn('Not now')}<button type="submit" class="lb-go">Send code</button></div></form>`);
      wire();
      const inp = dlg.querySelector('#pzEmail'), go = dlg.querySelector('.lb-go'), err = dlg.querySelector('.lb-err');
      setTimeout(() => inp.focus(), 50);
      dlg.querySelector('form').onsubmit = async ev => {
        ev.preventDefault();
        em = inp.value.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em)) { err.textContent = "That email address doesn't look right."; return; }
        go.disabled = true; go.textContent = 'Sending…'; err.textContent = '';
        try { await sendCode(em); save(SIGNIN_KEY, {email: em, at: Date.now(), joinName}); resendAt = Date.now() + 60e3; stepCode(); }
        catch (e) { err.textContent = e.message; go.disabled = false; go.textContent = 'Send code'; }
      };
    }

    function stepCode(msg = '') {
      set(`<form>
        <h3>Check your email</h3>
        <p>We've sent a code to <b>${esc(em)}</b>. It can take a minute to arrive.</p>
        <input id="pzCode" class="code" inputmode="numeric" autocomplete="one-time-code" maxlength="10" placeholder="••••••" required>
        <div class="lb-err">${esc(msg)}</div>
        <p class="lb-hint">Not there? Check your junk folder, or <button type="button" id="pzResend">send a new code</button>. <button type="button" id="pzBack">Wrong email?</button></p>
        <div class="lb-actions">${closeBtn('Cancel')}<button type="submit" class="lb-go">Sign in</button></div></form>`);
      wire();
      const inp = dlg.querySelector('#pzCode'), go = dlg.querySelector('.lb-go'), err = dlg.querySelector('.lb-err'), rs = dlg.querySelector('#pzResend');
      setTimeout(() => inp.focus(), 50);
      const paintResend = () => {
        const s = Math.ceil((resendAt - Date.now()) / 1000);
        rs.disabled = s > 0; rs.textContent = s > 0 ? `send a new code in ${s}s` : 'send a new code';
      };
      paintResend(); clearInterval(timer); timer = setInterval(paintResend, 1000);
      rs.onclick = async () => {
        rs.disabled = true; err.textContent = '';
        try { await sendCode(em); resendAt = Date.now() + 60e3; err.style.color = 'var(--ok)'; err.textContent = 'New code sent.'; }
        catch (e) { err.style.color = ''; err.textContent = e.message; }
        paintResend();
      };
      dlg.querySelector('#pzBack').onclick = () => { clearInterval(timer); stepEmail(); };
      inp.oninput = () => { inp.value = inp.value.replace(/\D/g, ''); if (inp.value.length === 6 && !go.disabled) go.click(); };
      dlg.querySelector('form').onsubmit = async ev => {
        ev.preventDefault();
        const code = inp.value.replace(/\D/g, '');
        if (code.length < 6) { err.style.color = ''; err.textContent = 'The code is 6 digits.'; return; }
        go.disabled = true; go.textContent = 'Signing in…'; err.textContent = '';
        try {
          await verifyCode(em, code);
          clearInterval(timer); save(SIGNIN_KEY, null);
          await afterVerify();
        } catch (e) { err.style.color = ''; err.textContent = e.message; go.disabled = false; go.textContent = 'Sign in'; }
      };
    }

    async function afterVerify() {
      set(`<h3>Signing you in…</h3><p>Just a moment.</p>`);
      try {
        await loadAccount();
        if (!account.id && legacy && legacy.id) {   // crew member on their usual phone: keep their name
          try {
            const j = await rpc('puzzl_claim', {p_player: legacy.id}, true);
            await loadAccount();
            if (j.claimed) { save(LEGACY_KEY, null); legacy = null; await finish(`Welcome back, ${esc(account.name)}`, 'Your name is now locked to your account, and your stats and streaks are backed up.'); return; }
          } catch (e) { /* someone else has it: pick a new name */ }
        }
        if (!account.id) { stepName(); return; }
        await finish(`Welcome back, ${esc(account.name)}`, "You're signed in. Your stats and streaks have been brought over to this device.");
      } catch (e) { stepEmail(e.message); }
    }

    function stepName(msg = '') {
      const suggestion = account && account.name ? account.name : (legacy && legacy.name) || '';
      set(`<form>
        <h3>${account && account.id ? 'Change your name' : 'Pick your Puzzl name'}</h3>
        <p>This is how you'll appear on the leaderboards. 2 to 16 letters or numbers. Keep it friendly!</p>
        <input id="pzName" maxlength="16" autocomplete="nickname" placeholder="Your name" value="${esc(suggestion)}" required>
        <div class="lb-err">${esc(msg)}</div>
        <div class="lb-actions">${closeBtn(account && account.id ? 'Cancel' : 'Later')}<button type="submit" class="lb-go">Save</button></div></form>`);
      wire();
      const inp = dlg.querySelector('#pzName'), go = dlg.querySelector('.lb-go'), err = dlg.querySelector('.lb-err');
      setTimeout(() => { inp.focus(); inp.select(); }, 50);
      dlg.querySelector('form').onsubmit = async ev => {
        ev.preventDefault();
        const had = !!(account && account.id);
        go.disabled = true; go.textContent = 'Saving…'; err.textContent = '';
        try {
          await rpc('puzzl_set_name', {p_name: inp.value}, true);
          await loadAccount();
          if (had) { dlg.close(); afterAccountChange(); return; }
          await finish(`Nice one, ${esc(account.name)}`, "You're on the boards, and your stats and streaks now follow you to any device.");
        } catch (e) { err.textContent = e.message; go.disabled = false; go.textContent = 'Save'; }
      };
    }

    async function finish(title, text) {
      let joined = '';
      const pending = load(JOIN_KEY, null);
      if (pending && pending.code) {
        try { const g = await rpc('puzzl_join_group', {p_code: pending.code}, true); joined = g.name; tab = g.code; save(TAB_KEY, tab); await loadAccount(); }
        catch (e) { joined = ''; text += ` (Couldn't join the league: ${esc(e.message)})`; }
        save(JOIN_KEY, null);
      }
      set(`<h3>${title} 👋</h3><p>${text}${joined ? ` You've joined <b>${esc(joined)}</b>.` : ''}</p>
        <div class="lb-actions"><button type="button" class="lb-go" id="pzSee">See the leaderboard</button></div>`);
      dlg.querySelector('#pzSee').onclick = () => { dlg.close(); openBoard(); };
      afterAccountChange();
    }

    dlg.addEventListener('close', () => { clearInterval(timer); save(SIGNIN_KEY, null); dlg.remove(); if (dlgOpen === dlg) dlgOpen = null; });
    dlg.addEventListener('cancel', () => {});
    if (start === 'name') stepName(); else if (start === 'code') stepCode(); else stepEmail();
    dlg.showModal();
  }

  /* ================= Account sheet ================= */
  function accountDialog() {
    if (dlgOpen) dlgOpen.close();
    const dlg = document.createElement('dialog'); dlg.className = 'lb-join'; dlgOpen = dlg;
    document.body.append(dlg);
    const main = () => {
      dlg.innerHTML = `<h3>${esc(account.name)}</h3><p>${esc((session && session.email) || '')}</p>
        <div class="acct-list">
          <button type="button" data-a="board">Leaderboards <span>→</span></button>
          <button type="button" data-a="name">Change name <span>${esc(account.name)}</span></button>
          <button type="button" data-a="sync">Stats backed up <span id="pzSyncAt">${syncLabel()}</span></button>
          ${account.groups.length ? `<button type="button" data-a="board">Your leagues <span>${account.groups.map(g => esc(g.name)).join(', ')}</span></button>` : ''}
          <a href="/privacy/" target="_blank" rel="noopener">Privacy <span>What we keep</span></a>
          <button type="button" data-a="out">Sign out</button>
          <button type="button" data-a="del" class="del">Delete my account</button>
        </div>
        <div class="lb-actions"><button type="button" class="lb-cancel" data-close>Close</button></div>`;
      dlg.querySelector('[data-close]').onclick = () => dlg.close();
      dlg.querySelectorAll('[data-a]').forEach(b => b.onclick = () => {
        const a = b.dataset.a;
        if (a === 'board') { dlg.close(); openBoard(); }
        if (a === 'name') { dlg.close(); signInDialog({start: 'name'}); }
        if (a === 'out') { dlg.close(); signOut(); }
        if (a === 'del') confirmDelete();
        if (a === 'sync') { const sp = dlg.querySelector('#pzSyncAt'); sp.textContent = 'Backing up…';
          syncStats(true).then(() => { sp.textContent = syncLabel(); }); }
      });
    };
    const confirmDelete = () => {
      dlg.innerHTML = `<h3>Delete your account?</h3>
        <p>This removes <b>${esc(account.name)}</b>, your email and all your leaderboard scores for good. Your stats on this device stay put.</p>
        <div class="lb-err"></div>
        <div class="lb-actions"><button type="button" class="lb-cancel" id="pzKeep">Keep my account</button><button type="button" class="lb-go danger" id="pzDel">Delete for good</button></div>`;
      dlg.querySelector('#pzKeep').onclick = main;
      dlg.querySelector('#pzDel').onclick = async ev => {
        const b = ev.currentTarget; b.disabled = true; b.textContent = 'Deleting…';
        try {
          await rpc('puzzl_delete_me', {}, true);
          forget(); save(SENT_KEY, null); save(SYNC_OWNER, null); save(SYNC_AT, null);
          dlg.innerHTML = `<h3>All gone</h3><p>Your account and scores have been deleted. You can carry on playing without one.</p>
            <div class="lb-actions"><button type="button" class="lb-go" data-close>OK</button></div>`;
          dlg.querySelector('[data-close]').onclick = () => dlg.close();
          afterAccountChange();
        } catch (e) { dlg.querySelector('.lb-err').textContent = e.message; b.disabled = false; b.textContent = 'Delete for good'; }
      };
    };
    dlg.addEventListener('close', () => { dlg.remove(); if (dlgOpen === dlg) dlgOpen = null; });
    main();
    dlg.showModal();
  }

  /* ================= "Save your score" prompt, after the first game ================= */
  function paintPrompt() {
    const old = document.querySelector('.pz-prompt'); if (old) old.remove();
    if (hasName()) return;
    const n = playedToday();
    const p = load(PROMPT_KEY, {});
    let html = '';
    if (signedIn()) {
      html = `<span class="ic">✍️</span><div class="tx"><b>One last step</b>Pick a name so your scores show on the leaderboards.</div>
        <div class="acts"><button class="lb-cta" data-p="name">Pick a name</button></div>`;
    } else if (legacy && legacy.id) {
      if (p.legacy === dayKey()) return;
      html = `<span class="ic">🔒</span><div class="tx"><b>Keep your name, ${esc(legacy.name)}</b>Puzzl has proper accounts now. Sign in once with your email to lock in your name and scores.</div>
        <div class="acts"><button class="later" data-p="later-legacy">Not now</button><button class="lb-cta" data-p="in">Sign in</button></div>`;
    } else {
      if (!n) return;
      if (p.until && p.until > Date.now()) return;
      html = `<span class="ic">🏆</span><div class="tx"><b>Save today's ${todayPoints()} points?</b>Sign in to get on the leaderboard and see how you rank against everyone.</div>
        <div class="acts"><button class="later" data-p="later">Not now</button><button class="lb-cta" data-p="in">Save my score</button></div>`;
    }
    const el = document.createElement('div'); el.className = 'pz-prompt'; el.innerHTML = html;
    const head = document.querySelector('.wrap > .head'); head.before(el);
    el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => {
      const a = b.dataset.p;
      if (a === 'in') signInDialog({});
      if (a === 'name') signInDialog({start: 'name'});
      if (a === 'later') { save(PROMPT_KEY, Object.assign(p, {until: Date.now() + PROMPT_AGAIN_DAYS * 864e5})); el.remove(); }
      if (a === 'later-legacy') { save(PROMPT_KEY, Object.assign(p, {legacy: dayKey()})); el.remove(); }
    });
  }

  /* ================= Stats sync: your stats and streaks follow you to any device ================= */
  /* Each game keeps its stats in this browser. When you're signed in, the homepage backs them up to
     your account and merges them with what's there, so a new phone picks up where you left off. */
  const SYNC_OWNER = 'puzzl-sync-owner', SYNC_AT = 'puzzl-sync-at';
  // lifetime stats for each game: games played, streaks, bests
  const STAT_KEYS = ['dtl-stats-v2', 'geoclue-stats', 'pecking-stats', 'tethered-stats', 'codebreaker-stats', 'quidsin-stats', 'porkies-stats'];
  // today's game, in progress or finished (each one knows its .day)
  const DAY_KEYS = ['dtl-state-v4', 'pecking-state', 'tethered-state', 'codebreaker-state', 'quidsin-state', 'porkies-state'];
  // "seen how to play" flags: seen once, seen everywhere
  const FLAG_KEYS = ['dtl-seen-help', 'geoclue-seen', 'pecking-seen', 'tethered-v2-seen', 'codebreaker-seen', 'codebreaker-coached', 'quidsin-seen', 'porkies-seen'];
  const HUB_KEY = 'puzzl-hub';   // the homepage's own "full house" record
  const geoKeys = () => { const g = GAMES.find(x => x.id === 'geo'); if (!g) return []; const d = dayNumber(g.launch); return ['geoclue-v2-' + d, 'geoclue-v2-' + (d - 1)]; };
  const syncKeys = () => [...STAT_KEYS, ...DAY_KEYS, ...FLAG_KEYS, HUB_KEY, ...geoKeys()];
  const raw = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const obj = s => { try { const v = s ? JSON.parse(s) : null; return v && typeof v === 'object' ? v : null; } catch (e) { return null; } };
  const num = v => +v || 0;
  const lastOf = s => Math.max(num(s.lastDay), num(s.lastPlayed));
  const finished = s => !!s && (['won', 'lost', 'boom', 'done'].includes(s.status) || s.stage === 'done');

  /* Two copies of a game's lifetime stats: keep the one with more games played,
     then add on any days the other device has played since. */
  function mergeStats(rl, rc) {
    const a = obj(rl), b = obj(rc);
    if (!a) return rc; if (!b) return rl;
    const aFirst = num(a.played) > num(b.played) || (num(a.played) === num(b.played) && lastOf(a) >= lastOf(b));
    const base = aFirst ? a : b, other = aFirst ? b : a, gap = lastOf(other) - lastOf(base);
    if (gap <= 0) return aFirst ? rl : rc;
    const m = Object.assign({}, base);
    m.played = num(base.played) + Math.max(1, Math.min(gap, num(other.streak) || 1));
    for (const f of ['lastDay', 'lastPlayed', 'lastWon', 'lastWin']) if (f in other || f in base) m[f] = Math.max(num(base[f]), num(other[f]));
    m.streak = num(other.streak) >= gap ? Math.max(num(other.streak), num(base.streak) + gap) : num(other.streak);
    if ('best' in m || 'best' in other) m.best = Math.max(num(base.best), num(other.best), m.streak);
    if ('max' in m || 'max' in other) m.max = Math.max(num(base.max), num(other.max), m.streak);
    if ('top' in m || 'top' in other) m.top = Math.max(num(base.top), num(other.top));
    return JSON.stringify(m);
  }
  /* Two copies of a game in progress: the later day wins; on the same day, a finished game beats an unfinished one */
  function mergeDay(rl, rc) {
    const l = obj(rl), c = obj(rc);
    if (!c) return rl; if (!l) return rc;
    if (num(l.day) !== num(c.day)) return num(l.day) > num(c.day) ? rl : rc;
    return finished(c) && !finished(l) ? rc : rl;
  }
  function mergeHub(rl, rc) {
    const l = obj(rl), c = obj(rc);
    if (!c) return rl; if (!l) return rc;
    if (num(l.full) !== num(c.full)) return num(l.full) > num(c.full) ? rl : rc;
    return String(l.last || '') >= String(c.last || '') ? rl : rc;
  }

  let syncJob = null, lastSync = 0;
  function syncStats(force) {
    if (!hasName()) return Promise.resolve(false);
    if (syncJob) return syncJob;
    if (!force && Date.now() - lastSync < 30e3) return Promise.resolve(false);
    lastSync = Date.now();
    syncJob = doSync().catch(() => false).finally(() => { syncJob = null; });
    return syncJob;
  }
  async function doSync() {
    const me = account.id;
    const cloud = (await rpc('puzzl_save_get', {}, true)) || {};
    const owner = load(SYNC_OWNER, null);
    const takeover = !!owner && owner !== me;   // a different account used this device last: show this account's stats instead
    const keys = syncKeys(), merged = {};
    for (const k of keys) {
      const l = raw(k), c = typeof cloud[k] === 'string' ? cloud[k] : null;
      const v = takeover ? c
        : STAT_KEYS.includes(k) ? mergeStats(l, c)
        : k === HUB_KEY ? mergeHub(l, c)
        : FLAG_KEYS.includes(k) ? (l || c)
        : mergeDay(l, c);
      if (v != null) merged[k] = v;
    }
    let changed = false;
    for (const k of keys) {
      const v = k in merged ? merged[k] : null;
      if (v !== raw(k)) { try { v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v); changed = true; } catch (e) {} }
    }
    save(SYNC_OWNER, me);
    const same = Object.keys(cloud).length === Object.keys(merged).length && Object.keys(merged).every(k => cloud[k] === merged[k]);
    if (!same) await rpc('puzzl_save_put', {p_data: merged}, true);
    save(SYNC_AT, Date.now());
    if (changed) { try { window.dispatchEvent(new StorageEvent('storage')); } catch (e) {} }   // homepage cards, Stats and Porkies redraw
    paintStatsNote();
    return changed;
  }
  function syncLabel() {
    const t = load(SYNC_AT, 0);
    if (!t) return 'Not yet';
    const m = Math.round((Date.now() - t) / 60e3);
    return m < 1 ? 'Just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : `${Math.round(m / 1440)} days ago`;
  }
  /* The Stats view says where stats live: on this device, or backed up to your account */
  function paintStatsNote() {
    document.querySelectorAll('.stats-note').forEach(n => {
      const want = hasName() ? 'Backed up to your account, so your stats follow you to any device.' : 'Stats are saved on this device and browser. Sign in to back them up.';
      if (n.textContent !== want) n.textContent = want;
    });
  }
  const statsSec = document.getElementById('stats');
  if (statsSec) new MutationObserver(paintStatsNote).observe(statsSec, {childList: true, subtree: true});

  /* ================= Keeping everything in step ================= */
  function afterAccountChange() {
    paintAcct(); paintPrompt(); paintStatsNote();
    if (hasName()) syncStats(true).then(() => sendResults()).then(() => { if (isOpen()) refresh(true); });
    else if (isOpen()) refresh(true);
  }

  /* ================= Invite links: ?join=CODE ================= */
  async function handleJoin(code) {
    if (hasName()) {
      try {
        const g = await rpc('puzzl_join_group', {p_code: code}, true);
        await loadAccount(); afterAccountChange(); openBoard(g.code);
      } catch (e) { alert(e.message); }
      return;
    }
    if (!signedIn() && legacy && legacy.code === code) { openBoard(code); return; }
    save(JOIN_KEY, {code, at: Date.now()});
    let gname = '';
    try { gname = (await rpc('puzzl_board', {p_code: code, p_since: dayKey()})).group || ''; } catch (e) { alert(e.message); save(JOIN_KEY, null); return; }
    signedIn() ? signInDialog({start: 'name', joinName: gname}) : signInDialog({joinName: gname});
  }

  /* ================= Start ================= */
  paintBtn(); paintAcct();
  const params = new URLSearchParams(location.search), joinCode = params.get('join');
  if (joinCode) history.replaceState(null, '', location.pathname + location.hash);   // tidy the address bar
  showView();
  paintPrompt();
  (async () => {
    if (signedIn()) { try { await loadAccount(); } catch (e) { if (/Not signed in/.test(e.message)) forget(); } paintAcct(); paintPrompt(); }
    paintStatsNote();
    if (hasName()) await syncStats(true);
    if (joinCode) { handleJoin(joinCode); return; }
    // came back mid sign-in (e.g. after checking email on a phone): carry on at the code step
    const pend = load(SIGNIN_KEY, null);
    if (!signedIn() && pend && Date.now() - pend.at < 15 * 60e3) signInDialog({start: 'code', email: pend.email, joinName: pend.joinName || ''});
    sendResults();
  })();
  // send again when coming back from a game, and keep the board fresh while it's open
  const again = () => { paintPrompt(); syncStats().then(() => isOpen() ? refresh() : sendResults()); };
  window.addEventListener('pageshow', e => { if (e.persisted) again(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) again(); });
  setInterval(() => { if (isOpen() && !document.hidden) refresh(); }, 60000);
})();
