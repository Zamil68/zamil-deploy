// Secrets live ONLY in /opt/zamil/server/.env (dotenv) — never duplicated here.
module.exports = { apps: [{
  name: 'zamil-api',
  script: 'src/server.js',
  cwd: '/opt/zamil/server',
  instances: 1, exec_mode: 'fork',
  max_memory_restart: '1G',
  kill_timeout: 10000, listen_timeout: 15000,
  autorestart: true, max_restarts: 10, min_uptime: '30s',
  watch: false,
  env_production: { NODE_ENV: 'production' },
  log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  error_file: '/var/log/zamil/error.log',
  out_file: '/var/log/zamil/out.log',
  merge_logs: true
}]};