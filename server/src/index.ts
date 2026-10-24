import { config, lanAddresses } from './lib/config';
import { connectDatabase, databaseErrorSummary, prisma } from './lib/db';
import { createApp } from './app';
import { seedIfEmpty } from './seed/seedDemoQuiz';
import { seedBundledQuizzes } from './seed/bundledQuizzes';

async function main() {
  await connectDatabase();
  const { server, io, manager } = createApp();

  if (await seedIfEmpty(prisma)) console.log('  New database detected — added the 20-question Claude AI demo quiz.');
  for (const title of await seedBundledQuizzes(prisma)) console.log(`  Added bundled quiz: ${title}`);
  const resumed = await manager.resumeActive();

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, '0.0.0.0', () => {
      server.off('error', reject);
      resolve();
    });
  });

  console.log(`\n  SCALive Quiz Arena API listening on http://localhost:${config.port}`);
  for (const ip of lanAddresses()) console.log(`  LAN: http://${ip}:${config.port}`);
  if (config.publicUrl) console.log(`  Public URL for QR codes: ${config.publicUrl}`);
  if (!process.env.ADMIN_PASSWORD) console.log('  ⚠ ADMIN_PASSWORD not set — using development password "scalive-admin"');
  console.log('');

  if (resumed) console.log(`  Resumed ${resumed} in-progress session(s).`);

  const shutdown = async (signal: string) => {
    console.log(`\n${signal} received — shutting down…`);
    io.close();
    server.close();
    await prisma.$disconnect().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Startup failed. Check the MySQL DATABASE_URL and migration status.', databaseErrorSummary(err));
  void prisma.$disconnect();
  process.exit(1);
});
