import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const connection = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await connection.execute("SELECT id, name, code, clientName FROM projects ORDER BY id ASC");
console.log("Total projects:", rows.length);
console.log("\n--- All projects ---");
for (const r of rows) {
  console.log(`[${r.id}] name="${r.name}" code="${r.code || ''}" client="${r.clientName || ''}"`)
}

// Count test/vitest
const testProjects = rows.filter(r => 
  r.name.includes('vitest') || r.name.includes('__vitest') || 
  r.name.includes('Sample Project') || r.name.includes('Test Project') ||
  r.name.includes('测试项目-看板')
);
console.log("\n--- Test/Vitest projects:", testProjects.length, "---");
for (const r of testProjects) {
  console.log(`[${r.id}] name="${r.name}"`);
}

// Find user's real projects (the ones user created manually)
const userProjects = rows.filter(r => 
  !r.name.includes('vitest') && !r.name.includes('__vitest') && 
  !r.name.includes('Sample Project') && !r.name.includes('Test Project') &&
  !r.name.includes('测试项目-看板')
);
console.log("\n--- User projects:", userProjects.length, "---");
for (const r of userProjects) {
  console.log(`[${r.id}] name="${r.name}" code="${r.code || ''}" client="${r.clientName || ''}"`)
}

await connection.end();
