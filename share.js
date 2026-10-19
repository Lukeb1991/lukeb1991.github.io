/* Puzzl · share today's results
   Adds a "Share today's Puzzl" button under the progress bar once all six games are finished.
   It opens a preview of a share image plus a short text version, ready to post in one go.
   Add to index.html with one line, AFTER leaderboard.js (it uses the same points table):
     <script src="share.js"></script>
   It uses GAMES, COLOURS, get and dayNumber from the main script. */
(() => {
  const SITE = 'https://playpuzzl.com/';
  const PUZZL_LAUNCH = '2026-10-07';                                   // ← day of Puzzl #1
  const EMOJI = {dub: '🎬', geo: '🧭', peck: '🐔', teth: '🪢', code: '🔐', quid: '💷'};

  /* ---------- Today's results ---------- */
  const POINTS = window.puzzlPoints || {};
  const square = (done, pts) => !done ? '⬛' : pts >= 80 ? '🟩' : pts >= 50 ? '🟨' : pts > 0 ? '🟧' : '🟥';
  function porkies() {
    const d = dayNumber(PUZZL_LAUNCH), st = get('porkies-stats') || {}, s = get('porkies-state');
    if (st.lastDay !== d || !s || s.day !== d) return null;
    const h = s.hints || 0;
    return s.status === 'won' ? (h ? `caught them with ${h} hint${h > 1 ? 's' : ''}` : 'caught them clean') : 'got fooled';
  }
  function today() {
    const rows = GAMES.map(g => {
      const d = dayNumber(g.launch);
      let r = {}; try { r = g.read(d) || {}; } catch (e) {}
      let pts = 0; try { pts = r.done && POINTS[g.id] ? POINTS[g.id](d) : 0; } catch (e) {}
      return {id: g.id, name: g.name, colour: COLOURS[g.id], done: !!r.done, pts, txt: r.done ? (r.result || 'Done') : 'Not played'};
    });
    return {no: dayNumber(PUZZL_LAUNCH), rows, total: rows.reduce((t, r) => t + r.pts, 0), played: rows.filter(r => r.done).length, pork: porkies()};
  }
  function shareText(t) {
    return [
      `Puzzl #${t.no} · ${t.total}/600`,
      t.rows.map(r => square(r.done, r.pts)).join(''),
      t.rows.map(r => EMOJI[r.id] || '•').join(''),
      ...(t.pork ? [`🥧 Porkies: ${t.pork}`] : []),
      SITE,
    ].join('\n');
  }

  /* ---------- Share image (1080 × 1080) ---------- */
  async function shareImage(t) {
    try { await document.fonts.ready; } catch (e) {}
    const S = 1080, c = document.createElement('canvas'); c.width = c.height = S;
    const x = c.getContext('2d');
    const serif = "'DM Serif Display', Georgia, serif", sans = "'DM Sans', system-ui, sans-serif", mono = "'DM Mono', ui-monospace, monospace";
    const rr = (px, py, w, h, r) => { x.beginPath(); x.moveTo(px + r, py); x.arcTo(px + w, py, px + w, py + h, r); x.arcTo(px + w, py + h, px, py + h, r); x.arcTo(px, py + h, px, py, r); x.arcTo(px, py, px + w, py, r); x.closePath(); };
    const fit = (txt, max) => { let s = txt; while (x.measureText(s).width > max && s.length > 2) s = s.slice(0, -2) + '…'; return s; };
    // background + glows
    x.fillStyle = '#0b0f22'; x.fillRect(0, 0, S, S);
    let g = x.createRadialGradient(140, 60, 0, 140, 60, 760); g.addColorStop(0, 'rgba(168,85,247,.45)'); g.addColorStop(1, 'rgba(168,85,247,0)'); x.fillStyle = g; x.fillRect(0, 0, S, S);
    g = x.createRadialGradient(1020, 1060, 0, 1020, 1060, 700); g.addColorStop(0, 'rgba(236,72,153,.32)'); g.addColorStop(1, 'rgba(236,72,153,0)'); x.fillStyle = g; x.fillRect(0, 0, S, S);
    const grad = (x0, x1) => { const q = x.createLinearGradient(x0, 0, x1, 0); q.addColorStop(0, '#a855f7'); q.addColorStop(1, '#ec4899'); return q; };
    // header: wordmark + number/date
    x.textBaseline = 'alphabetic';
    x.font = `400 112px ${serif}`; x.fillStyle = grad(72, 400); x.fillText('Puzzl', 72, 170);
    const [ly, lm, ld] = PUZZL_LAUNCH.split('-').map(Number);   // the puzzle's own date, so it always matches the #number
    const date = new Date(Date.UTC(ly, lm - 1, ld + t.no - 1, 12)).toLocaleDateString('en-GB', {weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC'});
    x.textAlign = 'right'; x.font = `500 30px ${mono}`; x.fillStyle = '#c7d2ff'; x.fillText(`#${t.no}`, S - 72, 112);
    x.font = `500 24px ${mono}`; x.fillStyle = '#939fca'; x.fillText(date.toUpperCase(), S - 72, 156);
    // total
    x.textAlign = 'left';
    x.font = `400 150px ${serif}`; x.fillStyle = '#ffffff'; const tw = x.measureText(String(t.total)).width; x.fillText(String(t.total), 72, 340);
    x.font = `400 54px ${serif}`; x.fillStyle = '#939fca'; x.fillText('/600', 72 + tw + 14, 340);
    x.font = `500 24px ${mono}`; x.fillStyle = '#939fca'; x.fillText(`PUZZL POINTS · ${t.played} OF 6 PLAYED`, 76, 392);
    // six tiles
    const cols = 3, gap = 24, tW = (S - 144 - gap * 2) / cols, tH = 236, top = 440;
    t.rows.forEach((r, i) => {
      const px = 72 + (i % cols) * (tW + gap), py = top + Math.floor(i / cols) * (tH + gap);
      rr(px, py, tW, tH, 26); x.fillStyle = '#151b38'; x.fill();
      x.lineWidth = 2; x.strokeStyle = r.done ? r.colour + '88' : 'rgba(150,165,230,.18)'; x.stroke();
      // colour strip
      x.save(); rr(px, py, tW, tH, 26); x.clip(); x.fillStyle = r.done ? r.colour : 'rgba(150,165,230,.18)'; x.fillRect(px, py, tW, 10); x.restore();
      x.font = `400 36px ${serif}`; x.fillStyle = '#ffffff'; x.fillText(fit(r.name, tW - 48), px + 24, py + 70);
      x.font = `500 22px ${mono}`; x.fillStyle = r.done ? (r.pts ? '#c7d2ff' : '#ff5d73') : '#939fca'; x.fillText(fit(r.txt, tW - 48), px + 24, py + 112);
      // points meter
      const mw = tW - 48, my = py + tH - 70;
      rr(px + 24, my, mw, 14, 7); x.fillStyle = 'rgba(150,165,230,.14)'; x.fill();
      if (r.done && r.pts) { rr(px + 24, my, Math.max(14, mw * r.pts / 100), 14, 7); x.fillStyle = r.colour; x.fill(); }
      x.font = `500 24px ${mono}`; x.fillStyle = r.done ? '#ffffff' : '#939fca'; x.fillText(r.done ? `${r.pts} pts` : '—', px + 24, py + tH - 22);
    });
    // footer
    x.font = `500 26px ${mono}`; x.fillStyle = '#939fca';
    x.fillText(t.pork ? `+ Porkies: ${t.pork}` : 'Six daily puzzles · new every morning at 7', 72, S - 62);
    x.textAlign = 'right'; x.fillStyle = '#c7d2ff'; x.fillText(SITE.replace(/^https:\/\//, '').replace(/\/$/, ''), S - 72, S - 62);
    return new Promise(res => c.toBlob(b => res(b), 'image/png'));
  }

  /* ---------- Styles ---------- */
  document.head.insertAdjacentHTML('beforeend', `<style>
  .pz-share{display:none;align-items:center;gap:8px;margin-top:16px;height:40px;padding:0 18px 0 14px;border-radius:99px;cursor:pointer;
    font:600 14px var(--sans);color:var(--text);background:var(--panel);border:1px solid var(--line2);transition:background .15s,border-color .15s,transform .15s}
  .pz-share.on{display:inline-flex}
  .pz-share.all{background:var(--grad);border-color:transparent;color:#fff}
  .pz-share:hover{transform:translateY(-1px);border-color:rgba(168,85,247,.6)}
  .pz-share:focus-visible{outline:2px solid var(--purple);outline-offset:2px}
  .pz-share svg{width:16px;height:16px;flex:none}
  dialog.pz-sharebox{margin:auto;max-width:440px;width:calc(100% - 32px);max-height:calc(100% - 32px);border:1px solid var(--line2);border-radius:20px;background:var(--panel);color:var(--text);padding:18px}
  dialog.pz-sharebox::backdrop{background:rgba(5,7,18,.75)}
  .pz-sharebox h3{font:400 24px var(--serif);display:flex;justify-content:space-between;align-items:center;gap:10px}
  .pz-sharebox .pz-close{width:34px;height:34px;border-radius:50%;border:1px solid var(--line2);background:transparent;color:var(--muted);font:400 20px/1 var(--sans);cursor:pointer}
  .pz-sharebox img{display:block;width:100%;aspect-ratio:1;border-radius:14px;margin-top:12px;background:var(--ink)}
  .pz-sharebox pre{margin-top:12px;padding:12px 14px;border-radius:12px;background:var(--ink);border:1px solid var(--line);font:400 14px/1.5 var(--mono);color:var(--ice);white-space:pre-wrap;word-break:break-word}
  .pz-sharebox .pz-acts{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
  .pz-sharebox .pz-acts button{flex:1 1 auto;height:44px;padding:0 14px;border-radius:99px;cursor:pointer;font:600 14px var(--sans);border:1px solid var(--line2);background:transparent;color:var(--text)}
  .pz-sharebox .pz-acts .pz-main{background:var(--grad);border-color:transparent;color:#fff;flex-basis:100%}
  .pz-sharebox .pz-acts button:disabled{opacity:.6}
  </style>`);

  /* ---------- Button under the progress bar ---------- */
  const ICON = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10V2M5 4.8 8 2l3 2.8"/><path d="M4 7H3v7h10V7h-1"/></svg>';
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'pz-share';
  document.querySelector('.progress').append(btn);
  function paintBtn() {
    const t = today();
    const full = t.played === GAMES.length;     // only once the day's done: a reward, not clutter
    btn.classList.toggle('on', full);
    btn.classList.add('all');
    btn.innerHTML = `${ICON}<span>Share today's Puzzl</span>`;
  }
  paintBtn();
  setInterval(paintBtn, 4000);
  window.addEventListener('pageshow', paintBtn);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) paintBtn(); });

  /* ---------- Preview + share ---------- */
  btn.addEventListener('click', async () => {
    const t = today(), text = shareText(t);
    const dlg = document.createElement('dialog'); dlg.className = 'pz-sharebox';
    dlg.innerHTML = `<h3>Share today's Puzzl<button class="pz-close" type="button" aria-label="Close">×</button></h3>
      <img alt="Your Puzzl results image">
      <pre></pre>
      <div class="pz-acts">
        <button type="button" class="pz-main" data-a="share">Share</button>
        <button type="button" data-a="copy">Copy text</button>
        <button type="button" data-a="save">Save image</button>
      </div>`;
    dlg.querySelector('pre').textContent = text;
    document.body.append(dlg); dlg.showModal();
    dlg.querySelector('.pz-close').onclick = () => dlg.close();
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => { if (url) URL.revokeObjectURL(url); dlg.remove(); });

    let blob = null, url = '';
    try { blob = await shareImage(t); url = URL.createObjectURL(blob); dlg.querySelector('img').src = url; } catch (e) {}
    const file = blob ? new File([blob], `puzzl-${t.no}.png`, {type: 'image/png'}) : null;
    const canShareFile = !!(file && navigator.canShare && navigator.canShare({files: [file]}));
    const shareBtn = dlg.querySelector('[data-a="share"]');
    if (!navigator.share) {                                       // desktop browsers without a share sheet
      shareBtn.textContent = 'Copy text';
      dlg.querySelector('[data-a="copy"]').remove();
    }

    const flash = (b, msg) => { const o = b.textContent; b.textContent = msg; setTimeout(() => { b.textContent = o; }, 1800); };
    const copy = async b => { try { await navigator.clipboard.writeText(text); flash(b, 'Copied!'); } catch (e) { prompt('Copy your results:', text); } };
    dlg.querySelector('.pz-acts').addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      const a = b.dataset.a;
      if (a === 'copy' || (a === 'share' && !navigator.share)) return copy(b);
      if (a === 'save') {
        if (!url) return;
        const l = document.createElement('a'); l.href = url; l.download = `puzzl-${t.no}.png`; document.body.append(l); l.click(); l.remove();
        return;
      }
      if (a === 'share') {
        try {
          if (canShareFile) await navigator.share({files: [file], text});
          else await navigator.share({text});
        } catch (err) { if (err && err.name !== 'AbortError') copy(b); }
      }
    });
  });
})();
