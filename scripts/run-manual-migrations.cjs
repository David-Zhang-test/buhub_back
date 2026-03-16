// scripts/run-manual-migrations.cjs
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function runSqlFile(relativePath) {
  const fullPath = path.join(__dirname, '..', 'prisma', relativePath);
  const fileContent = fs.readFileSync(fullPath, 'utf8');

  console.log(`\n=== Running manual migration: ${relativePath} ===`);
  // PostgreSQL 驱动和 Prisma 不支持在一个 prepared statement 里执行多条 SQL，
  // 所以这里简单按分号拆分成多条语句逐条执行。
  const statements = fileContent
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    await prisma.$executeRawUnsafe(stmt);
  }
  console.log(`=== Done: ${relativePath} ===`);
}

async function main() {
  try {
    console.log('Starting manual migrations...');

    await runSqlFile('manual-migrations/20260303_add_anonymous_identity.sql');
    await runSqlFile('manual-migrations/20260303_backfill_anonymous_identity.sql');
    await runSqlFile('manual-migrations/20260315_add_user_email.sql');
    await runSqlFile('manual-migrations/20260315_add_notification_preferences.sql');

    console.log('\nAll manual migrations executed successfully.');
  } catch (err) {
    console.error('Manual migration failed:', err && err.message ? err.message : err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();