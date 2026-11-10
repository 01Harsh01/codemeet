const express = require('express');
const { spawn, execSync } = require('child_process');
const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

const PORT = process.env.PORT || 4001;
const EXECUTOR_SECRET = process.env.EXECUTOR_SECRET || 'codemeet-executor-secret-dev';
const RUN_DIR = process.env.RUN_DIR || path.join(os.tmpdir(), 'codemeet-runs');

// Check if Docker is available on system
let hasDocker = false;
try {
  execSync('docker --version', { stdio: 'ignore' });
  hasDocker = true;
  console.log('[Executor] Docker is available. Container isolation enabled.');
} catch {
  console.log('[Executor] Docker not found. Running in local fallback execution mode.');
}

// Docker configuration
const DOCKER_LANGS = {
  python: { img: 'python:3.12-alpine', file: 'main.py', cmd: 'python main.py' },
  javascript: { img: 'node:20-alpine', file: 'main.js', cmd: 'node main.js' },
  cpp: { img: 'gcc:13', file: 'main.cpp', cmd: 'g++ -O2 -o /tmp/a main.cpp && /tmp/a' },
  java: { img: 'eclipse-temurin:21-jdk', file: 'Main.java', cmd: 'javac -d /tmp Main.java && java -Xmx128m -cp /tmp Main' },
};

// Check available local tools
const isWin = process.platform === 'win32';
const which = (cmd) => {
  try {
    const checkCmd = isWin ? `where.exe ${cmd}` : `which ${cmd}`;
    return execSync(checkCmd, { stdio: 'pipe' }).toString().trim().split(/\r?\n/)[0];
  } catch {
    return null;
  }
};

const localPython = which('python') || which('py') || which('python3');
const localNode = which('node');
const localGpp = which('g++');
const localJavac = which('javac');
const localJava = which('java');

console.log('[Executor] Local environment tools:', {
  python: !!localPython,
  node: !!localNode,
  cpp: !!localGpp,
  java: !!(localJavac && localJava),
});

const app = express();
app.use(express.json({ limit: '500kb' }));

app.get('/health', (_, r) => r.json({
  status: 'ok',
  mode: hasDocker ? 'docker' : 'local',
  tools: {
    python: hasDocker || !!localPython,
    javascript: hasDocker || !!localNode,
    cpp: hasDocker || !!localGpp,
    java: hasDocker || !!(localJavac && localJava),
  }
}));

const cap = (s, d) => (s + d).slice(0, 64 * 1024);

async function runLocal(language, code, stdin, dir) {
  const t0 = Date.now();
  let stdout = '';
  let stderr = '';
  let timedOut = false;
  let exitCode = 0;

  if (language === 'python') {
    if (!localPython) {
      return { stdout: '', stderr: 'Python is not installed on the server host.', exitCode: 1, timedOut: false, timeMs: 0 };
    }
    const filePath = path.join(dir, 'main.py');
    await fs.writeFile(filePath, code, 'utf8');
    return executeProcess(localPython, [filePath], stdin, dir, t0);
  }

  if (language === 'javascript') {
    if (!localNode) {
      return { stdout: '', stderr: 'Node.js is not installed on the server host.', exitCode: 1, timedOut: false, timeMs: 0 };
    }
    const filePath = path.join(dir, 'main.js');
    await fs.writeFile(filePath, code, 'utf8');
    return executeProcess(localNode, [filePath], stdin, dir, t0);
  }

  if (language === 'cpp') {
    if (!localGpp) {
      return { stdout: '', stderr: 'C++ compiler (g++) is not installed on the server host.', exitCode: 1, timedOut: false, timeMs: 0 };
    }
    const srcPath = path.join(dir, 'main.cpp');
    const binPath = path.join(dir, isWin ? 'a.exe' : 'a.out');
    await fs.writeFile(srcPath, code, 'utf8');

    // Compile step
    const compileRes = await executeProcess(localGpp, ['-O2', '-o', binPath, srcPath], '', dir, t0);
    if (compileRes.exitCode !== 0) {
      return {
        stdout: compileRes.stdout,
        stderr: 'Compilation Error:\n' + compileRes.stderr,
        exitCode: compileRes.exitCode,
        timedOut: false,
        timeMs: compileRes.timeMs,
      };
    }
    // Execution step
    return executeProcess(binPath, [], stdin, dir, Date.now());
  }

  if (language === 'java') {
    if (!localJavac || !localJava) {
      return { stdout: '', stderr: 'Java compiler (javac/java) is not installed on the server host.', exitCode: 1, timedOut: false, timeMs: 0 };
    }
    const srcPath = path.join(dir, 'Main.java');
    await fs.writeFile(srcPath, code, 'utf8');

    const compileRes = await executeProcess(localJavac, ['-d', dir, srcPath], '', dir, t0);
    if (compileRes.exitCode !== 0) {
      return {
        stdout: compileRes.stdout,
        stderr: 'Compilation Error:\n' + compileRes.stderr,
        exitCode: compileRes.exitCode,
        timedOut: false,
        timeMs: compileRes.timeMs,
      };
    }
    return executeProcess(localJava, ['-cp', dir, 'Main'], stdin, dir, Date.now());
  }

  return { stdout: '', stderr: `Unsupported language: ${language}`, exitCode: 1, timedOut: false, timeMs: 0 };
}

function executeProcess(cmd, args, stdin, cwd, t0) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    let p;
    try {
      p = spawn(cmd, args, { cwd, shell: false });
    } catch (err) {
      return resolve({ stdout: '', stderr: err.message, exitCode: 1, timedOut: false, timeMs: Date.now() - t0 });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        p.kill('SIGKILL');
      } catch {}
    }, 10000);

    p.stdout?.on('data', d => stdout = cap(stdout, d.toString()));
    p.stderr?.on('data', d => stderr = cap(stderr, d.toString()));

    p.on('error', (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + '\n' + err.message, exitCode: 1, timedOut: false, timeMs: Date.now() - t0 });
    });

    if (stdin) {
      try {
        p.stdin.write(String(stdin).slice(0, 64 * 1024));
        p.stdin.end();
      } catch {}
    } else {
      try { p.stdin.end(); } catch {}
    }

    p.on('close', (code) => {
      clearTimeout(timer);
      const outStderr = timedOut ? stderr + '\nTime limit exceeded (10s)' : stderr;
      resolve({
        stdout,
        stderr: outStderr,
        exitCode: code ?? (timedOut ? 124 : 0),
        timedOut,
        timeMs: Date.now() - t0,
      });
    });
  });
}

async function runDocker(cfg, code, stdin, dir) {
  const id = crypto.randomUUID();
  const name = 'cm-' + id;
  await fs.writeFile(path.join(dir, cfg.file), code, 'utf8');

  const args = [
    'run', '--rm', '-i', '--name', name, '--network', 'none',
    '--memory', '256m', '--memory-swap', '256m',
    '--cpus', '0.5', '--pids-limit', '64', '--read-only',
    '--tmpfs', '/tmp:exec,size=64m', '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges', '--user', '65534',
    '-v', `${dir}:/work:ro`, '-w', '/work',
    cfg.img, 'sh', '-c', cfg.cmd
  ];

  const t0 = Date.now();
  let stdout = '';
  let stderr = '';
  let timedOut = false;

  return new Promise((resolve) => {
    const p = spawn('docker', args);
    const timer = setTimeout(() => {
      timedOut = true;
      spawn('docker', ['rm', '-f', name]);
    }, 10000);

    p.stdout.on('data', d => stdout = cap(stdout, d.toString()));
    p.stderr.on('data', d => stderr = cap(stderr, d.toString()));
    p.stdin.on('error', () => {});

    try {
      p.stdin.end(String(stdin).slice(0, 64 * 1024));
    } catch {}

    p.on('error', (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: err.message, exitCode: 1, timedOut: false, timeMs: Date.now() - t0 });
    });

    p.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        stdout,
        stderr: timedOut ? stderr + '\nTime limit exceeded (10s)' : stderr,
        exitCode: code ?? (timedOut ? 124 : 0),
        timedOut,
        timeMs: Date.now() - t0,
      });
    });
  });
}

app.post('/run', async (req, res) => {
  const secret = req.get('x-secret');
  if (secret !== EXECUTOR_SECRET) {
    return res.status(401).json({ error: 'Unauthorized: Invalid x-secret' });
  }

  const { language, code = '', stdin = '' } = req.body;
  if (!language || typeof code !== 'string') {
    return res.status(400).json({ error: 'Missing language or invalid code string' });
  }

  const id = crypto.randomUUID();
  const dir = path.join(RUN_DIR, id);

  try {
    await fs.mkdir(dir, { recursive: true });
    try { await fs.chmod(dir, 0o755); } catch {}

    let result;
    if (hasDocker && DOCKER_LANGS[language]) {
      result = await runDocker(DOCKER_LANGS[language], code, stdin, dir);
    } else {
      result = await runLocal(language, code, stdin, dir);
    }

    res.json(result);
  } catch (err) {
    console.error('[Executor error]', err);
    res.status(500).json({ error: err.message || 'Execution failed' });
  } finally {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch {}
  }
});

app.listen(PORT, () => {
  console.log(`[Executor] Server listening on port ${PORT}`);
});
