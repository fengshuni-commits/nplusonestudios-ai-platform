import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute('SELECT id, name, provider, apiEndpoint, apiKeyEncrypted, configJson, isActive FROM ai_tools ORDER BY id DESC LIMIT 15');
rows.forEach(r => {
  console.log(JSON.stringify({
    id: r.id,
    name: r.name,
    provider: r.provider,
    apiEndpoint: r.apiEndpoint,
    hasApiKey: !!r.apiKeyEncrypted,
    configJson: r.configJson ? r.configJson.toString() : null,
    isActive: r.isActive
  }));
});
await conn.end();
