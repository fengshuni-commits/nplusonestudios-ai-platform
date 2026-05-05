import { createConnection } from 'mysql2/promise';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read DATABASE_URL from environment
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error('DATABASE_URL not set');
  process.exit(1);
}

// Parse the URL
const url = new URL(dbUrl);
const connection = await createConnection({
  host: url.hostname,
  port: parseInt(url.port || '3306'),
  user: url.username,
  password: url.password,
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
});

console.log('Connected to database');

try {
  await connection.execute('ALTER TABLE `generation_history` MODIFY COLUMN `outputContent` longtext');
  console.log('Migration done: outputContent changed to longtext');
} catch (err) {
  console.error('Migration error:', err.message);
  process.exit(1);
} finally {
  await connection.end();
}
