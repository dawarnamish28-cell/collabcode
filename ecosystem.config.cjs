/**
 * PM2 Ecosystem Configuration
 * Manages both the backend server and Next.js frontend
 */
module.exports = {
  apps: [
    {
      name: 'collabcode-server',
      cwd: './server',
      script: 'server.js',
      env: {
        NODE_ENV: 'development',
        PORT: 4000,
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '256M',
      error_file: './logs/server-error.log',
      out_file: './logs/server-out.log',
      merge_logs: true,
    },
    {
      name: 'collabcode-client',
      cwd: './client',
      script: 'node_modules/.bin/next',
      args: 'start -p 3000',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      error_file: './logs/client-error.log',
      out_file: './logs/client-out.log',
      merge_logs: true,
    },
  ],
};
