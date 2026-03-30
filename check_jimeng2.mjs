import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const [rows] = await conn.execute("SELECT id, name, provider, apiEndpoint, apiKeyEncrypted, configJson, isActive FROM ai_tools WHERE name LIKE '%即梦%' OR provider = 'jimeng'");
rows.forEach(r => {
  let cfg = null;
  try {
    cfg = typeof r.configJson === 'string' ? JSON.parse(r.configJson) : r.configJson;
  } catch(e) {
    cfg = r.configJson;
  }
  console.log('=== Tool:', r.id, r.name, '===');
  console.log('provider:', r.provider);
  console.log('apiEndpoint:', r.apiEndpoint);
  console.log('hasApiKey:', !!r.apiKeyEncrypted);
  console.log('apiKeyEncrypted (first 30):', r.apiKeyEncrypted ? r.apiKeyEncrypted.toString().substring(0, 30) : null);
  console.log('configJson:', JSON.stringify(cfg));
  console.log('isActive:', r.isActive);
});
await conn.end();
