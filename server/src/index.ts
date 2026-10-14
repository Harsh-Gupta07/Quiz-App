import { config, lanAddresses } from './lib/config';
import { prisma } from './lib/db';
import { createApp } from './app';
import { seedIfEmpty } from './seed/seedDemoQuiz';

async function main() {
  const { server, io, manager } = createApp();

  await new Promise<void>((resolve) => server.listen(config.port, '0.0.0.0', resolve));

  console.log(`\n  SCALive Quiz Arena API listening on http://localhost:${config.port}`);
  for (const ip of lanAddresses()) console.log(`  LAN: http://${ip}:${config.port}`);
  if (config.publicUrl) console.log(`  Public URL for QR codes: ${config.publicUrl}`);
  if (!process.env.ADMIN_PASSWORD) console.log('  ⚠ ADMIN_PASSWORD not set — using development password "scalive-admin"');
  console.log('');

  try {
    if (await seedIfEmpty(prisma)) console.log('  New database detected — added the 20-question Claude AI demo quiz.');
    const resumed = await manager.resumeActive();
    if (resumed) console.log(`  Resumed ${resumed} in-progress session(s).`);
  } catch (err) {
    console.error('  Could not reach the database. Check DATABASE_URL.', (err as Error).message);
  }

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
  console.error(err);
  process.exit(1);
});
