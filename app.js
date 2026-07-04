/* WC26 Bracket Lab — live tournament dashboard.
   Read-only: current bracket state, win/draw/loss odds, form and insights.
   Scores refresh straight from ESPN's public scoreboard in the browser. */
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
    let h = d.getHours(); const m = d.getMinutes();
    const ap = h >= 12 ? 'pm' : 'am'; h = h % 12 || 12;
    return h + (m ? ':' + String(m).padStart(2, '0') : '') + ap + ' your time';
  }

  /* ---------- live scores straight from ESPN (CORS-open) ---------- */
  const ESPN_URL = 'https://site.api.espn.com/apis/site/v2/sports/soccer/fifa.world/scoreboard?dates=20260611-20260719&limit=200';
  const ESPN_NAMES = {
    'United States': 'USA', 'Ivory Coast': "Côte d'Ivoire", 'Cape Verde Islands': 'Cabo Verde',
    'Cape Verde': 'Cabo Verde', 'South Korea': 'Korea Republic', 'Czech Republic': 'Czechia',
    'Turkey': 'Türkiye', 'Iran': 'IR Iran', 'Bosnia-Herzegovina': 'Bosnia and Herzegovina',
    'DR Congo': 'Congo DR',
  };
  const normName = n => ESPN_NAMES[n] || n;
  const feedKey = utc => utc.replace(' ', 'T').replace(':00Z', 'Z');

  /* merge ESPN events over the embedded snapshot; returns a fresh feed array */
  function mergeEspn(espn) {
    const feed = JSON.parse(JSON.stringify(SNAPSHOT_EMBED));
    const evs = (espn && espn.events) || [];
    const byDate = {};
    evs.forEach(e => { (byDate[e.date] = byDate[e.date] || []).push(e); });
    feed.forEach(m => {
      let cands = byDate[feedKey(m.DateUtc)] || [];
      if (cands.length > 1) {
        const known = [m.HomeTeam, m.AwayTeam].filter(x => x && x !== 'To be announced');
        if (known.length) {
          cands = cands.filter(e => e.competitions[0].competitors.some(c =>
            known.includes(normName(c.team.displayName))));
        }
      }
      const e = cands[0];
      if (!e) return;
      const c = e.competitions[0];
      const st = (c.status && c.status.type) || (e.status && e.status.type) || {};
      const comps = {};
      c.competitors.forEach(x => { comps[x.homeAway] = x; });
      if (!comps.home || !comps.away) return;
      const hn = normName(comps.home.team.displayName);
      const an = normName(comps.away.team.displayName);
      // adopt newly-announced teams for knockout slots
      if (m.HomeTeam === 'To be announced' && TEAM_META[hn]) m.HomeTeam = hn;
      if (m.AwayTeam === 'To be announced' && TEAM_META[an]) m.AwayTeam = an;
      // orient ESPN sides onto the feed's home/away
      let H = null, A = null;
      if (hn === m.HomeTeam && an === m.AwayTeam) { H = comps.home; A = comps.away; }
      else if (hn === m.AwayTeam && an === m.HomeTeam) { H = comps.away; A = comps.home; }
      if (!H || !A) return;
      if (st.state === 'post' && st.completed !== false) {
        m.HomeTeamScore = +H.score; m.AwayTeamScore = +A.score;
        if (m.HomeTeamScore === m.AwayTeamScore) {
          const w = H.winner ? m.HomeTeam : A.winner ? m.AwayTeam : null;
          m.Winner = w || m.Winner;
          if (w && H.shootoutScore != null && A.shootoutScore != null) {
            m.Pens = H.shootoutScore + '–' + A.shootoutScore;
          }
        } else {
          m.Winner = m.HomeTeamScore > m.AwayTeamScore ? m.HomeTeam : m.AwayTeam;
        }
      } else if (st.state === 'in') {
        m.Live = { score: H.score + '–' + A.score, clock: st.shortDetail || 'LIVE' };
      }
    });
    return feed;
  }

  /* ---------- state built from feed ---------- */
  let S = null;

  function buildState(feed) {
    const teams = {};
    Object.keys(TEAM_META).forEach(n => {
      teams[n] = Object.assign({ name: n, mp: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, alive: false, tourGames: [] }, TEAM_META[n]);
    });
    const t = n => teams[n];
    const sorted = feed.slice().sort((a, b) => a.MatchNumber - b.MatchNumber);
    const matches = [];
    sorted.forEach(m => {
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
          H.tourGames.unshift({ o: m.AwayTeam, flag: A.flag, comp: comp, score: m.HomeTeamScore + '–' + m.AwayTeamScore + pens, r: hr });
          A.tourGames.unshift({ o: m.HomeTeam, flag: H.flag, comp: comp, score: m.AwayTeamScore + '–' + m.HomeTeamScore + pensA, r: ar });
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
          played: played, winner: winner, live: m.Live || null,
          pens: played && m.HomeTeamScore === m.AwayTeamScore && m.Winner
            ? m.Winner + ' win ' + (m.Pens ? m.Pens + ' on penalties' : 'on penalties') : null,
          date: fmtDate(m.DateUtc), time: fmtTime(m.DateUtc),
          venue: m.Location, city: cityName(m.Location), country: venueCountry(m.Location),
          side: so[0], ord: so[1],
          feeders: FEEDERS[m.MatchNumber] || null,
        });
      }
    });
    // alive = still has a path in the tournament (real results only)
    matches.forEach(km => {
      [km.home, km.away].forEach(name => { if (name && !km.played) t(name).alive = true; });
      if (km.played && km.winner && km.round !== 'F' && km.round !== 'B') {
        const laterLoss = matches.some(o => o.played && o.num > km.num && (o.home === km.winner || o.away === km.winner) && o.winner !== km.winner);
        const laterGame = matches.some(o => !o.played && (o.home === km.winner || o.away === km.winner));
        t(km.winner).alive = !laterLoss || laterGame;
      }
    });
    // last5 = tournament games (newest first) + pre-tournament filler
    Object.values(teams).forEach(x => {
      const pre = (x.pre || []).slice();
      x.last5 = x.tourGames.slice(0, 5);
      while (x.last5.length < 5 && pre.length) x.last5.push(pre.shift());
    });
    return { teams: teams, matches: matches, byNum: matches.reduce((o, m) => (o[m.num] = m, o), {}) };
  }

  /* ---------- slot resolution (real results only) ---------- */
  function resolveSlot(m, i) {
    const fixed = i === 0 ? m.home : m.away;
    if (fixed) return fixed;
    if (m.round === 'B') {
      const sf = S.byNum[i === 0 ? 101 : 102];
      if (sf && sf.played && sf.winner) return sf.winner === sf.home ? sf.away : sf.home;
      return null;
    }
    if (!m.feeders) return null;
    const src = S.byNum[m.feeders[i]];
    return src && src.played ? src.winner : null;
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
  function teamRowHTML(m, name, other, isHome) {
    if (!name) {
      let label = 'Winner TBD';
      const SHORT = { R32: 'R32', R16: 'R16', QF: 'QF', SF: 'SF' };
      if (m.round === 'B') label = 'SF loser';
      else if (m.feeders) {
        const src = S.byNum[m.feeders[isHome ? 0 : 1]];
        if (src) label = src.home && src.away ? 'Winner ' + shortPair(src) : (SHORT[src.round] || '') + ' winner · ' + src.city.split(' ')[0];
      }
      return '<div class="mc-team tbd"><span class="flg" style="opacity:.3;filter:grayscale(1)">⚽</span><span class="nm">' + esc(label) + '</span></div>';
    }
    const t = S.teams[name];
    let cls = 'mc-team', score = '';
    if (m.played) {
      cls += m.winner === name ? ' winner' : ' loser';
      score = '<span class="sc">' + (isHome ? m.hs : m.as) + '</span>';
    } else if (m.live) {
      score = '<span class="sc">' + esc(m.live.score.split('–')[isHome ? 0 : 1]) + '</span>';
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
    if (m.live) { cls += ' is-live'; tag = '<span class="mc-pick-tag live-tag">● Live · ' + esc(m.live.clock) + '</span>'; }
    if (!m.played && !m.live && pair.h && pair.a) {
      const pr = probs(m, pair.h, pair.a);
      if (pr) {
        prob = '<div class="mc-prob" style="--prob-h:' + S.teams[pair.h].c1 + ';--prob-a:' + S.teams[pair.a].c1 + '">' +
          '<i class="p-h" style="width:' + (pr.h * 100) + '%"></i><i class="p-d" style="width:' + (pr.d * 100) + '%"></i>' +
          '<i class="p-a" style="width:' + (pr.a * 100) + '%"></i></div>';
      }
    }
    const note = m.pens ? '<div class="mc-meta" style="margin:4px 0 0"><span>' + esc(m.pens) + '</span></div>' : '';
    return '<button class="' + cls + '" data-num="' + m.num + '">' + tag +
      '<div class="mc-meta"><span>' + esc(m.date) + '</span><span>' + esc(m.city) + '</span></div>' +
      teamRowHTML(m, pair.h, pair.a, true) + teamRowHTML(m, pair.a, pair.h, false) + prob + note + '</button>';
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
        const f = S.byNum[104];
        const champ = f && f.played && f.winner
          ? '<div class="champ-slot filled"><span class="trophy">🏆</span><span class="cl">World champions</span><div class="cn">' + S.teams[f.winner].flag + ' ' + esc(f.winner) + '</div></div>'
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
    const f = S.byNum[104];
    if (f && f.played && f.winner) celebrate();
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
    const hn = pair.h, an = pair.a;
    const th = hn && S.teams[hn], ta = an && S.teams[an];
    const heroBg = th && ta
      ? 'linear-gradient(118deg,' + darken(th.c1, .68) + ' 0%,' + darken(th.c1, .5) + ' 46%,' + darken(ta.c1, .5) + ' 54%,' + darken(ta.c1, .68) + ' 100%)'
      : 'linear-gradient(118deg,#1c2b3a,#2b3b4d)';
    const sideHTML = t => t
      ? '<div class="ph-side"><span class="flg">' + t.flag + '</span><div class="nm">' + esc(t.name) + '</div></div>'
      : '<div class="ph-side"><span class="flg" style="opacity:.4;filter:grayscale(1)">⚽</span><div class="nm" style="opacity:.6">TBD</div></div>';
    const heroMid = m.played ? '<div class="ph-score">' + m.hs + '–' + m.as + '</div>'
      : m.live ? '<div class="ph-score">' + esc(m.live.score) + '</div>'
      : '<div class="ph-vs">VS</div>';
    const meta = esc(m.date) + ' · ' + esc(m.time) + ' · ' + esc(m.venue)
      + (m.pens ? ' · ' + esc(m.pens) : '') + (m.live ? ' · LIVE ' + esc(m.live.clock) : '');

    let body = '';
    if (m.live) {
      body += '<section><div class="result-note">⚡ This one is under way — <b>' + esc(m.live.score) + '</b> (' + esc(m.live.clock) + '). Hit refresh for the latest.</div></section>';
    } else if (th && ta && !m.played) {
      const pr = probs(m, hn, an);
      if (pr) {
        body += '<section><p class="pb-label">Win · Draw · Win — 90 minutes</p>' +
          probRowHTML(th.name, pr.h, th.c1) + probRowHTML('Draw / extra time', pr.d, 'var(--draw)') + probRowHTML(ta.name, pr.a, ta.c1) +
          '<p class="model-note">Model: World Football Elo ratings updated through the tournament' +
          (pr.hostBoost ? ', with a host-nation venue boost for ' + esc(pr.hostBoost) : '') +
          '. The draw share is calibrated to 90-minute knockout draw rates (~28% for even ties) — a draw here means extra time.</p></section>';
      }
    } else if (m.played) {
      body += '<section><div class="result-note">Full-time: <b>' + esc(m.winner || 'Draw') + '</b>' + (m.winner ? ' advanced' : '') + (m.pens ? ' — ' + esc(m.pens) : '') + '.</div></section>';
    } else {
      body += '<section><div class="result-note">Teams are set once the feeder matches finish — check back after the earlier rounds.</div></section>';
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
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        panel.querySelectorAll('.prob-fill').forEach(el => { el.style.width = el.getAttribute('data-w'); });
      });
    });
    panel.scrollTop = 0;
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

  /* ---------- refresh ---------- */
  const refreshBtn = document.getElementById('refresh-btn');
  const badge = document.getElementById('sync-badge');
  function applyFeed(feed) {
    S = buildState(feed);
    renderBracket();
    renderTables();
    if (openNum != null) renderPanel();
  }
  function refresh() {
    refreshBtn.classList.add('spinning');
    refreshBtn.disabled = true;
    return fetch(ESPN_URL, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(espn => {
        applyFeed(mergeEspn(espn));
        const d = new Date();
        badge.textContent = 'Live from ESPN · updated ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
        badge.classList.add('ok');
      })
      .catch(() => {
        badge.textContent = 'ESPN unreachable — showing last known state';
        badge.classList.remove('ok');
      })
      .finally(() => {
        refreshBtn.classList.remove('spinning');
        refreshBtn.disabled = false;
      });
  }
  refreshBtn.addEventListener('click', refresh);

  /* ---------- confetti (champions crowned) ---------- */
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

  /* ---------- boot: render snapshot instantly, then pull live ---------- */
  applyFeed(SNAPSHOT_EMBED);
  const bs = document.querySelector('.bracket-scroller');
  if (bs) bs.scrollLeft = (bs.scrollWidth - bs.clientWidth) / 2;
  const dl = /^#m(\d+)$/.exec(location.hash);
  if (dl && S.byNum[+dl[1]]) openPanel(+dl[1]);
  refresh();
})();
