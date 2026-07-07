/**
 * migrate.js — Migra dados do pl_records.json (do bot) para o Firestore
 * 
 * Uso: node migrate.js
 * 
 * Pré-requisitos:
 *   - Service account key do Firebase em firebase/serviceAccountKey.json
 *   - pl_records.json na mesma pasta (baixar do repo pl-bot)
 * 
 * Estrutura do pl_records.json:
 *   { data: { EU: { ranking[], unranked{}, records{} }, NA:..., ... }, vods: {} }
 */

const fs = require('fs');
const path = require('path');

// Para rodar: npm install firebase-admin
// const admin = require('firebase-admin');
// const serviceAccount = require('./serviceAccountKey.json');
// admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
// const db = admin.firestore();

const JSON_FILE = path.join(__dirname, 'pl_records.json');

function migrate() {
  if (!fs.existsSync(JSON_FILE)) {
    console.error('❌ pl_records.json not found. Download it from the pl-bot repo.');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(JSON_FILE, 'utf-8'));
  const data = raw.data || raw;
  const vods = raw.vods || {};
  
  const regions = Object.keys(data);
  let playerCount = 0, matchCount = 0, eventSet = new Set();
  
  // ── Migrate Players ──────────────────────────────
  for (const region of regions) {
    const reg = data[region];
    if (!reg) continue;
    
    // From ranking
    if (reg.ranking) {
      for (const r of reg.ranking) {
        const player = {
          name: r.player,
          region: region,
          wins: r.wins || 0,
          losses: r.losses || 0,
          affiliation: r.affiliation || null,
          tier: null,  // PL doesn't use tier system like HCL
          position: r.pos,
          avatarUrl: null,
          createdAt: Date.now()
        };
        // db.collection('players').add(player)
        console.log(`[Player] ${player.name} (${region}) ${player.wins}-${player.losses}`);
        playerCount++;
      }
    }
    
    // From records (these have match history)
    if (reg.records) {
      for (const [playerName, matches] of Object.entries(reg.records)) {
        for (const m of matches) {
          const match = {
            playerName: playerName,
            opponent: m.opponent || '',
            result: m.result || 'NC',
            score: m.record || '',
            rounds: null, // Will be added via admin panel
            event: m.event || '',
            vod: m.vod || '',
            notes: m.notes || '',
            fotn: false,
            forfeit: false,
            createdAt: Date.now()
          };
          if (match.event) eventSet.add(match.event);
          // db.collection('matches').add(match)
          matchCount++;
        }
      }
    }
  }
  
  // ── Migrate Events ───────────────────────────────
  const events = [...eventSet].sort();
  for (const e of events) {
    const event = {
      name: e,
      date: null,
      isTournament: /tournament/i.test(e),
      completed: true,
      createdAt: Date.now()
    };
    // db.collection('events').add(event)
    console.log(`[Event] ${event.name}`);
  }
  
  console.log(`\n✅ Migration plan:`);
  console.log(`   Players: ${playerCount}`);
  console.log(`   Matches: ${matchCount}`);
  console.log(`   Events:  ${events.length}`);
  console.log(`   VODs:    ${Object.keys(vods).length}`);
  console.log(`\n⚠️  Dry run — uncomment Firestore writes to actually migrate.`);
}

migrate();
