// ═══════════════════════════════════════════════
// PL RECORD BOOK — Frontend Logic
// DW2 Pro League Dashboard
// ═══════════════════════════════════════════════

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, collection, getDocs, doc, addDoc, deleteDoc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

// ── Config ──────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyDvDk5aoU-UDidEnn5HowUyRQLdatTQ-nI",
  authDomain: "pl-dashboard-f7315.firebaseapp.com",
  projectId: "pl-dashboard-f7315",
  storageBucket: "pl-dashboard-f7315.firebasestorage.app",
  messagingSenderId: "98422610300",
  appId: "1:98422610300:web:a138666f2218634d152cf9"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ── State ───────────────────────────────────────
const state = {
  page: 'home',
  region: 'Global',
  players: [],
  matches: [],
  events: [],
  playerByName: {},
  isAdmin: false,
  searchQuery: ''
};

// ── Constants ───────────────────────────────────
const FLAGS = { EU:'EU', NA:'NA', SA:'SA', AS:'AS', Global:'ALL' };
const COLORS = { EU:'#c0c0c0', NA:'#808080', SA:'#a0a0a0', AS:'#909090', Global:'#f7f5f6' };

// ── Helpers ─────────────────────────────────────
function getRegions(p) {
  if (!p) return {};
  if (typeof p.regions === 'string') { try { return JSON.parse(p.regions); } catch(e) { return {}; } }
  if (typeof p.regions === 'object') return p.regions;
  return {};
}

function inRegion(p, region) {
  if (region === 'Global') return true;
  return region in getRegions(p);
}

function getMatchesForPlayer(name) {
  const ln = name.toLowerCase();
  return state.matches.filter(m =>
    (m.player1 && m.player1.toLowerCase() === ln) ||
    (m.player2 && m.player2.toLowerCase() === ln)
  ).filter(m => isValidPlayerName(m.player1) && isValidPlayerName(m.player2));
}

function getFotnCount(name) {
  return getMatchesForPlayer(name).filter(m => m.fotn).length;
}

function isChampion(p) {
  return Object.values(getRegions(p)).some(r =>
    r.pos === 'Champion' || (r.pos && r.pos.toLowerCase().includes('champion'))
  );
}

function getBestPosition(p) {
  let best = 999, bestStr = '';
  for (const info of Object.values(getRegions(p))) {
    if (info.pos === 'Champion') return 'Champion';
    const n = parseInt(info.pos);
    if (n && n < best) { best = n; bestStr = info.pos; }
  }
  return bestStr || 'unranked';
}

function getRegionTags(p) {
  const regs = getRegions(p);
  return Object.keys(regs).map(r => FLAGS[r] || r).join(' · ');
}

function avatar(p) {
  const c = COLORS[p.primaryRegion] || '#666';
  const initial = (p.name || '?').charAt(0).toUpperCase();
  return `<div class="player-avatar placeholder" style="--accent:${c}">${initial}</div>`;
}

function esc(s) {
  return (s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function isValidPlayerName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 40) return false;
  if (/^\d/.test(trimmed)) return false;
  if (/^\d[\d:.\- ]+$/.test(trimmed)) return false;
  if (/^(the|a|an|of|in|on|at|to|for|is|was|2|4|half|parts?|score|added|round|bout|fight|non-|\()/i.test(trimmed)) return false;
  if (/blockspamming|last \d+ seconds|added from/i.test(trimmed)) return false;
  if (/^(tier|unranked|champion|vacant|n\/a|unknown|inactive|qualifier|non-tournament)$/i.test(trimmed)) return false;
  return true;
}

function isValidEventName(name) {
  if (!name || typeof name !== 'string') return false;
  const t = name.trim();
  if (t.length < 3) return false;
  if (/^(eu|na|sa|as|global|the|april|february|december)$/i.test(t)) return false;
  if (/^\(/.test(t) && /\)$/.test(t)) return false;
  return /dw2pl/i.test(t) || /tournament/i.test(t) || /fight\s*night/i.test(t) || /^\d/.test(t);
}

// ── Data Loading ────────────────────────────────
async function loadData() {
  try {
    const [pSnap, mSnap, eSnap] = await Promise.all([
      getDocs(collection(db, 'players')),
      getDocs(collection(db, 'matches')),
      getDocs(collection(db, 'events'))
    ]);
    // Load ALL players (both pl_ and v2_), filter garbage, deduplicate
    const allPlayers = pSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p.name && isValidPlayerName(p.name));
    // Deduplicate by name (prefer longer/more complete name)
    state.playerByName = {};
    allPlayers.forEach(p => {
      const key = (p.name || '').toLowerCase().trim();
      const existing = state.playerByName[key];
      if (!existing || (p.name.length > existing.name.length) || (p.id.startsWith('pl_') && existing.id.startsWith('v2_'))) {
        state.playerByName[key] = p;
      }
    });
    state.players = Object.values(state.playerByName);
    
    // Matches: load all, deduplicate
    const rawMatches = mSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const matchSeen = new Set();
    state.matches = rawMatches.filter(m => {
      const p1 = (m.player1 || '').toLowerCase();
      const p2 = (m.player2 || '').toLowerCase();
      if (!p1 || !p2) return false;
      const pair = [p1, p2].sort().join('|');
      const score = m.score || '';
      const event = m.event || '';
      const key = pair + '|' + score + '|' + event;
      if (matchSeen.has(key)) return false;
      matchSeen.add(key);
      return true;
    });
    
    // Events: load all, filter garbage, deduplicate
    const eventSeen = new Set();
    state.events = eSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(e => e.name && isValidEventName(e.name) && !/[A-Za-z]+ [A-Za-z]+ (Tournament|Fight) #[0-9]+ [A-Za-z]+/.test(e.name))
      .filter(e => {
        const key = e.name.toLowerCase().trim();
        if (eventSeen.has(key)) return false;
        eventSeen.add(key);
        return true;
      });
    console.log(`Loaded: ${state.players.length} players, ${state.matches.length} matches, ${state.events.length} events`);
    render();
  } catch (e) {
    console.error('Load error:', e);
    document.getElementById('mainContent').innerHTML =
      `<div class="error-state"><h2>Could not load data</h2><p>${e.message}</p></div>`;
  }
}

// ── Navigation ──────────────────────────────────
window.navigate = function(page) {
  state.page = page;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`[data-page="${page}"]`);
  if (btn) btn.classList.add('active');
  render();
  window.scrollTo(0, 0);
};

window.setRegion = function(region) {
  state.region = region;
  document.querySelectorAll('.region-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-region="${region}"]`).classList.add('active');
  render();
};

// ── Admin ───────────────────────────────────────
window.toggleAdmin = function() {
  document.getElementById('adminMenu').classList.toggle('hidden');
};

window.adminLogin = async function() {
  const email = document.getElementById('adminEmail').value;
  const pass = document.getElementById('adminPass').value;
  try {
    await signInWithEmailAndPassword(auth, email, pass);
    const adminDoc = await getDoc(doc(db, 'admins', 'admin_user'));
    if (adminDoc.exists() && adminDoc.data().uid === auth.currentUser.uid) {
      state.isAdmin = true;
      updateAdminUI();
      navigate('admin-players');
    } else {
      alert('Not an admin.');
    }
  } catch (e) { alert('Login failed: ' + e.message); }
};

window.adminLogout = async function() {
  await signOut(auth);
  state.isAdmin = false;
  updateAdminUI();
  navigate('home');
};

function updateAdminUI() {
  document.getElementById('adminLogin').classList.toggle('hidden', state.isAdmin);
  document.getElementById('adminPanel').classList.toggle('hidden', !state.isAdmin);
  const btn = document.getElementById('adminBtn');
  btn.textContent = state.isAdmin ? '⚙️ Admin ✓' : '⚙️ Admin';
  btn.classList.toggle('admin-active', state.isAdmin);
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      const ad = await getDoc(doc(db, 'admins', 'admin_user'));
      state.isAdmin = ad.exists() && ad.data().uid === user.uid;
    } catch(e) { state.isAdmin = false; }
  } else { state.isAdmin = false; }
  updateAdminUI();
});

window.exportPDF = function() {
  const regions = ['EU','NA','SA','AS'];
  const regionNames = { EU:'Europe', NA:'North America', SA:'South America', AS:'Asia' };
  let html = `
    <style>
      @page { size: A4 landscape; margin: 1.5cm; }
      body { font-family: 'Inter', Arial, sans-serif; color: #1a1a1a; font-size: 11px; }
      h1 { text-align: center; font-size: 24px; margin-bottom: 4px; letter-spacing: 2px; }
      .subtitle { text-align: center; color: #666; font-size: 13px; margin-bottom: 24px; }
      h2 { font-size: 18px; border-bottom: 2px solid #333; padding-bottom: 4px; margin: 20px 0 10px; }
      .section { margin-bottom: 16px; page-break-inside: avoid; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 10px; }
      th { background: #1a1a1a; color: #fff; padding: 4px 6px; text-align: left; font-weight: 600; border: 1px solid #333; }
      td { padding: 3px 6px; border: 1px solid #ddd; }
      .player-name { font-weight: 600; margin: 10px 0 2px; font-size: 12px; }
      .fotn { background: #fff8e0; }
      .vod-link { color: #06c; }
    </style>
    <h1>DW2PL RECORD BOOK</h1>
    <p class="subtitle">Generated ${new Date().toLocaleDateString()} · ${state.players.length} players · ${state.matches.length} matches</p>`;

  for (const region of regions) {
    const rPlayers = state.players.filter(p => inRegion(p, region));
    if (!rPlayers.length) continue;
    const rMatches = state.matches.filter(m => m.region === region);
    html += `<div class="section"><h2>${region} — ${regionNames[region] || region}</h2>
    <table><thead><tr><th>Pos</th><th>Player</th><th>Affiliation</th><th>Wins</th><th>Losses</th><th>MP</th><th>WR%</th></tr></thead><tbody>`;
    rPlayers.sort((a,b) => (b.totalWins||0) - (a.totalWins||0)).forEach((p,i) => {
      const wr = ((p.totalWins||0)+(p.totalLosses||0)) > 0 ? Math.round((p.totalWins||0)/((p.totalWins||0)+(p.totalLosses||0))*100) : 0;
      html += `<tr><td>${i+1}</td><td>${p.name}</td><td>${p.affiliation||'-'}</td><td>${p.totalWins||0}</td><td>${p.totalLosses||0}</td><td>${(p.totalWins||0)+(p.totalLosses||0)}</td><td>${wr}%</td></tr>`;
    });
    html += '</tbody></table></div>';

    // matches per region
    const byPlayer = {};
    rMatches.forEach(m => {
      [m.player1, m.player2].forEach(name => {
        if (!byPlayer[name]) byPlayer[name] = [];
        byPlayer[name].push(m);
      });
    });
    for (const [pName, pMatches] of Object.entries(byPlayer)) {
      html += `<div class="player-name">${pName} (${pMatches.length} matches)</div><table><thead><tr><th>Result</th><th>Opponent</th><th>Score</th><th>Rounds</th><th>Event</th><th>FOTN</th><th>VOD</th></tr></thead><tbody>`;
      pMatches.forEach(m => {
        const opp = m.player1 === pName ? m.player2 : m.player1;
        html += `<tr><td>${m.player1 === pName ? 'Win' : 'Loss'}</td><td>${opp}</td><td>${m.score||'-'}</td><td>${m.rounds||'-'}</td><td>${m.event||'-'}</td><td>${m.fotn?'🌟':''}</td><td>${m.vod?'<a href="'+m.vod+'">VOD</a>':'-'}</td></tr>`;
      });
      html += '</tbody></table>';
    }
  }

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
  w.print();
};
window.exportSheets = function() {
  let csv = 'Player,Region,Wins,Losses,Win Rate,Affiliation\n';
  state.players.forEach(p => {
    const wr = ((p.totalWins||0)+(p.totalLosses||0)) > 0 ? Math.round((p.totalWins||0)/((p.totalWins||0)+(p.totalLosses||0))*100) : 0;
    csv += `"${p.name}","${p.primaryRegion||'Global'}",${p.totalWins||0},${p.totalLosses||0},${wr}%,"${p.affiliation||''}"\n`;
  });
  csv += '\nPlayer1,Player2,Score,Rounds,Event,Region,FOTN,Title Fight\n';
  state.matches.forEach(m => {
    csv += `"${m.player1||''}","${m.player2||''}","${m.score||''}","${m.rounds||''}","${m.event||''}","${m.region||''}",${m.fotn||false},${m.titleFight||false}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'pl_records_export.csv'; a.click();
  URL.revokeObjectURL(url);
};

// ── Render dispatch ─────────────────────────────
function render() {
  const main = document.getElementById('mainContent');
  const pages = {
    home: renderHome, rankings: renderRankings, players: renderPlayers,
    fotn: renderFotn, events: renderEvents, champs: renderChamps, stats: renderStats,
    'admin-players': renderAdminPlayers, 'admin-matches': renderAdminMatches, 'admin-events': renderAdminEvents
  };
  main.innerHTML = (pages[state.page] || renderHome)();
}

// ── HOME ────────────────────────────────────────
function renderHome() {
  const tp = state.players.length, tm = state.matches.length, te = state.events.length;
  const tf = state.matches.filter(m => m.fotn).length;
  const regions = ['EU','NA','SA','AS'];

  const cards = regions.map(r => {
    const count = state.players.filter(p => inRegion(p, r)).length;
    return `<div class="region-card" style="--accent:${COLORS[r]}" onclick="setRegion('${r}');navigate('rankings')">
      <div class="region-flag">${FLAGS[r]}</div><div class="region-name">${r}</div>
      <div class="region-count">${count} players</div></div>`;
  }).join('');

  // Champions showcase
  const champs = state.players.filter(p => isChampion(p));
  const champCards = champs.map(p => {
    const regs = getRegions(p);
    const champRegions = Object.entries(regs).filter(([r,info]) => info.pos === 'Champion').map(([r]) => r);
    return `<div class="ranking-row" onclick="showPlayerByName('${esc(p.name)}')">
      <div class="rank-pos">👑</div>
      ${avatar(p)}
      <div class="rank-info">
        <div class="rank-name">${p.name}</div>
        <div class="rank-tags"><span class="aff-tag">${champRegions.join(' · ')}</span> ${p.affiliation ? `<span class="aff-tag">${p.affiliation}</span>` : ''}</div>
      </div>
      <div class="rank-record">${p.totalWins||0}-${p.totalLosses||0}</div>
    </div>`;
  }).join('');

  // Recent matches (filter bad ones with player names that look like notes)
  const recent = [...state.matches]
    .filter(m => isValidPlayerName(m.player1) && isValidPlayerName(m.player2))
    .sort((a,b) => (b.createdAt||0) - (a.createdAt||0)).slice(0, 12);

  return `<div class="page-home">
    <div class="hero"><h1>PL RECORD BOOK</h1>
    <p class="hero-sub">DW2 Pro League — Official Records & Statistics</p></div>
    <div class="stats-bar">
      <div class="stat-pill"><span class="stat-num">${tp}</span><span class="stat-label">Players</span></div>
      <div class="stat-pill"><span class="stat-num">${tm}</span><span class="stat-label">Matches</span></div>
      <div class="stat-pill"><span class="stat-num">${te}</span><span class="stat-label">Events</span></div>
      <div class="stat-pill"><span class="stat-num">${tf}</span><span class="stat-label">FOTN</span></div>
    </div>
    <div class="region-grid">${cards}</div>
    ${champCards ? `<div class="home-section"><h2>Active Champions</h2><div class="ranking-list">${champCards}</div></div>` : ''}
    <div class="home-section"><h2>Recent Matches</h2><div class="match-list">${renderMatchList(recent)}</div></div>
  </div>`;
}

// ── RANKINGS ────────────────────────────────────
function renderRankings() {
  const region = state.region;
  let players = state.players.filter(p => inRegion(p, region));

  players.sort((a, b) => {
    const ac = isChampion(a), bc = isChampion(b);
    if (ac && !bc) return -1;
    if (!ac && bc) return 1;
    const ap = parseInt(getBestPosition(a)) || 999;
    const bp = parseInt(getBestPosition(b)) || 999;
    if (ap !== bp) return ap - bp;
    return (b.totalWins || 0) - (a.totalWins || 0);
  });

  if (!players.length) return `<div class="empty-state"><p>No players in ${region}.</p></div>`;

  const rows = players.map((p, i) => {
    const pos = i + 1;
    const w = p.totalWins || 0, l = p.totalLosses || 0;
    const total = w + l;
    const wr = total > 0 ? Math.round(w/total*100) : 0;
    const champ = isChampion(p);
    const regs = getRegions(p);
    const regionInfo = regs[region] || {};
    const rPos = regionInfo.pos || '';
    const rW = regionInfo.wins || 0;
    const rL = regionInfo.losses || 0;
    const aff = p.affiliation ? `<span class="aff-tag">${p.affiliation}</span>` : '';
    const fotns = getFotnCount(p.name);
    const fotnBadge = fotns > 0 ? `<span class="fotn-count">🌟 ${fotns}</span>` : '';
    const posIcon = champ ? '👑' : (rPos ? '#' + rPos : '#' + pos);

    return `<div class="ranking-row" onclick="showPlayerByName('${esc(p.name)}')">
      <div class="rank-pos">${posIcon}</div>
      ${avatar(p)}
      <div class="rank-info">
        <div class="rank-name">${p.name || '?'}</div>
        <div class="rank-tags">${aff} ${fotnBadge}</div>
      </div>
      <div class="rank-record">${rW}-${rL}</div>
      <div class="rank-winrate">${wr}%</div>
    </div>`;
  }).join('');

  return `<div class="page-rankings">
    <h2>${FLAGS[region] || ''} ${region} Rankings</h2>
    <div class="ranking-list">${rows}</div>
  </div>`;
}

// ── PLAYERS ─────────────────────────────────────
function renderPlayers() {
  let players = state.players.filter(p => inRegion(p, state.region));

  if (state.searchQuery) {
    const q = state.searchQuery.toLowerCase();
    players = players.filter(p => p.name && p.name.toLowerCase().includes(q));
  }

  // Deduplicate by name
  let seen = {};
  players = players.filter(p => {
    const k = (p.name || '').toLowerCase();
    if (seen[k]) return false;
    seen[k] = true;
    return true;
  });

  players.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  return `<div class="page-players">
    <div class="search-bar">
      <input type="text" placeholder="Search player..." id="playerSearch"
        value="${state.searchQuery}" oninput="onSearch(this.value)">
    </div>
    <div class="player-grid">
      ${players.map(p => {
        const w = p.totalWins || 0, l = p.totalLosses || 0;
        const fotns = getFotnCount(p.name);
        const champ = isChampion(p);
        return `<div class="player-card" onclick="showPlayerByName('${esc(p.name)}')">
          ${avatar(p)}
          <div class="player-card-name">${p.name || '?'} ${champ ? '👑' : ''}</div>
          <div class="player-card-tags">${p.affiliation ? `<span class="aff-tag">${p.affiliation}</span>` : ''} <span class="region-tag">${getRegionTags(p)}</span></div>
          <div class="player-card-record">${w}W - ${l}L${fotns > 0 ? ` · 🌟${fotns}` : ''}</div>
        </div>`;
      }).join('') || '<p class="empty-state">No players found.</p>'}
    </div>
  </div>`;
}

// ── EVENTS ──────────────────────────────────────
function renderEvents() {
  let events = [...state.events].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  if (state.region !== 'Global') {
    events = events.filter(e => !e.region || e.region === state.region || e.region === 'Global');
  }

  if (!events.length) return `<div class="empty-state"><p>No events.</p></div>`;

  const tournaments = events.filter(e => e.isTournament || /tournament/i.test(e.name));
  const fightNights = events.filter(e => !e.isTournament && /fight night/i.test(e.name));
  const numbered = events.filter(e => !e.isTournament && !/fight night|tournament/i.test(e.name));

  function group(title, evts) {
    if (!evts.length) return '';
    return `<div class="event-group"><h3>${title} (${evts.length})</h3><div class="event-list">
      ${evts.map(e => {
        const mc = state.matches.filter(m => m.event === e.name).length;
        return `<div class="event-card" onclick="showEvent('${esc(e.name)}')">
          <div class="event-info">
            <div class="event-name">${e.name}</div>
            <div class="event-type">${e.isTournament ? '🏆 Tournament' : '🥊 Fight Night'} · ${mc} matches</div>
          </div>
        </div>`;
      }).join('')}
    </div></div>`;
  }

  return `<div class="page-events">
    <h2>Events ${state.region !== 'Global' ? '— ' + state.region : ''}</h2>
    ${group('Tournaments', tournaments)}
    ${group('Fight Nights', fightNights)}
    ${group('Numbered Events', numbered)}
  </div>`;
}

// ── FOTN ────────────────────────────────────────
function renderFotn() {
  const fotnMatches = state.matches.filter(m => m.fotn);
  if (!fotnMatches.length) return '<div class="empty-state"><p>No FOTN matches recorded yet.</p></div>';

  let fp = {};
  fotnMatches.forEach(m => {
    if (m.player1) fp[m.player1] = (fp[m.player1] || 0) + 1;
    if (m.player2) fp[m.player2] = (fp[m.player2] || 0) + 1;
  });
  const topFotn = Object.entries(fp).sort((a,b) => b[1] - a[1]);

  const sorted = [...fotnMatches].sort((a,b) => (b.createdAt||0) - (a.createdAt||0));

  return `<div class="page-fotn">
    <h2>🌟 Fight of the Night Awards</h2>
    <div class="stats-bar">
      <div class="stat-pill"><span class="stat-num">${fotnMatches.length}</span><span class="stat-label">FOTN Matches</span></div>
      <div class="stat-pill"><span class="stat-num">${topFotn.length}</span><span class="stat-label">Unique Winners</span></div>
    </div>
    ${topFotn.length ? `<div class="stats-section"><h3>🏆 Most FOTN Wins</h3><div class="ranking-list">
      ${topFotn.map(([name, count], i) => {
        const p = state.playerByName[name.toLowerCase()];
        return `<div class="ranking-row" onclick="showPlayerByName('${esc(name)}')">
          <div class="rank-pos">#${i+1}</div>
          ${avatar(p || {name, primaryRegion:'Global'})}
          <div class="rank-info"><div class="rank-name">${name}</div></div>
          <div class="rank-record">🌟 ${count}</div>
        </div>`;
      }).join('')}
    </div></div>` : ''}
    <div class="stats-section"><h3>📜 All FOTN Matches</h3><div class="match-list">${renderMatchList(sorted)}</div></div>
  </div>`;
}

// ── CHAMPIONSHIP HISTORY ────────────────────────
function renderChamps() {
  const regions = ['EU','NA','SA','AS'];
  const champs = state.players.filter(p => isChampion(p));

  const regionChamps = regions.map(r => {
    const rChamps = champs.filter(p => {
      const regs = getRegions(p);
      return regs[r] && regs[r].pos === 'Champion';
    });
    return { region: r, players: rChamps };
  });

  let topWins = [...state.players].filter(p => (p.totalWins||0) > 0)
    .sort((a,b) => (b.totalWins||0) - (a.totalWins||0)).slice(0, 5);

  let topWr = [...state.players].filter(p => (p.totalWins||0) + (p.totalLosses||0) >= 10)
    .sort((a,b) => {
      const wa = (a.totalWins||0) / ((a.totalWins||0)+(a.totalLosses||0)||1);
      const wb = (b.totalWins||0) / ((b.totalWins||0)+(b.totalLosses||0)||1);
      return wb - wa;
    }).slice(0, 5);

  return `<div class="page-champs">
    <h2>🏆 Championship History & Records</h2>
    ${regionChamps.map(({region, players}) => `
      <div class="stats-section"><h3>${FLAGS[region]} ${region} Champions</h3>
      ${players.length ? `<div class="ranking-list">${players.map(p => {
        const regs = getRegions(p);
        const rInfo = regs[region] || {};
        return `<div class="ranking-row" onclick="showPlayerByName('${esc(p.name)}')">
          <div class="rank-pos">👑</div>${avatar(p)}
          <div class="rank-info"><div class="rank-name">${p.name}</div>
          <div class="rank-tags">${p.affiliation ? `<span class="aff-tag">${p.affiliation}</span>` : ''}</div></div>
          <div class="rank-record">${rInfo.wins||0}-${rInfo.losses||0}</div>
        </div>`;
      }).join('')}</div>` : '<p class="empty-state">No champion</p>'}
      </div>`
    ).join('')}
    <div class="stats-section"><h3>🥇 Top 5 All-Time Wins</h3><div class="ranking-list">
      ${topWins.map((p, i) => {
        const w = p.totalWins||0, l = p.totalLosses||0;
        const wr = w+l > 0 ? Math.round(w/(w+l)*100) : 0;
        return `<div class="ranking-row" onclick="showPlayerByName('${esc(p.name)}')">
          <div class="rank-pos">#${i+1}</div>${avatar(p)}
          <div class="rank-info"><div class="rank-name">${p.name}</div>
          <div class="rank-tags">${getRegionTags(p)}</div></div>
          <div class="rank-record">${w}-${l}</div><div class="rank-winrate">${wr}%</div>
        </div>`;
      }).join('')}
    </div></div>
    <div class="stats-section"><h3>📊 Top 5 Win Rate (min. 10 matches)</h3><div class="ranking-list">
      ${topWr.map((p, i) => {
        const w = p.totalWins||0, l = p.totalLosses||0;
        const wr = Math.round(w/(w+l)*100);
        return `<div class="ranking-row" onclick="showPlayerByName('${esc(p.name)}')">
          <div class="rank-pos">#${i+1}</div>${avatar(p)}
          <div class="rank-info"><div class="rank-name">${p.name}</div>
          <div class="rank-tags">${getRegionTags(p)}</div></div>
          <div class="rank-record">${w}-${l}</div><div class="rank-winrate">${wr}%</div>
        </div>`;
      }).join('')}
    </div></div>
  </div>`;
}

// ── STATS ───────────────────────────────────────
function renderStats() {
  const tp = state.players.length, tm = state.matches.length;
  const tf = state.matches.filter(m => m.fotn).length;
  const tt = state.matches.filter(m => m.titleFight).length;
  const regions = ['EU','NA','SA','AS'];

  const rs = regions.map(r => ({
    region: r,
    players: state.players.filter(p => inRegion(p, r)).length,
    matches: state.matches.filter(m => m.region === r).length
  }));

  // Top FOTN
  let fp = {};
  state.matches.filter(m => m.fotn).forEach(m => {
    if (m.player1) fp[m.player1] = (fp[m.player1] || 0) + 1;
    if (m.player2) fp[m.player2] = (fp[m.player2] || 0) + 1;
  });
  const topFotn = Object.entries(fp).sort((a,b) => b[1] - a[1]).slice(0, 5);

  // Top wins
  const topWins = [...state.players].filter(p => (p.totalWins||0) > 0)
    .sort((a,b) => (b.totalWins||0) - (a.totalWins||0)).slice(0, 10);

  return `<div class="page-stats">
    <h2>League Statistics</h2>
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-big">${tp}</div><div class="stat-label">Players</div></div>
      <div class="stat-card"><div class="stat-big">${tm}</div><div class="stat-label">Matches</div></div>
      <div class="stat-card"><div class="stat-big">${tf}</div><div class="stat-label">FOTN</div></div>
      <div class="stat-card"><div class="stat-big">${tt}</div><div class="stat-label">Title Fights</div></div>
    </div>
    <div class="stats-section"><h3>By Region</h3><div class="region-stats">
      ${rs.map(r => `<div class="region-stat-row">
        <span class="region-flag">${FLAGS[r.region]}</span>
        <span class="region-name">${r.region}</span>
        <span>${r.players} players</span><span>${r.matches} matches</span>
      </div>`).join('')}
    </div></div>
    <div class="stats-section"><h3>Top 10 by Wins</h3><div class="ranking-list">
      ${topWins.map((p, i) => {
        const w = p.totalWins||0, l = p.totalLosses||0;
        const wr = w+l > 0 ? Math.round(w/(w+l)*100) : 0;
        return `<div class="ranking-row" onclick="showPlayerByName('${esc(p.name)}')">
          <div class="rank-pos">#${i+1}</div>${avatar(p)}
          <div class="rank-info"><div class="rank-name">${p.name} ${getRegionTags(p)}</div>
          <div class="rank-tags">${p.affiliation ? `<span class="aff-tag">${p.affiliation}</span>` : ''}</div></div>
          <div class="rank-record">${w}-${l}</div><div class="rank-winrate">${wr}%</div>
        </div>`;
      }).join('')}
    </div></div>
    ${topFotn.length ? `<div class="stats-section"><h3>🌟 Most FOTN Awards</h3><div class="ranking-list">
      ${topFotn.map(([name, count], i) => `<div class="ranking-row" onclick="showPlayerByName('${esc(name)}')">
        <div class="rank-pos">#${i+1}</div>${avatar(state.playerByName[name.toLowerCase()] || {name})}
        <div class="rank-info"><div class="rank-name">${name}</div></div>
        <div class="rank-record">🌟 ${count}</div>
      </div>`).join('')}
    </div></div>` : ''}
  </div>`;
}

// ── MATCH LIST ──────────────────────────────────
function renderMatchList(matches) {
  if (!matches || !matches.length) return '<p class="empty-state">No matches.</p>';
  return matches.map(m => {
    const p1 = m.player1 || '?', p2 = m.player2 || '?';
    const fotn = m.fotn ? '<span class="fotn-badge">🌟 FOTN</span>' : '';
    const title = m.titleFight ? '<span class="title-badge">🏆 Title</span>' : '';
    const vod = m.vod ? `<a href="${m.vod}" target="_blank" class="vod-link">▶ Watch</a>` : '';
    const notes = m.notes ? `<div class="match-notes">${m.notes}</div>` : '';
    const rounds = m.rounds ? `<span class="rounds-badge">⚔ ${m.rounds}</span>` : '';
    return `<div class="match-row">
      <div class="match-players">
        <span class="match-player" onclick="showPlayerByName('${esc(p1)}')">${p1}</span>
        <span class="match-vs">vs</span>
        <span class="match-opponent" onclick="showPlayerByName('${esc(p2)}')">${p2}</span>
      </div>
      <div class="match-score">${m.score || ''} ${rounds} ${fotn} ${title}</div>
      <div class="match-event">${m.event || ''}</div>
      ${notes}<div>${vod}</div>
    </div>`;
  }).join('');
}

// ── PLAYER MODAL ────────────────────────────────
window.showPlayerByName = function(name) {
  const p = state.playerByName[name.toLowerCase()];
  if (!p) return;

  const matches = getMatchesForPlayer(name);
  const w = p.totalWins || 0, l = p.totalLosses || 0;
  const total = w + l;
  const wr = total > 0 ? Math.round(w/total*100) : 0;
  const fotns = matches.filter(m => m.fotn).length;
  const titles = matches.filter(m => m.titleFight).length;
  const champ = isChampion(p);
  const regs = getRegions(p);

  // Per-region stats
  const regionStats = Object.entries(regs).map(([r, info]) => {
    const rW = info.wins || 0, rL = info.losses || 0;
    const rMP = info.mp || 0;
    const rWr = rW + rL > 0 ? Math.round(rW/(rW+rL)*100) : 0;
    const posLabel = info.pos === 'Champion' ? '👑 Champion' : (info.pos && info.pos !== 'unranked' ? '#' + info.pos : 'Unranked');
    return `<div class="region-stat-row">
      <span class="region-flag">${FLAGS[r] || r}</span>
      <span class="region-name">${r}</span>
      <span>${posLabel}</span>
      <span>${rW}W-${rL}L (${rMP} MP)</span>
      <span>${rWr}% WR</span>
    </div>`;
  }).join('');

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = () => modal.remove();
  modal.innerHTML = `
    <div class="modal-content" onclick="event.stopPropagation()">
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      <div class="player-modal-header" style="--accent:${COLORS[p.primaryRegion]||'#666'}">
        ${avatar(p).replace('placeholder', 'placeholder large')}
        <h2>${p.name} ${champ ? '👑' : ''}</h2>
        <div class="player-modal-tags">
          ${p.affiliation ? `<span class="aff-tag">${p.affiliation}</span>` : ''}
          <span class="region-tag">${getRegionTags(p)}</span>
        </div>
      </div>
      <div class="player-modal-stats">
        <div class="modal-stat"><span class="modal-stat-num">${w}-${l}</span><span class="modal-stat-label">Record</span></div>
        <div class="modal-stat"><span class="modal-stat-num">${wr}%</span><span class="modal-stat-label">Win Rate</span></div>
        <div class="modal-stat"><span class="modal-stat-num">${total}</span><span class="modal-stat-label">Matches</span></div>
        <div class="modal-stat"><span class="modal-stat-num">${fotns}</span><span class="modal-stat-label">FOTN</span></div>
        <div class="modal-stat"><span class="modal-stat-num">${titles}</span><span class="modal-stat-label">Title Fights</span></div>
      </div>
      ${regionStats ? `<div class="player-modal-regions"><h3>By Region</h3><div class="region-stats">${regionStats}</div></div>` : ''}
      <div class="player-modal-history">
        <h3>Match History (${matches.length})</h3>
        ${matches.length ? `<div class="match-list">${renderMatchList(matches.sort((a,b) => (b.createdAt||0)-(a.createdAt||0)))}</div>` : '<p>No matches recorded.</p>'}
      </div>
    </div>`;
  document.body.appendChild(modal);
};

window.showPlayer = function(id) {
  const p = state.players.find(x => x.id === id);
  if (p) showPlayerByName(p.name);
};

// ── EVENT MODAL ─────────────────────────────────
window.showEvent = function(eventName) {
  const matches = state.matches.filter(m => m.event === eventName);
  const e = state.events.find(x => x.name === eventName);
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.onclick = () => modal.remove();
  modal.innerHTML = `
    <div class="modal-content" onclick="event.stopPropagation()">
      <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      <div class="player-modal-header">
        <h2>${eventName}</h2>
        <div class="player-modal-tags">
          ${e?.isTournament ? '<span class="tier-badge tier-s">🏆 Tournament</span>' : '<span class="tier-badge tier-a">🥊 Event</span>'}
          <span class="position-badge">${matches.length} matches</span>
        </div>
      </div>
      <div class="player-modal-history">
        <h3>Matches</h3>
        ${matches.length ? `<div class="match-list">${renderMatchList(matches)}</div>` : '<p>No matches for this event.</p>'}
      </div>
    </div>`;
  document.body.appendChild(modal);
};

// ── ADMIN PAGES ─────────────────────────────────
function renderAdminPlayers() {
  if (!state.isAdmin) return '<div class="error-state"><p>Admin access required.</p></div>';
  return `<div class="page-admin"><h2>Manage Players (${state.players.length})</h2>
    <div class="admin-form"><h3>Add Player</h3><div class="form-grid">
      <input type="text" id="pName" placeholder="Player name" class="admin-input">
      <select id="pRegion" class="admin-input"><option value="EU">EU</option><option value="NA">NA</option><option value="SA">SA</option><option value="AS">AS</option><option value="Global">Global</option></select>
      <input type="text" id="pAff" placeholder="Affiliation" class="admin-input">
      <button class="admin-submit" onclick="addPlayer()">Add</button>
    </div></div>
    <div class="admin-list"><h3>All Players</h3><div class="admin-player-list">
      ${state.players.sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(p =>
        `<div class="admin-row"><span>${p.name} — ${getRegionTags(p)} ${p.affiliation||''} (${p.totalWins||0}W-${p.totalLosses||0}L)</span>
        <button class="admin-delete" onclick="deletePlayer('${p.id}')">Delete</button></div>`
      ).join('') || '<p>No players.</p>'}
    </div></div></div>`;
}

function renderAdminMatches() {
  if (!state.isAdmin) return '<div class="error-state"><p>Admin access required.</p></div>';
  const evOpts = state.events.map(e => `<option value="${e.name}">${e.name}</option>`).join('');
  return `<div class="page-admin"><h2>Add Match</h2><div class="admin-form"><div class="form-grid">
    <input type="text" id="mP1" placeholder="Player 1" class="admin-input">
    <input type="text" id="mP2" placeholder="Player 2" class="admin-input">
    <input type="text" id="mScore" placeholder="Score (e.g. 9102-6853)" class="admin-input">
    <input type="text" id="mRounds" placeholder="Rounds (e.g. 2-1, 2-0)" class="admin-input">
    <select id="mRegion" class="admin-input"><option value="EU">EU</option><option value="NA">NA</option><option value="SA">SA</option><option value="AS">AS</option><option value="Global">Global</option></select>
    <select id="mEvent" class="admin-input"><option value="">Event...</option>${evOpts}</select>
    <input type="text" id="mVod" placeholder="YouTube URL" class="admin-input">
    <input type="text" id="mNotes" placeholder="Notes" class="admin-input">
    <div class="form-checks"><label><input type="checkbox" id="mFotn"> 🌟 FOTN</label><label><input type="checkbox" id="mTitle"> 🏆 Title Fight</label></div>
    <button class="admin-submit" onclick="addMatch()">Add Match</button>
  </div></div></div>`;
}

function renderAdminEvents() {
  if (!state.isAdmin) return '<div class="error-state"><p>Admin access required.</p></div>';
  return `<div class="page-admin"><h2>Events (${state.events.length})</h2>
    <div class="admin-form"><h3>Add Event</h3><div class="form-grid">
      <input type="text" id="eName" placeholder="Event name" class="admin-input">
      <select id="eRegion" class="admin-input"><option value="Global">Global</option><option value="EU">EU</option><option value="NA">NA</option><option value="SA">SA</option><option value="AS">AS</option></select>
      <label><input type="checkbox" id="eTournament"> 🏆 Tournament</label>
      <button class="admin-submit" onclick="addEvent()">Add</button>
    </div></div>
    <div class="admin-list"><h3>All Events</h3><div class="admin-event-list">
      ${state.events.sort((a,b)=>(a.name||'').localeCompare(b.name||'')).map(e =>
        `<div class="admin-row"><span>${e.name} — ${e.region||'Global'} ${e.isTournament?'🏆':'🥊'}</span>
        <button class="admin-delete" onclick="deleteEvent('${e.id}')">Delete</button></div>`
      ).join('') || '<p>No events.</p>'}
    </div></div></div>`;
}

// ── Admin Actions ───────────────────────────────
window.addPlayer = async function() {
  const name = document.getElementById('pName').value.trim();
  const region = document.getElementById('pRegion').value;
  const aff = document.getElementById('pAff').value.trim();
  if (!name) return alert('Name required');
  const regions = {}; regions[region] = {pos:'unranked',wins:0,losses:0,mp:0,aff:aff||''};
  await addDoc(collection(db,'players'), {
    name, primaryRegion: region, regions: JSON.stringify(regions),
    affiliation: aff||'', totalWins:0, totalLosses:0, totalMP:0, createdAt: Date.now()
  });
  document.getElementById('pName').value = ''; document.getElementById('pAff').value = '';
  await loadData();
};

window.deletePlayer = async function(id) {
  if (!confirm('Delete this player?')) return;
  await deleteDoc(doc(db,'players',id));
  await loadData();
};

window.addMatch = async function() {
  const p1 = document.getElementById('mP1').value.trim();
  const p2 = document.getElementById('mP2').value.trim();
  if (!p1||!p2) return alert('Both players required');
  await addDoc(collection(db,'matches'), {
    player1:p1, player2:p2,
    score: document.getElementById('mScore').value.trim(),
    rounds: document.getElementById('mRounds').value.trim(),
    region: document.getElementById('mRegion').value,
    event: document.getElementById('mEvent').value,
    vod: document.getElementById('mVod').value.trim(),
    notes: document.getElementById('mNotes').value.trim(),
    fotn: document.getElementById('mFotn').checked,
    titleFight: document.getElementById('mTitle').checked,
    createdAt: Date.now()
  });
  ['mP1','mP2','mScore','mRounds','mVod','mNotes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('mFotn').checked = false; document.getElementById('mTitle').checked = false;
  await loadData();
};

window.addEvent = async function() {
  const name = document.getElementById('eName').value.trim();
  if (!name) return alert('Name required');
  await addDoc(collection(db,'events'), {
    name, region: document.getElementById('eRegion').value,
    isTournament: document.getElementById('eTournament').checked, completed: false, createdAt: Date.now()
  });
  document.getElementById('eName').value = ''; document.getElementById('eTournament').checked = false;
  await loadData();
};

window.deleteEvent = async function(id) {
  if (!confirm('Delete?')) return;
  await deleteDoc(doc(db,'events',id));
  await loadData();
};

// ── Search ──────────────────────────────────────
window.onSearch = function(val) {
  state.searchQuery = val;
  render();
  const input = document.getElementById('playerSearch');
  if (input) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
};

// ── Init ────────────────────────────────────────
loadData();
