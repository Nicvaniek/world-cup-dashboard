/* WC26 Bracket Lab — engine. Builds all state from the match feed. */
(function () {
  'use strict';

  /* ---------- bracket topology (official FIFA schedule) ---------- */
  const FEEDERS = {
    89: [74, 77], 90: [73, 75], 91: [76, 78], 92: [79, 80],
    93: [83, 84], 94: [81, 82], 95: [86, 88], 96: [85, 87],
    97: [89, 90], 98: [93, 94], 99: [91, 92], 100: [95, 96],
    101: [97, 98], 102: [99, 100], 104: [101, 102],
  };
  const ROUND_OF = n => n <= 72 ? 'G' : n <= 88 ? 'R32' : n <= 96 ? 'R16' : n <= 100 ? 'QF' : n <= 102 ? 'SF' : n === 103 ? 'B' : 'F';
  const ROUND_NAMES = { R32: 'Round of 32', R16: 'Round of 16', QF: 'Quarter-final', SF: 'Semi-final', B: 'Third place', F: 'World Cup Final' };
  // left half feeds SF1 (M101); right half feeds SF2 (M102)
  const SIDE_ORD = {
    74: ['L', 0], 77: ['L', 1], 73: ['L', 2], 75: ['L', 3], 83: ['L', 4], 84: ['L', 5], 81: ['L', 6], 82: ['L', 7],
    76: ['R', 0], 78: ['R', 1], 79: ['R', 2], 80: ['R', 3], 86: ['R', 4], 88: ['R', 5], 85: ['R', 6], 87: ['R', 7],
    89: ['L', 0], 90: ['L', 1], 93: ['L', 2], 94: ['L', 3], 91: ['R', 0], 92: ['R', 1], 95: ['R', 2], 96: ['R', 3],
    97: ['L', 0], 98: ['L', 1], 99: ['R', 0], 100: ['R', 1],
    101: ['L', 0], 102: ['R', 0], 103: ['C', 1], 104: ['C', 0],
  };
  const MEX_VENUES = /Mexico City|Guadalajara|Monterrey/;
  const CAN_VENUES = /Toronto|Vancouver/;
  function venueCountry(loc) { return MEX_VENUES.test(loc) ? 'MEX' : CAN_VENUES.test(loc) ? 'CAN' : 'USA'; }
  function cityName(loc) {
    return loc.replace(' Stadium', '').replace('BC Place Vancouver', 'Vancouver')
      .replace('New York/New Jersey', 'New York NJ').replace('San Francisco Bay Area', 'SF Bay Area');
  }
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(utc) {
    const d = new Date(utc.replace(' ', 'T'));
    return MONTHS[d.getMonth()] + ' ' + d.getDate();
  }
  function fmtTime(utc) {
    const d = new Date(utc.replace(' ', 'T'));
    let h = d.getHours(), m = d.getMinutes();
    const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12;
    return h + (m ? ':' + String(m).padStart(2, '0') : '') + ap + ' your time';
  }

  /* ---------- state built from feed ---------- */
  let S = null;           // { teams, matches, byNum }
  let feedData = SNAPSHOT; // embedded snapshot; replaced by live fetches
  let lastSync = null;

  function buildState(feed) {
    const teams = {};
    Object.keys(TEAM_META).forEach(n => {
      teams[n] = Object.assign({ name: n, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, alive: false, inKO: false, tourGames: [] }, TEAM_META[n]);
    });
    const t = n => teams[n];
    const sorted = feed.slice().sort((a, b) => a.MatchNumber - b.MatchNumber);
    const byNum = {};
    const matches = [];
    sorted.forEach(m => {
      byNum[m.MatchNumber] = m;
      if (m.Winner === 'Draw') m.Winner = null;
      const played = m.HomeTeamScore != null && m.AwayTeamScore != null;
      const round = ROUND_OF(m.MatchNumber);
      if (played) {
        const H = t(m.HomeTeam), A = t(m.AwayTeam);
        if (H && A) {
          H.mp++; A.mp++;
          H.gf += m.HomeTeamScore; H.ga += m.AwayTeamScore;
          A.gf += m.AwayTeamScore; A.ga += m.HomeTeamScore;
          let hr, ar;
          if (m.HomeTeamScore > m.AwayTeamScore) { H.w++; A.l++; hr = 'W'; ar = 'L'; }
          else if (m.HomeTeamScore < m.AwayTeamScore) { H.l++; A.w++; hr = 'L'; ar = 'W'; }
          else { H.d++; A.d++; hr = 'D'; ar = 'D'; }
          const pens = hr === 'D' && m.Winner ? ' · ' + (m.Winner === m.HomeTeam ? 'won' : 'lost') + ' on pens' : '';
          const pensA = ar === 'D' && m.Winner ? ' · ' + (m.Winner === m.AwayTeam ? 'won' : 'lost') + ' on pens' : '';
          const comp = round === 'G' ? 'Group' : ROUND_NAMES[round].replace('Round of 32', 'R32').replace('Quarter-final', 'QF');
          H.tourGames.unshift({ o: m.AwayTeam, flag: A.flag, comp: comp, score: m.HomeTeamScore + '–' + m.AwayTeamScore + pens, r: hr, num: m.MatchNumber });
          A.tourGames.unshift({ o: m.HomeTeam, flag: H.flag, comp: comp, score: m.AwayTeamScore + '–' + m.HomeTeamScore + pensA, r: ar, num: m.MatchNumber });
        }
      }
      if (m.MatchNumber >= 73) {
        const winner = played ? (m.Winner && m.Winner.length ? m.Winner
          : (m.HomeTeamScore > m.AwayTeamScore ? m.HomeTeam : m.AwayTeamScore > m.HomeTeamScore ? m.AwayTeam : null)) : null;
        const so = SIDE_ORD[m.MatchNumber] || ['C', 0];
        matches.push({
          num: m.MatchNumber, round: round,
          home: m.HomeTeam !== 'To be announced' ? m.HomeTeam : null,
          away: m.AwayTeam !== 'To be announced' ? m.AwayTeam : null,
          hs: m.HomeTeamScore, as: m.AwayTeamScore,
          played: played, winner: winner,
          pens: played && m.HomeTeamScore === m.AwayTeamScore && m.Winner ? m.Winner + ' win on penalties' : null,
          date: fmtDate(m.DateUtc), time: fmtTime(m.DateUtc),
          venue: m.Location, city: cityName(m.Location), country: venueCountry(m.Location),
          side: so[0], ord: so[1],
          feeders: FEEDERS[m.MatchNumber] || null,
        });
      }
    });
    // knockout participation + alive
    matches.forEach(km => { if (km.home) t(km.home).inKO = true; if (km.away) t(km.away).inKO = true; });
    Object.values(teams).forEach(x => { x.alive = false; });
    matches.forEach(km => {
      [km.home, km.away].forEach(name => {
        if (!name) return;
        if (!km.played) t(name).alive = true;               // scheduled to play
      });
      if (km.played && km.winner && km.round !== 'F' && km.round !== 'B') {
        // winner alive unless already eliminated in a later played match
        const w = t(km.winner);
        const laterLoss = matches.some(o => o.played && o.num > km.num && (o.home === km.winner || o.away === km.winner) && o.winner !== km.winner);
        const laterGame = matches.some(o => !o.played && (o.home === km.winner || o.away === km.winner));
        if (!laterLoss || laterGame) w.alive = true;
        if (laterLoss && !laterGame) w.alive = false;
      }
    });
    // last5 = tournament games (newest first) + pre-tournament filler
    Object.values(teams).forEach(x => {
      const pre = (x.pre || []).slice();
      x.last5 = x.tourGames.slice(0, 5);
      while (x.last5.length < 5 && pre.length) x.last5.push(pre.shift());
    });
    const feedsOf = {};
    Object.keys(FEEDERS).forEach(k => FEEDERS[k].forEach(f => feedsOf[f] = +k));
    matches.forEach(km => { km.feeds = feedsOf[km.num] || null; });
    return { teams: teams, matches: matches, byNum: matches.reduce((o, m) => (o[m.num] = m, o), {}) };
  }

  /* ---------- picks ---------- */
  const LS_KEY = 'wc26-picks-v2';
  let picks = {};
  try { picks = JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { picks = {}; }
  function savePicks() { try { localStorage.setItem(LS_KEY, JSON.stringify(picks)); } catch (e) {} }
  function pickKey(m, h, a) { return m.num + ':' + h + ':' + a; }

  /* ---------- resolution: actual result > user pick ---------- */
  function advancer(m) {
    if (m.played && m.winner) return { name: m.winner, real: true };
    const h = resolveSlot(m, 0), a = resolveSlot(m, 1);
    if (!h.name || !a.name) return { name: null };
    const p = picks[pickKey(m, h.name, a.name)];
    if (!p) return { name: null };
    const adv = p.result === 'H' ? h.name : p.result === 'A' ? a.name : p.adv === 'H' ? h.name : p.adv === 'A' ? a.name : null;
    return { name: adv, real: false };
  }
  function resolveSlot(m, i) {
    const fixed = i === 0 ? m.home : m.away;
    if (fixed) return { name: fixed, real: true };
    if (m.round === 'B') { // bronze: losers of semis
      const sf = S.byNum[i === 0 ? 101 : 102];
      if (sf && sf.played && sf.winner) {
        const loser = sf.winner === sf.home ? sf.away : sf.home;
        return { name: loser, real: true };
      }
      // predicted loser
      if (sf) {
        const h = resolveSlot(sf, 0), a = resolveSlot(sf, 1);
        const adv = advancer(sf);
        if (h.name && a.name && adv.name) return { name: adv.name === h.name ? a.name : h.name, real: false };
      }
      return { name: null };
    }
    if (!m.feeders) return { name: null };
    const src = S.byNum[m.feeders[i]];
    return src ? advancer(src) : { name: null };
  }
  function slots(m) { return { h: resolveSlot(m, 0), a: resolveSlot(m, 1) }; }

  /* ---------- probability model ----------
     World Football Elo base; hosts get a venue boost on home soil;
     draw likelihood is a bell curve over the Elo gap calibrated to
     ~28% for even knockout ties at 90 minutes. */
  function probs(m, hn, an) {
    const th = S.teams[hn], ta = S.teams[an];
    if (!th || !ta || !th.elo || !ta.elo) return null;
    let rh = th.elo, ra = ta.elo;
    let boost = null;
    if (th.host === m.country) { rh += 62; boost = hn; }
    if (ta.host === m.country) { ra += 62; boost = an; }
    const dr = rh - ra;
    const e = 1 / (1 + Math.pow(10, -dr / 400));
    let pd = 0.285 * Math.exp(-Math.pow(dr / 620, 2));
    let ph = Math.max(0.02, e - pd / 2);
    let pa = Math.max(0.02, 1 - pd - ph);
    const s = ph + pd + pa; ph /= s; pd /= s; pa /= s;
    return { h: ph, d: pd, a: pa, dr: Math.round(dr), hostBoost: boost };
  }
  function pct(x) { return Math.round(x * 100) + '%'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function darken(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgb(' + [16, 8, 0].map(sh => Math.round(((n >> sh) & 255) * f)).join(',') + ')';
  }

  /* ---------- bracket render ---------- */
  function colMatches(round, side) {
    return S.matches.filter(m => m.round === round && m.side === side).sort((a, b) => a.ord - b.ord);
  }
  function teamRowHTML(m, slot, pair) {
    if (!slot.name) {
      let label = 'Winner TBD';
      const SHORT = { R32: 'R32', R16: 'R16', QF: 'QF', SF: 'SF' };
      if (m.round === 'B') label = 'SF loser';
      else if (m.feeders) {
        const src = S.byNum[m.feeders[slot === pair.h ? 0 : 1]];
        if (src) label = src.home && src.away ? 'Winner ' + shortPair(src) : (SHORT[src.round] || '') + ' winner · ' + src.city.split(' ')[0];
      }
      return '<div class="mc-team tbd"><span class="flg" style="opacity:.3;filter:grayscale(1)">⚽</span><span class="nm">' + esc(label) + '</span></div>';
    }
    const t = S.teams[slot.name];
    let cls = 'mc-team', score = '';
    if (m.played) {
      const isHome = m.home === slot.name;
      cls += m.winner === slot.name ? ' winner' : ' loser';
      score = '<span class="sc">' + (isHome ? m.hs : m.as) + '</span>';
    } else if (pair.h.name && pair.a.name) {
      const p = picks[pickKey(m, pair.h.name, pair.a.name)];
      if (p) {
        const adv = p.result === 'H' ? pair.h.name : p.result === 'A' ? pair.a.name : p.adv === 'H' ? pair.h.name : p.adv === 'A' ? pair.a.name : null;
        if (adv) cls += adv === slot.name ? (' winner' + (p.result === 'D' ? ' pick-adv' : '')) : ' loser';
      }
    }
    return '<div class="' + cls + '"><span class="flg">' + t.flag + '</span><span class="nm">' + esc(t.name) + '</span>' + score + '</div>';
  }
  function shortPair(m) {
    const c = n => (S.teams[n] && S.teams[n].code) || n.slice(0, 3).toUpperCase();
    return c(m.home) + '–' + c(m.away);
  }
  function cardHTML(m) {
    const pair = slots(m);
    let cls = 'match-card' + (m.played ? ' played' : '');
    let tag = '', prob = '';
    if (!m.played && pair.h.name && pair.a.name) {
      const p = picks[pickKey(m, pair.h.name, pair.a.name)];
      if (p) {
        cls += ' predicted';
        if (p.result === 'D') {
          const advN = p.adv === 'H' ? pair.h.name : p.adv === 'A' ? pair.a.name : null;
          tag = '<span class="mc-pick-tag draw-tag">Draw' + (advN ? ' · ' + esc(S.teams[advN].code) + ' ✦' : '') + '</span>';
        } else {
          tag = '<span class="mc-pick-tag">Pick: ' + esc(S.teams[p.result === 'H' ? pair.h.name : pair.a.name].code) + '</span>';
        }
      }
      const pr = probs(m, pair.h.name, pair.a.name);
      if (pr) {
        prob = '<div class="mc-prob" style="--prob-h:' + S.teams[pair.h.name].c1 + ';--prob-a:' + S.teams[pair.a.name].c1 + '">' +
          '<i class="p-h" style="width:' + (pr.h * 100) + '%"></i><i class="p-d" style="width:' + (pr.d * 100) + '%"></i>' +
          '<i class="p-a" style="width:' + (pr.a * 100) + '%"></i></div>';
      }
    }
    const note = m.pens ? '<div class="mc-meta" style="margin:4px 0 0"><span>' + esc(m.pens) + '</span></div>' : '';
    return '<button class="' + cls + '" data-num="' + m.num + '">' + tag +
      '<div class="mc-meta"><span>' + esc(m.date) + '</span><span>' + esc(m.city) + '</span></div>' +
      teamRowHTML(m, pair.h, pair) + teamRowHTML(m, pair.a, pair) + prob + note + '</button>';
  }
  function championName() {
    const f = S.byNum[104];
    return f ? advancer(f).name : null;
  }
  function renderBracket() {
    const cols = [
      { title: 'Round of 32', ms: colMatches('R32', 'L') },
      { title: 'Round of 16', ms: colMatches('R16', 'L') },
      { title: 'Quarter-finals', ms: colMatches('QF', 'L') },
      { title: 'Semi-final · Jul 14', ms: colMatches('SF', 'L') },
      { title: 'Final · Jul 19', ms: [S.byNum[104], S.byNum[103]].filter(Boolean), final: true },
      { title: 'Semi-final · Jul 15', ms: colMatches('SF', 'R') },
      { title: 'Quarter-finals', ms: colMatches('QF', 'R') },
      { title: 'Round of 16', ms: colMatches('R16', 'R') },
      { title: 'Round of 32', ms: colMatches('R32', 'R') },
    ];
    const host = document.getElementById('bracket');
    host.innerHTML = cols.map(col => {
      let inner = '<div class="round-title">' + esc(col.title) + '</div>';
      if (col.final) {
        const ch = championName();
        const champ = ch
          ? '<div class="champ-slot filled"><span class="trophy">🏆</span><span class="cl">' + (S.byNum[104].played ? 'World champions' : 'Your champion') + '</span><div class="cn">' + S.teams[ch].flag + ' ' + esc(ch) + '</div></div>'
          : '<div class="champ-slot"><span class="trophy">🏆</span><span class="cl">Champion</span><div class="cn" style="color:var(--ink-faint)">—</div></div>';
        inner += '<div class="round-matches" style="flex:0 0 auto;gap:14px">' + cardHTML(col.ms[0]) + champ +
          (col.ms[1] ? '<div class="round-title" style="margin:6px 0 0">Bronze · Jul 18</div>' + cardHTML(col.ms[1]) : '') + '</div>';
      } else {
        inner += '<div class="round-matches">' + col.ms.map(cardHTML).join('') + '</div>';
      }
      return '<div class="round-col' + (col.final ? ' final-col' : '') + '">' + inner + '</div>';
    }).join('');
    host.querySelectorAll('.match-card').forEach(el => {
      el.addEventListener('click', () => openPanel(+el.getAttribute('data-num')));
    });
    renderMeter();
  }

  /* ---------- meter ---------- */
  function renderMeter() {
    const open = S.matches.filter(m => !m.played);
    let done = 0;
    open.forEach(m => {
      const pr = slots(m);
      if (pr.h.name && pr.a.name && picks[pickKey(m, pr.h.name, pr.a.name)]) done++;
    });
    document.getElementById('meter-count').textContent = done + ' / ' + open.length;
    document.getElementById('meter-fill').style.width = (open.length ? (done / open.length) * 100 : 100) + '%';
    const hint = document.getElementById('meter-hint');
    if (open.length && done === open.length) {
      hint.textContent = 'Bracket complete — may your champion lift it. 🏆';
      celebrate();
    } else {
      hint.textContent = 'Pick every remaining match to crown your champion.';
    }
  }

  /* ---------- panel ---------- */
  const overlay = document.getElementById('overlay');
  const panel = document.getElementById('panel');
  let openNum = null;
  function openPanel(num) { openNum = num; renderPanel(); overlay.classList.add('open'); panel.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closePanel() { openNum = null; overlay.classList.remove('open'); panel.classList.remove('open'); document.body.style.overflow = ''; }
  overlay.addEventListener('click', closePanel);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

  function formHTML(name) {
    const t = S.teams[name];
    if (!t || !t.last5.length) return '<div class="form-list"><span style="color:var(--ink-faint);font-size:12.5px">No recent data</span></div>';
    return '<div class="form-list">' + t.last5.map(g =>
      '<div class="form-item"><span class="form-pill ' + g.r + '">' + g.r + '</span>' +
      '<span class="fi-t">' + (g.flag || '') + ' ' + esc(g.o) + ' <span style="color:var(--ink-faint)">· ' + esc(g.comp) + '</span></span>' +
      '<span class="fi-s">' + esc(g.score) + '</span></div>').join('') + '</div>';
  }
  function insightsHTML(m, hn, an, pr) {
    const th = S.teams[hn], ta = S.teams[an];
    const cards = [];
    if (pr) {
      const gap = Math.abs(pr.dr);
      const fav = pr.dr >= 0 ? th : ta;
      if (gap < 45) cards.push('<strong>Coin-flip territory.</strong> Only ' + gap + ' Elo points separate these sides — a 90-minute draw (' + pct(pr.d) + ') is a genuinely live outcome.');
      else if (gap < 115) cards.push('<strong>' + esc(fav.name) + '</strong> are favourites by ' + gap + ' Elo points, but at this gap the underdog still lands the upset roughly one time in three.');
      else cards.push('<strong>' + esc(fav.name) + '</strong> hold a commanding ' + gap + '-point Elo edge — the upset would be a real shock, though knockouts specialise in those.');
      if (pr.hostBoost) cards.push('<strong>Home soil:</strong> ' + esc(pr.hostBoost) + ' play this one in front of a home crowd — worth roughly half a goal in the model.');
    }
    const wins = t => t.last5.filter(g => g.r === 'W').length;
    const hw = wins(th), aw = wins(ta);
    if (hw - aw >= 2) cards.push('<strong>Form check:</strong> ' + esc(th.name) + ' arrive hot — ' + hw + ' wins in their last five against ' + aw + ' for ' + esc(ta.name) + '.');
    else if (aw - hw >= 2) cards.push('<strong>Form check:</strong> ' + esc(ta.name) + ' arrive hot — ' + aw + ' wins in their last five against ' + hw + ' for ' + esc(th.name) + '.');
    const rate = t => t.mp ? t.gf / t.mp : 0, crate = t => t.mp ? t.ga / t.mp : 0;
    const atk = rate(th) >= rate(ta) ? th : ta;
    const dfn = crate(th) <= crate(ta) ? th : ta;
    if (atk === dfn) cards.push('<strong>Styles:</strong> ' + esc(atk.name) + ' have had the better of it at both ends — the sharper attack (' + rate(atk).toFixed(1) + ' goals/game) and the tighter defence (' + crate(dfn).toFixed(1) + ' conceded/game) this tournament.');
    else cards.push('<strong>Styles:</strong> ' + esc(atk.name) + ' carry the sharper attack this tournament (' + rate(atk).toFixed(1) + ' goals/game); ' + esc(dfn.name) + ' have been the tighter defence (' + crate(dfn).toFixed(1) + ' conceded/game).');
    if (th.note) cards.push('<strong>' + esc(th.name) + ':</strong> ' + esc(th.note));
    if (ta.note) cards.push('<strong>' + esc(ta.name) + ':</strong> ' + esc(ta.note));
    return cards.map(c => '<div class="insight-card">' + c + '</div>').join('');
  }
  function probRowHTML(label, v, color) {
    return '<div class="prob-row"><span class="pl">' + esc(label) + '</span>' +
      '<div class="prob-track"><div class="prob-fill" data-w="' + (v * 100) + '%" style="background:' + color + '"></div></div>' +
      '<span class="pv">' + pct(v) + '</span></div>';
  }
  function renderPanel() {
    const m = S.byNum[openNum];
    if (!m) return;
    const pair = slots(m);
    const hn = pair.h.name, an = pair.a.name;
    const th = hn && S.teams[hn], ta = an && S.teams[an];
    const heroBg = th && ta
      ? 'linear-gradient(118deg,' + darken(th.c1, .68) + ' 0%,' + darken(th.c1, .5) + ' 46%,' + darken(ta.c1, .5) + ' 54%,' + darken(ta.c1, .68) + ' 100%)'
      : 'linear-gradient(118deg,#1c2b3a,#2b3b4d)';
    const sideHTML = t => t
      ? '<div class="ph-side"><span class="flg">' + t.flag + '</span><div class="nm">' + esc(t.name) + '</div></div>'
      : '<div class="ph-side"><span class="flg" style="opacity:.4;filter:grayscale(1)">⚽</span><div class="nm" style="opacity:.6">TBD</div></div>';
    const heroMid = m.played ? '<div class="ph-score">' + m.hs + '–' + m.as + '</div>' : '<div class="ph-vs">VS</div>';
    const meta = esc(m.date) + ' · ' + esc(m.time) + ' · ' + esc(m.venue) + (m.pens ? ' · ' + esc(m.pens) : '');

    let body = '';
    if (th && ta && !m.played) {
      const pr = probs(m, hn, an);
      if (pr) {
        body += '<section><p class="pb-label">Win · Draw · Win — 90 minutes</p>' +
          probRowHTML(th.name, pr.h, th.c1) + probRowHTML('Draw / extra time', pr.d, 'var(--draw)') + probRowHTML(ta.name, pr.a, ta.c1) +
          '<p class="model-note">Model: World Football Elo ratings updated through the tournament' +
          (pr.hostBoost ? ', with a host-nation venue boost for ' + esc(pr.hostBoost) : '') +
          '. The draw share is calibrated to 90-minute knockout draw rates (~28% for even ties). A predicted draw means you think it goes to extra time.</p></section>';
      }
      const p = picks[pickKey(m, hn, an)];
      body += '<section><p class="pb-label">Your call</p><div class="pick-grid">' +
        pickBtnHTML('H', th.code + ' win', pr ? pr.h : null, p, false) +
        pickBtnHTML('D', 'Draw', pr ? pr.d : null, p, true) +
        pickBtnHTML('A', ta.code + ' win', pr ? pr.a : null, p, false) + '</div>';
      if (p && p.result === 'D') {
        body += '<div class="adv-picker"><div class="apl">Draw after 90 — who goes through in extra time or penalties?</div><div class="adv-btns">' +
          '<button class="adv-btn' + (p.adv === 'H' ? ' sel' : '') + '" data-adv="H">' + th.flag + ' ' + esc(th.name) + '</button>' +
          '<button class="adv-btn' + (p.adv === 'A' ? ' sel' : '') + '" data-adv="A">' + ta.flag + ' ' + esc(ta.name) + '</button></div></div>';
      }
      if (p) body += '<button class="clear-pick" id="clear-pick">Clear this prediction</button>';
      body += '</section>';
    } else if (m.played) {
      body += '<section><div class="result-note">Full-time: <b>' + esc(m.winner || 'Draw') + '</b>' + (m.winner ? ' advanced' : '') + (m.pens ? ' — ' + esc(m.pens) : '') + '. This one is in the books.</div></section>';
    } else {
      body += '<section><div class="result-note">Teams not set yet — predict the feeder matches and this fixture fills in with your picks.</div></section>';
    }
    if (th && ta) {
      body += '<section><p class="pb-label">Last five matches</p><div class="form-cols">' +
        '<div><div class="form-team-name">' + th.flag + ' ' + esc(th.name) + '</div>' + formHTML(hn) + '</div>' +
        '<div><div class="form-team-name">' + ta.flag + ' ' + esc(ta.name) + '</div>' + formHTML(an) + '</div></div></section>';
      if (!m.played) {
        body += '<section><p class="pb-label">Match insights</p>' + insightsHTML(m, hn, an, probs(m, hn, an)) + '</section>';
      }
    }
    panel.innerHTML =
      '<div class="panel-hero" style="background:' + heroBg + '">' +
      '<button class="panel-close" id="panel-close" aria-label="Close">✕</button>' +
      '<div class="ph-round">' + esc(ROUND_NAMES[m.round] || '') + ' · ' + esc(m.city) + '</div>' +
      '<div class="ph-teams">' + sideHTML(th) + heroMid + sideHTML(ta) + '</div>' +
      '<div class="ph-meta">' + meta + '</div></div>' +
      '<div class="panel-body">' + body + '</div>';
    document.getElementById('panel-close').addEventListener('click', closePanel);
    if (th && ta && !m.played) {
      panel.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => {
        const key = pickKey(m, hn, an);
        const val = b.getAttribute('data-pick');
        const cur = picks[key];
        picks[key] = val === 'D' ? { result: 'D', adv: cur && cur.result === 'D' ? cur.adv : null } : { result: val };
        prune(); savePicks(); renderBracket(); renderPanel();
      }));
      panel.querySelectorAll('[data-adv]').forEach(b => b.addEventListener('click', () => {
        const key = pickKey(m, hn, an);
        if (picks[key]) picks[key].adv = b.getAttribute('data-adv');
        prune(); savePicks(); renderBracket(); renderPanel();
      }));
      const cp = document.getElementById('clear-pick');
      if (cp) cp.addEventListener('click', () => { delete picks[pickKey(m, hn, an)]; prune(); savePicks(); renderBracket(); renderPanel(); });
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panel.querySelectorAll('.prob-fill').forEach(el => { el.style.width = el.getAttribute('data-w'); });
      });
    });
    panel.scrollTop = 0;
  }
  function pickBtnHTML(code, label, p, cur, isDraw) {
    const sel = cur && cur.result === code;
    return '<button class="pick-btn' + (sel ? (isDraw ? ' sel sel-draw' : ' sel') : '') + '" data-pick="' + code + '">' +
      '<div class="pb-top">' + esc(label) + '</div>' + (p != null ? '<div class="pb-sub">' + pct(p) + ' likely</div>' : '') + '</button>';
  }
  /* drop picks whose team pair no longer matches (feeder outcome changed or real result arrived) */
  function prune() {
    Object.keys(picks).forEach(k => {
      const num = +k.split(':')[0];
      const m = S.byNum[num];
      if (!m) return;
      if (m.played) { delete picks[k]; return; }
      const pr = slots(m);
      const parts = k.split(':');
      if ((pr.h.name || '') !== parts[1] || (pr.a.name || '') !== parts[2]) delete picks[k];
    });
  }

  /* ---------- tables ---------- */
  let tblScope = 'alive';
  function renderTables() {
    const all = Object.values(S.teams).filter(t => t.mp > 0);
    const pool = tblScope === 'alive' ? all.filter(t => t.alive) : all;
    const atk = pool.slice().sort((a, b) => b.gf / b.mp - a.gf / a.mp || b.gf - a.gf).slice(0, 12);
    const dfn = pool.slice().sort((a, b) => a.ga / a.mp - b.ga / b.mp || a.ga - b.ga).slice(0, 12);
    const maxA = Math.max.apply(null, atk.map(t => t.gf / t.mp).concat([0.1]));
    const maxD = Math.max.apply(null, dfn.map(t => t.ga / t.mp).concat([0.6]));
    const row = (t, i, kind) => {
      const val = kind === 'atk' ? t.gf / t.mp : t.ga / t.mp;
      const bar = kind === 'atk' ? val / maxA : 1 - (val / maxD) * 0.82;
      return '<tr class="' + (t.alive ? '' : 'out') + '"><td>' + (i + 1) + '</td>' +
        '<td class="tm"><span class="tm-cell"><span class="flg">' + t.flag + '</span><span class="nm">' + esc(t.name) + '</span>' +
        (t.alive ? '' : '<span class="out-tag">out</span>') + '</span></td>' +
        '<td>' + t.mp + '</td><td>' + (kind === 'atk' ? t.gf : t.ga) + '</td>' +
        '<td><span style="font-weight:600">' + val.toFixed(2) + '</span><span class="stat-bar ' + (kind === 'atk' ? '' : 'def') + '" style="width:' + Math.max(4, bar * 44) + 'px"></span></td></tr>';
    };
    document.getElementById('atk-body').innerHTML = atk.map((t, i) => row(t, i, 'atk')).join('');
    document.getElementById('def-body').innerHTML = dfn.map((t, i) => row(t, i, 'def')).join('');
  }
  document.querySelectorAll('[data-scope]').forEach(b => b.addEventListener('click', () => {
    tblScope = b.getAttribute('data-scope');
    document.querySelectorAll('[data-scope]').forEach(x => x.classList.toggle('on', x === b));
    renderTables();
  }));

  /* ---------- live refresh ---------- */
  function applyFeed(feed) {
    feedData = feed;
    S = buildState(feed);
    prune();
    savePicks();
    renderBracket();
    renderTables();
    if (openNum != null) renderPanel();
  }
  function setSyncBadge(ok) {
    const el = document.getElementById('sync-badge');
    if (!el) return;
    if (ok) {
      const d = new Date();
      el.textContent = 'Live · scores synced ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
      el.classList.add('ok');
    } else {
      el.textContent = 'Showing last saved scores';
      el.classList.remove('ok');
    }
  }
  function refresh() {
    fetch('feed.json?v=' + Date.now(), { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(feed => {
        if (Array.isArray(feed) && feed.length) {
          const changed = JSON.stringify(feed) !== JSON.stringify(feedData);
          if (changed) applyFeed(feed);
          setSyncBadge(true);
        }
      })
      .catch(() => setSyncBadge(false));
  }

  /* ---------- confetti ---------- */
  let celebrated = false;
  function celebrate() {
    if (celebrated) return;
    celebrated = true;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cv = document.getElementById('confetti');
    const ctx = cv.getContext('2d');
    cv.width = innerWidth; cv.height = innerHeight;
    const colors = ['#14914F', '#F5B92E', '#E04F4F', '#3D8BFF', '#B76BEB', '#FFFFFF'];
    const ps = [];
    for (let i = 0; i < 170; i++) {
      ps.push({
        x: cv.width * (0.15 + 0.7 * ((i * 37) % 100) / 100), y: -20 - ((i * 53) % 320),
        w: 6 + (i % 5), h: 8 + (i % 7),
        vx: (((i * 17) % 10) - 5) * .4, vy: 2 + ((i * 29) % 10) * .35,
        rot: (i * 47) % 360, vr: (((i * 13) % 10) - 5) * .1,
        c: colors[i % colors.length],
      });
    }
    let frames = 0;
    (function tick() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      ps.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vy += .02;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      if (++frames < 330) requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, cv.width, cv.height);
    })();
  }

  /* ---------- reveal ---------- */
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { threshold: .08 });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
  setTimeout(() => document.querySelectorAll('.reveal').forEach(el => el.classList.add('in')), 900);

  /* ---------- boot ---------- */
  S = buildState(SNAPSHOT);
  prune();
  renderBracket();
  renderTables();
  refresh();
  setInterval(refresh, 3 * 60 * 1000);
  const bs = document.querySelector('.bracket-scroller');
  if (bs) bs.scrollLeft = (bs.scrollWidth - bs.clientWidth) / 2;
  const dl = /^#m(\d+)$/.exec(location.hash);
  if (dl && S.byNum[+dl[1]]) openPanel(+dl[1]);
})();
