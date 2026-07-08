/**
 * migrate.js — Migra dados do pl_records.json para o Firestore
 *
 * Uso:
 *   1. Crie firebase/serviceAccountKey.json (service account do Firebase)
 *   2. Coloque pl_records.json na mesma pasta (do bot_pl.py)
 *   3. npm install firebase-admin
 *   4. node scripts/migrate.js
 *
 * Estrutura de saída (Firestore):
 *   players/{v2_pl_XXXXX} — { name, primaryRegion, regions: {EU:{pos,wins,losses,mp}}, ... }
 *   matches/{v2_mf_XXXXX} — { player1, player2, score, region, event, fotn, titleFight, ... }
 *   events/{v2_ev_XXXXX}  — { name, region, isTournament, completed, ... }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const JSON_FILE = path.join(__dirname, '..', 'pl_records.json');
const SA_FILE = path.join(__dirname, '..', 'firebase', 'serviceAccountKey.json');
const PREFIX = 'v2_';
const REGION_NAMES = { eu:'EU', na:'NA', sa:'SA', as:'AS', global:'Global' };

function shortHash(str) {
  return crypto.createHash('md5').update(str).digest('hex').slice(0, 8);
}

function detectRegions(records) {
  const seen = {};
  for (const key of Object.keys(records)) {
    const lk = key.toLowerCase();
    for (const [k, v] of Object.entries(REGION_NAMES)) {
      if (lk.includes(k)) seen[v] = true;
    }
  }
  return Object.keys(seen).length ? Object.keys(seen) : ['Global'];
}

async function migrate() {
  if (!fs.existsSync(JSON_FILE)) {
    console.error('pl_records.json not found. Generate it with bot_pl.py first.');
    process.exit(1);
  }
  if (!fs.existsSync(SA_FILE)) {
    console.error('firebase/serviceAccountKey.json not found. Download from Firebase Console.');
    process.exit(1);
  }

  const admin = require('firebase-admin');
  const { getFirestore } = require('firebase-admin/firestore');
  const serviceAccount = require(SA_FILE);
  admin.initializeApp({ credential: admin.cert(serviceAccount) });
  const db = getFirestore();

  const raw = JSON.parse(fs.readFileSync(JSON_FILE, 'utf-8'));
  const data = raw.data || raw;
  const regions = Object.keys(data);

  // ── Collect all players from ranking + records ──
  const playerMap = {};
  const matchList = [];
  const eventSet = new Set();
  let allVods = raw.vods || {};

  for (const region of regions) {
    const reg = data[region];
    if (!reg) continue;

    if (reg.ranking) {
      for (const r of reg.ranking) {
        const name = r.player.trim();
        if (!name || name.toUpperCase() === 'VACANT' || name.toUpperCase() === 'N/A') continue;
        if (!playerMap[name]) {
          playerMap[name] = {
            name,
            primaryRegion: region,
            regions: {},
            affiliation: r.affiliation || '',
            totalWins: 0, totalLosses: 0, totalMP: 0,
            createdAt: Date.now()
          };
        }
        playerMap[name].regions[region] = {
          pos: r.pos,
          wins: r.wins || 0,
          losses: r.losses || 0,
          mp: r.mp || 0,
          aff: r.affiliation || ''
        };
        playerMap[name].totalWins += r.wins || 0;
        playerMap[name].totalLosses += r.losses || 0;
        playerMap[name].totalMP += r.mp || 0;
        if (r.affiliation) playerMap[name].affiliation = r.affiliation;
      }
    }

    if (reg.records) {
      for (const [playerName, matches] of Object.entries(reg.records)) {
        const name = playerName.trim();
        if (!name) continue;
        if (!playerMap[name]) {
          playerMap[name] = {
            name,
            primaryRegion: region,
            regions: {},
            affiliation: '',
            totalWins: 0, totalLosses: 0, totalMP: 0,
            createdAt: Date.now()
          };
        }
        // Records-only players must have region data for site filtering
        if (!playerMap[name].regions[region]) {
          playerMap[name].regions[region] = {
            pos: 'unranked', wins: 0, losses: 0, mp: 0,
            aff: playerMap[name].affiliation || ''
          };
        }
        for (const m of matches) {
          const eventName = (m.event || '').trim();
          if (eventName) eventSet.add(eventName);
          let opponent = (m.opponent || '').trim();
          let score = (m.score || '').trim();
          let record = (m.record || '').trim();
          const isFotn = /fight of the night/i.test(m.notes || '') || /fotn/i.test(m.notes || '');
          const isTitle = /title/i.test(m.notes || '') || /championship/i.test(m.event || '');
          const isForfeit = /forfeit/i.test(m.result || '') || /forfeit/i.test(m.notes || '');
          const result = (m.result || '').trim().toLowerCase();
          const isWin = result === 'win' || result === 'w';
          const isLoss = result === 'loss' || result === 'l';

          // Recalculate score from record if score is empty
          if (!score && record) score = record;

          matchList.push({
            id: '',
            player1: name,
            player2: opponent || 'Unknown',
            score,
            rounds: '',
            region,
            event: eventName,
            vod: m.vod || allVods[eventName] || '',
            notes: m.notes || '',
            fotn: isFotn,
            titleFight: isTitle,
            forfeit: isForfeit,
            createdAt: Date.now()
          });
        }
      }
    }
  }

  // ── Fix multi-word opponent names ──
  const knownNames = new Set(Object.keys(playerMap).map(k => k.toLowerCase()));
  const scoreRe = /^(\d+-\d+)\s+(.+)$/;
  const scoreOnlyRe = /^\d+-\d+$/;
  let fixedOpponents = 0;
  for (const m of matchList) {
    const p2lower = m.player2.toLowerCase();
    if (knownNames.has(p2lower)) continue;
    const candidate = m.player2 + ' ' + m.score;
    const canLower = candidate.toLowerCase();
    if (knownNames.has(canLower)) {
      m.player2 = candidate;
      m.score = '';
      if (scoreRe.test(m.event)) {
        m.score = m.event.replace(scoreRe, '$1');
        m.event = m.event.replace(scoreRe, '$2');
      } else if (scoreOnlyRe.test(m.event)) {
        m.score = m.event;
        m.event = m.notes;
        m.notes = '';
      }
      fixedOpponents++;
    }
  }
  if (fixedOpponents) console.log(`Fixed ${fixedOpponents} multi-word opponent names`);

  // ── Normalize match direction + score for dedup ──
  function normScore(s) {
    if (!s || !s.includes('-')) return s || '';
    const parts = s.split('-');
    const a = parseInt(parts[0]), b = parseInt(parts[1]);
    if (!isNaN(a) && !isNaN(b)) return Math.max(a, b) + '-' + Math.min(a, b);
    return s;
  }
  for (const m of matchList) {
    const cmp = (m.player1 || '').toLowerCase().localeCompare((m.player2 || '').toLowerCase());
    if (cmp > 0) {
      [m.player1, m.player2] = [m.player2, m.player1];
      m.score = normScore(m.score);
    } else if (cmp === 0) {
      // Same player on both sides — skip (shouldn't happen)
      continue;
    }
    // Compute normalized ID
    const key = m.player1 + '|' + m.player2 + '|' + normScore(m.score) + '|' + (m.event || '');
    m.id = PREFIX + 'mf_' + shortHash(key);
  }

  // ── Deduplicate players ──
  const players = Object.values(playerMap);
  console.log(`Players: ${players.length}`);

  // ── Deduplicate matches (by normalized ID) ──
  const matchSeen = new Set();
  const matches = matchList.filter(m => {
    const key = m.id;
    if (matchSeen.has(key)) return false;
    matchSeen.add(key);
    return true;
  });
  console.log(`Matches: ${matches.length}`);

  // ── Events ──
  const events = [...eventSet].sort().map((e, i) => ({
    id: PREFIX + 'ev_' + String(i + 1).padStart(4, '0'),
    name: e,
    region: 'Global',
    isTournament: /tournament/i.test(e),
    completed: true,
    createdAt: Date.now()
  }));
  console.log(`Events: ${events.length}`);

  // ── Write to Firestore ──
  const batchSize = 20;
  let written = 0;

  async function writeBatch(collection, docs) {
    for (let i = 0; i < docs.length; i += batchSize) {
      const batch = db.batch();
      const chunk = docs.slice(i, i + batchSize);
      for (const doc of chunk) {
        const ref = doc.id ? db.collection(collection).doc(doc.id) : db.collection(collection).doc();
        const { id, ...data } = doc;
        batch.set(ref, data, { merge: true });
      }
      await batch.commit();
      written += chunk.length;
      console.log(`  ${collection}: ${written}/${docs.length}`);
    }
  }

  const pDocs = players.map((p, i) => ({
    id: PREFIX + 'pl_' + String(i + 1).padStart(4, '0'),
    ...p,
    regions: JSON.stringify(p.regions)
  }));

  const mDocs = matches;
  const eDocs = events;

  console.log('\nWriting to Firestore...');
  await writeBatch('players', pDocs);
  await writeBatch('matches', mDocs);
  await writeBatch('events', eDocs);

  console.log(`\nDone! ${written} documents written.`);
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
