const { spawn } = require('child_process');
const path = require('path');

console.log('='.repeat(50));
console.log('  Starting CodeMeet Local Development Environment');
console.log('='.repeat(50));

const isWin = process.platform === 'win32';
const npxCmd = isWin ? 'npx.cmd' : 'npx';
const nodeCmd = 'node';

const procs = [];

function startProcess(name, cmd, args, cwd) {
  const p = spawn(cmd, args, {
    cwd: path.resolve(__dirname, cwd),
    stdio: 'pipe',
    shell: isWin,
    env: { ...process.env },
  });

  p.stdout?.on('data', (d) => {
    const lines = d.toString().trim().split('\n');
    lines.forEach((l) => console.log(`[${name}] ${l}`));
  });

  p.stderr?.on('data', (d) => {
    const lines = d.toString().trim().split('\n');
    lines.forEach((l) => console.error(`[${name}] ${l}`));
  });

  p.on('close', (code) => {
    console.log(`[${name}] Exited with code ${code}`);
  });

  p.on('error', (err) => {
    console.error(`[${name}] Failed to start:`, err.message);
  });

  procs.push({ name, process: p });
  return p;
}

// 1. Start Executor (Port 4001)
console.log('[Runner] Starting Executor service on port 4001...');
startProcess('Executor', nodeCmd, ['index.js'], 'executor');

// Wait 1.5s before backend
setTimeout(() => {
  // 2. Start Backend (Port 4000)
  console.log('[Runner] Starting Backend service on port 4000...');
  startProcess('Backend', nodeCmd, ['dist/index.js'], 'backend');

  // Wait 1.5s before frontend
  setTimeout(() => {
    // 3. Start Frontend (Port 5173)
    console.log('[Runner] Starting Frontend Vite dev server on port 5173...');
    startProcess('Frontend', npxCmd, ['vite', '--host', '0.0.0.0'], 'frontend');

    console.log('\n' + '-'.repeat(50));
    console.log('  CodeMeet is ready!');
    console.log('  Open in browser: http://localhost:5173');
    console.log('-'.repeat(50) + '\n');
  }, 1500);
}, 1500);

function cleanup() {
  console.log('\n[Runner] Shutting down all services...');
  procs.forEach(({ name, process: p }) => {
    try {
      if (isWin) {
        spawn('taskkill', ['/pid', p.pid, '/f', '/t'], { stdio: 'ignore' });
      } else {
        p.kill('SIGTERM');
      }
    } catch {}
  });
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

