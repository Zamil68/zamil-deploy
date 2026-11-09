const { Pool } = require('pg');
const C = require('./config');
const pool = new Pool({ ...C.PG, max: 40, idleTimeoutMillis: 30000, connectionTimeoutMillis: 8000 });
pool.on('error', e => console.error('[pg] idle client error:', e.message));
const q = (sql, params) => pool.query(sql, params);
// UTC-midnight boundary = 05:00 PKT business day (unchanged from production behavior)
const PKT_DAY = "date_trunc('day', NOW() AT TIME ZONE 'UTC')";
module.exports = { pool, q, PKT_DAY };