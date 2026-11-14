const { Pool } = require('pg');
const C = require('./config');
const pool = new Pool({
  ...C.PG,
  max: +(process.env.PG_POOL_MAX || 40),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 8000,
  statement_timeout: 20000,                 // no query can hang forever
  idle_in_transaction_session_timeout: 30000, // kills stuck open transactions
  query_timeout: 25000,
  application_name: 'zamil-api'
});
pool.on('error', e => console.error('[pg] idle client error:', e.message));
const q = (sql, params) => pool.query(sql, params);
// UTC-midnight boundary = 05:00 PKT business day (unchanged from production behavior)
const PKT_DAY = "date_trunc('day', NOW() AT TIME ZONE 'UTC')";
module.exports = { pool, q, PKT_DAY };
