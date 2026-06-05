module.exports = {
  apps: [{
    name: 'littleprince-agent',
    script: 'src/index.js',
    node_args: '--env-file=.env',
    env: {
      NODE_ENV: 'production',
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: '/var/log/littleprince-agent/error.log',
    out_file: '/var/log/littleprince-agent/out.log',
    merge_logs: true,
    max_memory_restart: '1G',
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    watch: false,
  }]
}
