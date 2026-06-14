const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const indexFile = path.join(root, 'frontend', 'dist', 'index.html');
const assetFile = path.join(root, 'frontend', 'dist', 'assets', 'index.js');

if (fs.existsSync(indexFile) && fs.existsSync(assetFile)) {
  process.exit(0);
}

console.log('[frontend] Built frontend bundle is missing; building before server start...');
const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build:frontend'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, npm_config_script_shell: process.env.npm_config_script_shell || '/bin/sh' },
});

if (result.status !== 0) {
  console.error('[frontend] Could not build frontend bundle. Refusing to start with a blank UI.');
  process.exit(result.status || 1);
}
