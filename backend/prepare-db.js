const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, 'prisma', 'schema.prisma');
if (fs.existsSync(schemaPath)) {
  const dbUrl = (process.env.DATABASE_URL || '').trim();
  let content = fs.readFileSync(schemaPath, 'utf8');

  if (dbUrl.startsWith('file:') || dbUrl.includes('.db')) {
    // Local SQLite
    content = content.replace(/provider\s*=\s*"postgresql"/g, 'provider = "sqlite"');
    console.log('[Database Setup] Configured Prisma for SQLite (Local)');
  } else {
    // Production PostgreSQL (Neon, Supabase, Render, Docker)
    content = content.replace(/provider\s*=\s*"sqlite"/g, 'provider = "postgresql"');
    console.log('[Database Setup] Configured Prisma for PostgreSQL (Production)');
  }

  fs.writeFileSync(schemaPath, content);
}
