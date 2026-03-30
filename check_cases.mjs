import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
// Check if benchmark_jobs has a userId column
const [cols] = await conn.execute("DESCRIBE benchmark_jobs");
console.log('Columns:', cols.map(c => c.Field).join(', '));
await conn.end();
