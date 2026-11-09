// Runs sql/schema.sql then sql/extra.sql (both idempotent) before the server starts.
const fs = require('fs');
const path = require('path');
const { pool } = require('./src/db');
(async () => {
  for (const f of ['schema.sql', 'extra.sql']) {
    const p = path.join(__dirname, 'sql', f);
    if (!fs.existsSync(p)) continue;
    try { await pool.query(fs.readFileSync(p, 'utf8')); console.log('[migrate] ok', f); }
    catch (e) { console.error('[migrate] FAILED', f, e.message); process.exitCode = 1; }
  }
  await pool.end();
})();
