const path = require('path');
require('dotenv').config({ path: process.env.ZAMIL_ENV || path.join(__dirname, '..', '.env') });
const C = {
  PORT: +(process.env.PORT || 8787),
  HOST: process.env.HOST || '127.0.0.1',
  JWT_SECRET: process.env.JWT_SECRET || '',
  BOAT_SECRET: process.env.BOAT_SECRET || '',
  SUPER_ADMIN: String(process.env.SUPER_ADMIN || '').toLowerCase(),
  LAMIX_KEY: process.env.LAMIX_API_KEY || '',
  LAMIX_REST: process.env.LAMIX_REST || 'https://panel.lamix.org/api/v1',
  PG: { user: process.env.PG_USER || 'postgres', host: process.env.PG_HOST || 'localhost',
        port: +(process.env.PG_PORT || 5432), database: process.env.PG_DB || 'zamil_p1',
        password: process.env.PG_PASSWORD || '' },
  STATIC_CLASSIC: process.env.STATIC_CLASSIC || '/home/sk-khan/htdocs/sk-khan.online',
  STATIC_NEW: process.env.STATIC_NEW || '/opt/zamil/web/dist',
  DAEMONS: process.env.DAEMONS !== '0',
  RATE_GAP: 1600, RATE_CAP: 38   // 38 req/min per endpoint, 1.6s gap (LaMix: 40/min + 1/s)
};
if (!C.JWT_SECRET || !C.BOAT_SECRET) { console.error('FATAL: JWT_SECRET / BOAT_SECRET missing in .env'); process.exit(1); }
module.exports = C;