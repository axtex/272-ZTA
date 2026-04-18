require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const globalForPrisma = globalThis;

function createClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set in process.env. Set it in backend/.env or your environment.',
    );
  }
  // Prisma ORM v7 uses the `pg` driver via `@prisma/adapter-pg`.
  // Some environments (and some hosted Postgres providers) require TLS and may
  // present certificate chains that Node doesn't validate by default.
  //
  // - Set `PG_SSL_REJECT_UNAUTHORIZED=true` to enforce strict validation.
  // - Default is `false` to keep local/dev + Supabase demos working reliably.
  const rejectUnauthorized = String(process.env.PG_SSL_REJECT_UNAUTHORIZED ?? 'false').toLowerCase() === 'true';

  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized },
  });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

module.exports = prisma;
