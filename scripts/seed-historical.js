/**
 * Seed historical league night data from xlsx files into the dev database.
 *
 * Rules:
 *   November 2025 scoring (cell value → made baskets + bonus):
 *     blank → made:0, bonus:false
 *     1     → made:1, bonus:false
 *     2     → made:2, bonus:false
 *     3     → made:3, bonus:true  (data entry error, treated as bonus)
 *     4     → made:3, bonus:true
 *
 *   December 2025+ scoring:
 *     blank → made:0, bonus:false
 *     1     → made:0, bonus:false  (0 baskets = 1 pt participation)
 *     2     → made:1, bonus:false
 *     3     → made:2, bonus:false
 *     4     → made:3, bonus:true   (data entry error, treated as bonus)
 *     5     → made:3, bonus:true
 *
 *   Nov 25 is skipped (no round sheets).
 */

const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const XLSX = require('C:/Users/Eric/AppData/Local/Temp/xlsxtmp/node_modules/xlsx');
const fs   = require('fs');
const path = require('path');

const prisma = new PrismaClient();
const XLSX_DIR = path.resolve(__dirname, '../History/New folder/MVPL Putting League Season 2025');

// ── Score conversion ──────────────────────────────────────────────────────────

function novCellToScore(val) {
  const n = (val === '' || val == null) ? 0 : Number(val);
  if (n === 4 || n === 3) return { made: 3, bonus: true };
  if (n === 2)             return { made: 2, bonus: false };
  if (n === 1)             return { made: 1, bonus: false };
  return                          { made: 0, bonus: false };
}

function decCellToScore(val) {
  const n = (val === '' || val == null) ? 0 : Number(val);
  if (n === 5 || n === 4) return { made: 3, bonus: true };
  if (n === 3)             return { made: 2, bonus: false };
  if (n === 2)             return { made: 1, bonus: false };
  // 1 or 0 → 0 baskets
  return                          { made: 0, bonus: false };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractDate(filename) {
  const m = filename.match(/(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function isNovemberFile(filename) {
  return /2025-11/.test(filename);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Build player map: normalized-name → { id, playerId }
  const users = await prisma.user.findMany({
    include: { player: true },
    where:   { player: { isNot: null } },
  });
  const playerMap = {};
  for (const u of users) {
    const key = u.name.trim().toLowerCase();
    playerMap[key] = u.player;
  }
  console.log(`Loaded ${Object.keys(playerMap).length} players from DB\n`);

  // Build league night map: YYYY-MM-DD → LeagueNight
  const nights = await prisma.leagueNight.findMany();
  const nightMap = {};
  for (const n of nights) {
    const d = n.date.toISOString().split('T')[0];
    nightMap[d] = n;
  }

  // Get all xlsx files, sorted chronologically
  const files = fs.readdirSync(XLSX_DIR)
    .filter(f => f.endsWith('.xlsx') && !f.startsWith('~$'))
    .sort();

  let totalScores = 0;
  let totalCheckIns = 0;
  let unmatchedNames = new Set();

  for (const file of files) {
    const dateStr = extractDate(file);
    if (!dateStr) { console.log(`SKIP (no date): ${file}`); continue; }

    // Skip Nov 25 — no round sheets
    if (dateStr === '2025-11-25') { console.log(`SKIP (no rounds): ${file}`); continue; }

    const night = nightMap[dateStr];
    if (!night) { console.log(`SKIP (no DB night for ${dateStr}): ${file}`); continue; }

    const isNov = isNovemberFile(file);
    const cellToScore = isNov ? novCellToScore : decCellToScore;
    const wb = XLSX.readFile(path.join(XLSX_DIR, file));

    console.log(`\nProcessing ${dateStr} (${isNov ? 'November' : 'December+'}) ...`);

    const checkedInPlayerIds = new Set();
    let nightScores = 0;

    for (const roundNum of [1, 2]) {
      const sheetName = `Round ${roundNum}`;
      const ws = wb.Sheets[sheetName];
      if (!ws) { console.log(`  No "${sheetName}" sheet – skipping`); continue; }

      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      // Find header row
      const headerIdx = aoa.findIndex(row =>
        row.some(c => String(c).toLowerCase() === 'name')
      );
      if (headerIdx === -1) { console.log(`  No header row in ${sheetName}`); continue; }

      const headers = aoa[headerIdx].map(h => String(h).toLowerCase());
      const nameCol = headers.indexOf('name');
      const pdgaCol = headers.indexOf('pdga_number');

      // Hole columns: hole_1s, hole_1l, ..., hole_6l
      const holeCols = [];
      for (let i = 0; i < headers.length; i++) {
        const m = headers[i].match(/^hole_(\d+)(s|l)$/);
        if (m) holeCols.push({ idx: i, num: parseInt(m[1]), pos: m[2] === 's' ? 'SHORT' : 'LONG' });
      }
      if (holeCols.length === 0) { console.log(`  No hole columns in ${sheetName}`); continue; }

      // Upsert Round record
      const round = await prisma.round.upsert({
        where:  { leagueNightId_number: { leagueNightId: night.id, number: roundNum } },
        create: { leagueNightId: night.id, number: roundNum, isComplete: true },
        update: { isComplete: true },
      });

      // Upsert Hole records
      const holeNums = [...new Set(holeCols.map(h => h.num))].sort((a, b) => a - b);
      const holeMap = {};
      for (const num of holeNums) {
        holeMap[num] = await prisma.hole.upsert({
          where:  { leagueNightId_number: { leagueNightId: night.id, number: num } },
          create: { leagueNightId: night.id, number: num },
          update: {},
        });
      }

      // Process each player row
      for (let r = headerIdx + 1; r < aoa.length; r++) {
        const row = aoa[r];
        const rawName = String(row[nameCol] ?? '').trim();
        if (!rawName) continue;

        const player = playerMap[rawName.toLowerCase()];
        if (!player) {
          unmatchedNames.add(rawName);
          continue;
        }

        checkedInPlayerIds.add(player.id);

        // Update PDGA number
        if (pdgaCol !== -1) {
          const raw = String(row[pdgaCol] ?? '').trim();
          const pdgaNum = raw && !isNaN(Number(raw)) ? raw : null;
          if (pdgaNum) {
            await prisma.player.update({
              where: { id: player.id },
              data:  { pdgaNumber: pdgaNum },
            });
          }
        }

        // Upsert scores
        for (const { idx, num, pos } of holeCols) {
          const { made, bonus } = cellToScore(row[idx]);
          await prisma.score.upsert({
            where: {
              playerId_holeId_roundId_position: {
                playerId: player.id,
                holeId:   holeMap[num].id,
                roundId:  round.id,
                position: pos,
              },
            },
            create: { playerId: player.id, holeId: holeMap[num].id, roundId: round.id, position: pos, made, bonus },
            update: { made, bonus },
          });
          nightScores++;
        }
      }

      console.log(`  Round ${roundNum}: processed ${aoa.length - headerIdx - 1} rows, ${holeCols.length} positions each`);
    }

    // Upsert CheckIn records
    for (const playerId of checkedInPlayerIds) {
      await prisma.checkIn.upsert({
        where:  { leagueNightId_playerId: { leagueNightId: night.id, playerId } },
        create: { leagueNightId: night.id, playerId, hasPaid: true },
        update: { hasPaid: true },
      });
    }

    // Mark night COMPLETED
    await prisma.leagueNight.update({
      where: { id: night.id },
      data:  { status: 'COMPLETED' },
    });

    totalScores    += nightScores;
    totalCheckIns  += checkedInPlayerIds.size;
    console.log(`  ✓ ${checkedInPlayerIds.size} check-ins, ${nightScores} scores`);
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(`Total scores created:    ${totalScores}`);
  console.log(`Total check-ins created: ${totalCheckIns}`);

  if (unmatchedNames.size > 0) {
    console.log(`\nWARNING – Unmatched player names (${unmatchedNames.size}):`);
    [...unmatchedNames].sort().forEach(n => console.log(`  "${n}"`));
  } else {
    console.log('\nAll player names matched successfully ✓');
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  prisma.$disconnect();
  process.exit(1);
});
