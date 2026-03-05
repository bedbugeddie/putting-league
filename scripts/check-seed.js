const { PrismaClient } = require('../backend/node_modules/@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const nights = await prisma.leagueNight.findMany({ orderBy: { date: 'asc' }, select: { id: true, date: true, status: true } });
  const dec2 = nights.find(n => n.date.toISOString().startsWith('2025-12-02'));
  console.log('Dec 2 night:', dec2.date.toISOString(), dec2.status);

  const user = await prisma.user.findFirst({ where: { name: 'Sean Callery' }, include: { player: true } });
  const r1   = await prisma.round.findFirst({ where: { leagueNightId: dec2.id, number: 1 } });
  const seanScores = await prisma.score.findMany({
    where: { playerId: user.player.id, roundId: r1.id },
    include: { hole: true },
  });
  const total = seanScores.reduce((acc, s) => s.bonus ? acc + 5 : acc + s.made + 1, 0);
  const summary = seanScores
    .sort((a, b) => a.hole.number - b.hole.number || a.position.localeCompare(b.position))
    .map(s => `${s.hole.number}${s.position === 'SHORT' ? 'S' : 'L'}:${s.made}${s.bonus ? '*' : ''}`)
    .join(' ');
  console.log(`Sean Callery Dec 2 Round 1 total (expected 41): ${total}`);
  console.log('Scores:', summary);

  // Spot-check Nov 4: Justin Chiu R1 total should be 33
  const nov4 = nights.find(n => n.date.toISOString().startsWith('2025-11-04'));
  const justin = await prisma.user.findFirst({ where: { name: 'Justin Chiu' }, include: { player: true } });
  const nr1 = await prisma.round.findFirst({ where: { leagueNightId: nov4.id, number: 1 } });
  const justinScores = await prisma.score.findMany({
    where: { playerId: justin.player.id, roundId: nr1.id },
    include: { hole: true },
  });
  // Nov scoring: made=0→0pt, made=1→1pt, made=2→2pt, made=3+bonus→4pt
  const jTotal = justinScores.reduce((acc, s) => s.bonus ? acc + 4 : acc + s.made, 0);
  const jSummary = justinScores
    .sort((a, b) => a.hole.number - b.hole.number || a.position.localeCompare(b.position))
    .map(s => `${s.hole.number}${s.position === 'SHORT' ? 'S' : 'L'}:${s.made}${s.bonus ? '*' : ''}`)
    .join(' ');
  console.log(`\nJustin Chiu Nov 4 Round 1 total (expected 33): ${jTotal}`);
  console.log('Scores:', jSummary);

  const withPdga = await prisma.player.count({ where: { pdgaNumber: { not: null } } });
  console.log(`\nPlayers with PDGA numbers: ${withPdga}`);

  await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
