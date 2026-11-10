import express, { Request, Response, NextFunction } from 'express';
import http from 'http';
import crypto from 'crypto';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { WebSocketServer } from 'ws';
import * as Y from 'yjs';
import { setupWSConnection, setPersistence } from 'y-websocket/bin/utils';
import { processAIAssist, processAIMockInterview } from './aiService';
import { GitHubService } from './githubService';

// Load .env if present
try {
  if (typeof (process as any).loadEnvFile === 'function') {
    (process as any).loadEnvFile('.env');
  }
} catch {}

const JWT = process.env.JWT_SECRET || 'codemeet-super-secret-jwt-key-for-local-development-must-be-long-and-secure';
const EXECUTOR_URL = process.env.EXECUTOR_URL || 'http://localhost:4001';
const EXECUTOR_SECRET = process.env.EXECUTOR_SECRET || 'codemeet-executor-secret-dev';
const PORT = Number(process.env.PORT) || 4000;

const prisma = new PrismaClient();
const app = express();
app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
  cors({
    origin: (origin, callback) => callback(null, true),
    credentials: true,
  }),
  express.json({ limit: '5mb' })
);

app.use('/api', rateLimit({ windowMs: 60_000, limit: 1000 }));
app.get('/health', (_, r) => r.json({ ok: true, timestamp: new Date().toISOString() }));
app.get('/', (_, r) =>
  r.json({
    ok: true,
    service: 'CodeMeet Real-Time Backend API',
    status: 'ONLINE',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      auth: '/api/v1/auth',
      rooms: '/api/v1/rooms',
      ai: '/api/v1/ai',
    },
    docs: 'https://github.com/01Harsh01/codemeet',
  })
);

type Auth = Request & { uid: string };
const sign = (uid: string) => jwt.sign({ uid }, JWT, { expiresIn: '7d' });
const verify = (t?: string) => {
  try {
    return (jwt.verify(t || '', JWT) as any).uid as string;
  } catch {
    return null;
  }
};

const auth = (req: Request, res: Response, next: NextFunction) => {
  const uid = verify(req.headers.authorization?.replace('Bearer ', ''));
  if (!uid) return res.status(401).json({ error: 'Unauthorized' });
  (req as Auth).uid = uid;
  next();
};

const wrap = (fn: (req: Auth, res: Response) => Promise<any>) => (req: Request, res: Response, next: NextFunction) =>
  fn(req as Auth, res).catch(next);

const member = (roomId: string, userId: string) =>
  prisma.roomParticipant.findUnique({ where: { roomId_userId: { roomId, userId } } });

const creds = z.object({ email: z.string().email(), password: z.string().min(8).max(100) });
const authLimit = rateLimit({ windowMs: 15 * 60_000, limit: 60 });

// ----------------------------------------------------
// Authentication Endpoints
// ----------------------------------------------------
app.post('/api/v1/auth/register', authLimit, wrap(async (req, res) => {
  const d = creds.extend({ name: z.string().min(1).max(50) }).parse(req.body);
  if (await prisma.user.findUnique({ where: { email: d.email } })) {
    return res.status(409).json({ error: 'Email already registered' });
  }
  const u = await prisma.user.create({
    data: { email: d.email, name: d.name, passwordHash: await bcrypt.hash(d.password, 12) },
  });
  res.json({ token: sign(u.id), user: { id: u.id, name: u.name, email: u.email } });
}));

app.post('/api/v1/auth/login', authLimit, wrap(async (req, res) => {
  const d = creds.parse(req.body);
  const u = await prisma.user.findUnique({ where: { email: d.email } });
  if (!u || !(await bcrypt.compare(d.password, u.passwordHash))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  res.json({ token: sign(u.id), user: { id: u.id, name: u.name, email: u.email } });
}));

app.get('/api/v1/auth/me', auth, wrap(async (req, res) => {
  const u = await prisma.user.findUnique({
    where: { id: req.uid },
    select: {
      id: true,
      name: true,
      email: true,
      githubUsername: true,
      createdAt: true,
      _count: { select: { rooms: true, messages: true, contestEntries: true } },
    },
  });
  if (!u) return res.status(404).json({ error: 'User not found' });
  res.json(u);
}));

// ----------------------------------------------------
// Room & Workspace Management
// ----------------------------------------------------
app.post('/api/v1/rooms', auth, wrap(async (req, res) => {
  const d = z
    .object({
      name: z.string().min(1).max(100),
      isPublic: z.boolean().default(false),
      language: z.enum(['python', 'javascript', 'cpp', 'java']).default('python'),
      problemId: z.string().optional().nullable(),
      problemData: z.string().optional().nullable(),
      sessionType: z.enum(['COLLAB', 'INTERVIEW', 'CONTEST']).default('COLLAB'),
    })
    .parse(req.body);

  const id = crypto.randomBytes(5).toString('hex');
  const room = await prisma.room.create({
    data: {
      ...d,
      id,
      hostId: req.uid,
      participants: { create: { userId: req.uid, role: 'HOST' } },
    },
  });
  res.json(room);
}));

app.get('/api/v1/rooms', auth, wrap(async (req, res) => {
  const rows = await prisma.roomParticipant.findMany({
    where: { userId: req.uid },
    include: {
      room: {
        include: {
          host: { select: { name: true, email: true } },
          _count: { select: { participants: true, messages: true, submissions: true } },
        },
      },
    },
    orderBy: { joinedAt: 'desc' },
    take: 50,
  });
  res.json(
    rows.map((r: any) => ({
      ...r.room,
      role: r.role,
      participantCount: r.room._count?.participants || 1,
      messageCount: r.room._count?.messages || 0,
      submissionCount: r.room._count?.submissions || 0,
    }))
  );
}));

app.get('/api/v1/rooms/public', auth, wrap(async (_req, res) => {
  const publicRooms = await prisma.room.findMany({
    where: { isPublic: true },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: {
      host: { select: { name: true } },
      _count: { select: { participants: true, submissions: true } },
    },
  });
  res.json(publicRooms);
}));

app.get('/api/v1/rooms/:id', auth, wrap(async (req, res) => {
  const room = await prisma.room.findUnique({
    where: { id: req.params.id },
    include: {
      host: { select: { id: true, name: true, email: true } },
      report: true,
    },
  });
  if (!room) return res.status(404).json({ error: 'Room not found' });
  await prisma.roomParticipant.upsert({
    where: { roomId_userId: { roomId: room.id, userId: req.uid } },
    update: {},
    create: { roomId: room.id, userId: req.uid, role: room.hostId === req.uid ? 'HOST' : 'PARTICIPANT' },
  });
  res.json(room);
}));

app.patch('/api/v1/rooms/:id', auth, wrap(async (req, res) => {
  const room = await prisma.room.findUnique({ where: { id: req.params.id } });
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const schema = z.object({
    name: z.string().min(1).max(100).optional(),
    language: z.enum(['python', 'javascript', 'cpp', 'java']).optional(),
    isPublic: z.boolean().optional(),
    problemId: z.string().optional().nullable(),
    problemData: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    isLocked: z.boolean().optional(),
    recordingConsent: z.boolean().optional(),
  });
  const data = schema.parse(req.body);
  const updated = await prisma.room.update({
    where: { id: req.params.id },
    data,
  });
  io.to(req.params.id).emit('room:updated', updated);
  res.json(updated);
}));

app.delete('/api/v1/rooms/:id', auth, wrap(async (req, res) => {
  const r = await prisma.room.findUnique({ where: { id: req.params.id } });
  if (!r || r.hostId !== req.uid) return res.status(403).json({ error: 'Only the host can delete this room' });
  await prisma.room.delete({ where: { id: r.id } });
  io.to(r.id).emit('room:deleted');
  res.json({ ok: true });
}));

// Lock / Unlock editing permissions
app.patch('/api/v1/rooms/:id/lock', auth, wrap(async (req, res) => {
  const r = await prisma.room.findUnique({ where: { id: req.params.id } });
  if (!r || r.hostId !== req.uid) return res.status(403).json({ error: 'Only the host/interviewer can lock code' });
  const updated = await prisma.room.update({
    where: { id: req.params.id },
    data: { isLocked: !r.isLocked },
  });
  io.to(r.id).emit('editor:lock_status', { isLocked: updated.isLocked });
  res.json({ isLocked: updated.isLocked });
}));

app.get('/api/v1/rooms/:id/participants', auth, wrap(async (req, res) => {
  if (!(await member(req.params.id, req.uid))) return res.status(403).json({ error: 'Forbidden' });
  const participants = await prisma.roomParticipant.findMany({
    where: { roomId: req.params.id },
    include: { user: { select: { id: true, name: true, email: true } } },
    orderBy: { joinedAt: 'asc' },
  });
  res.json(participants);
}));

app.get('/api/v1/rooms/:id/messages', auth, wrap(async (req, res) => {
  if (!(await member(req.params.id, req.uid))) return res.status(403).json({ error: 'Forbidden' });
  const m = await prisma.message.findMany({
    where: {
      roomId: req.params.id,
      OR: [{ recipientId: null }, { recipientId: req.uid }, { userId: req.uid }],
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    include: { user: { select: { id: true, name: true } } },
  });
  res.json(m.reverse());
}));

app.get('/api/v1/rooms/:id/submissions', auth, wrap(async (req, res) => {
  if (!(await member(req.params.id, req.uid))) return res.status(403).json({ error: 'Forbidden' });
  const submissions = await prisma.submission.findMany({
    where: { roomId: req.params.id },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  res.json(submissions);
}));

// ----------------------------------------------------
// 1. AI Coding Assistant & Mock Interviewer
// ----------------------------------------------------
app.get('/api/v1/ai/config', auth, wrap(async (req, res) => {
  res.json({
    hasGeminiEnv: !!(process.env.GEMINI_API_KEY || process.env.AI_API_KEY),
    hasGroqEnv: !!process.env.GROQ_API_KEY,
    hasOpenAIEnv: !!process.env.OPENAI_API_KEY,
    hasOpenRouterEnv: !!process.env.OPENROUTER_API_KEY,
  });
}));

app.post('/api/v1/ai/test-connection', auth, wrap(async (req, res) => {
  const schema = z.object({
    provider: z.enum(['gemini', 'groq', 'openai', 'openrouter', 'ollama', 'auto']).default('auto'),
    apiKey: z.string().optional(),
    model: z.string().optional(),
  });
  const data = schema.parse(req.body);
  const start = Date.now();
  const result = await processAIAssist({
    action: 'custom',
    language: 'python',
    prompt: 'Reply with "OK" only.',
    provider: data.provider,
    apiKey: data.apiKey,
    model: data.model,
  });
  const latencyMs = Date.now() - start;
  if (result.text && !result.text.startsWith('⚠️')) {
    res.json({ success: true, latencyMs, providerUsed: result.providerUsed || data.provider });
  } else {
    res.status(400).json({ success: false, error: result.text });
  }
}));

app.post('/api/v1/ai/assist', auth, wrap(async (req, res) => {
  const schema = z.object({
    action: z.enum(['explain', 'debug', 'optimize', 'testcases', 'hints', 'complexity', 'runtime_error', 'custom', 'generate']).default('explain'),
    language: z.string().default('python'),
    code: z.string().max(100_000).default(''),
    prompt: z.string().optional(),
    context: z.string().optional(),
    errorOutput: z.string().optional(),
    provider: z.enum(['gemini', 'groq', 'openai', 'openrouter', 'ollama', 'auto']).optional(),
    apiKey: z.string().optional(),
    model: z.string().optional(),
  });
  const data = schema.parse(req.body);
  
  // Extract custom LLM options from headers if not explicitly in body
  const provider = data.provider || (req.headers['x-ai-provider'] as any) || undefined;
  const apiKey = data.apiKey || (req.headers['x-ai-key'] as string) || undefined;
  const model = data.model || (req.headers['x-ai-model'] as string) || undefined;

  const result = await processAIAssist({
    ...data,
    provider,
    apiKey,
    model,
  });
  res.json(result);
}));

app.post('/api/v1/ai/mock-interview', auth, wrap(async (req, res) => {
  const schema = z.object({
    topic: z.string().default('DSA'),
    messageHistory: z.array(z.object({ role: z.enum(['user', 'assistant', 'system']), content: z.string() })),
    candidateCode: z.string().optional(),
    mode: z.enum(['interview', 'evaluate']).optional(),
    provider: z.enum(['gemini', 'groq', 'openai', 'openrouter', 'ollama', 'auto']).optional(),
    apiKey: z.string().optional(),
    model: z.string().optional(),
  });
  const data = schema.parse(req.body);

  const provider = data.provider || (req.headers['x-ai-provider'] as any) || undefined;
  const apiKey = data.apiKey || (req.headers['x-ai-key'] as string) || undefined;
  const model = data.model || (req.headers['x-ai-model'] as string) || undefined;

  const result = await processAIMockInterview({
    ...data,
    provider,
    apiKey,
    model,
  });
  res.json(result);
}));

// ----------------------------------------------------
// 2. Advanced Interview Reports & Notes
// ----------------------------------------------------
app.post('/api/v1/rooms/:id/report', auth, wrap(async (req, res) => {
  const room = await prisma.room.findUnique({ where: { id: req.params.id } });
  if (!room || room.hostId !== req.uid) return res.status(403).json({ error: 'Only interviewer can file reports' });

  const schema = z.object({
    candidateId: z.string(),
    candidateName: z.string(),
    rating: z.number().min(1).max(5),
    feedback: z.string(),
    strengths: z.string(),
    improvements: z.string(),
    decision: z.enum(['PENDING', 'HIRE', 'STRONG_HIRE', 'NO_HIRE']),
    isReleased: z.boolean().default(false),
  });
  const data = schema.parse(req.body);

  const report = await prisma.interviewReport.upsert({
    where: { roomId: req.params.id },
    update: data,
    create: {
      ...data,
      roomId: req.params.id,
      interviewerId: req.uid,
    },
  });

  io.to(req.params.id).emit('interview:report_updated', report);
  res.json(report);
}));

app.get('/api/v1/rooms/:id/report', auth, wrap(async (req, res) => {
  const room = await prisma.room.findUnique({ where: { id: req.params.id } });
  if (!room) return res.status(404).json({ error: 'Room not found' });

  const report = await prisma.interviewReport.findUnique({ where: { roomId: req.params.id } });
  if (!report) return res.json(null);

  // Candidates only see report if released
  if (room.hostId !== req.uid && !report.isReleased) {
    return res.status(403).json({ error: 'Report pending interviewer release' });
  }
  res.json(report);
}));

app.patch('/api/v1/rooms/:id/report/release', auth, wrap(async (req, res) => {
  const room = await prisma.room.findUnique({ where: { id: req.params.id } });
  if (!room || room.hostId !== req.uid) return res.status(403).json({ error: 'Forbidden' });

  const report = await prisma.interviewReport.update({
    where: { roomId: req.params.id },
    data: { isReleased: true },
  });
  io.to(req.params.id).emit('interview:report_released', report);
  res.json(report);
}));

// ----------------------------------------------------
// 3. Collaborative Whiteboard & Architecture Mode
// ----------------------------------------------------
app.get('/api/v1/rooms/:id/whiteboard', auth, wrap(async (req, res) => {
  const room = await prisma.room.findUnique({
    where: { id: req.params.id },
    select: { whiteboardData: true },
  });
  if (!room) return res.status(404).json({ error: 'Room not found' });
  res.json({ data: room.whiteboardData || null });
}));

app.put('/api/v1/rooms/:id/whiteboard', auth, wrap(async (req, res) => {
  const schema = z.object({ data: z.string() });
  const { data } = schema.parse(req.body);
  await prisma.room.update({
    where: { id: req.params.id },
    data: { whiteboardData: data },
  });
  res.json({ ok: true });
}));

// ----------------------------------------------------
// 4. GitHub Integration
// ----------------------------------------------------
app.post('/api/v1/github/token', auth, wrap(async (req, res) => {
  const schema = z.object({ token: z.string().min(10) });
  const { token } = schema.parse(req.body);

  const profile = await GitHubService.getUserProfile(token);
  await prisma.user.update({
    where: { id: req.uid },
    data: { githubToken: token, githubUsername: profile.login, avatarUrl: profile.avatar_url },
  });
  res.json({ username: profile.login, avatar: profile.avatar_url });
}));

app.get('/api/v1/github/repos', auth, wrap(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.uid }, select: { githubToken: true } });
  if (!user?.githubToken) return res.status(400).json({ error: 'GitHub account not connected' });
  const repos = await GitHubService.listRepositories(user.githubToken);
  res.json(repos);
}));

app.get('/api/v1/github/contents', auth, wrap(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.uid }, select: { githubToken: true } });
  if (!user?.githubToken) return res.status(400).json({ error: 'GitHub account not connected' });

  const owner = req.query.owner as string;
  const repo = req.query.repo as string;
  const path = (req.query.path as string) || '';
  if (!owner || !repo) return res.status(400).json({ error: 'Missing owner or repo' });

  const items = await GitHubService.getDirectoryContents(user.githubToken, owner, repo, path);
  res.json(items);
}));

app.get('/api/v1/github/file', auth, wrap(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.uid }, select: { githubToken: true } });
  if (!user?.githubToken) return res.status(400).json({ error: 'GitHub account not connected' });

  const owner = req.query.owner as string;
  const repo = req.query.repo as string;
  const path = req.query.path as string;
  if (!owner || !repo || !path) return res.status(400).json({ error: 'Missing owner, repo, or path' });

  const fileData = await GitHubService.getFileContent(user.githubToken, owner, repo, path);
  res.json(fileData);
}));

app.post('/api/v1/github/commit', auth, wrap(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.uid }, select: { githubToken: true } });
  if (!user?.githubToken) return res.status(400).json({ error: 'GitHub account not connected' });

  const schema = z.object({
    owner: z.string(),
    repo: z.string(),
    path: z.string(),
    content: z.string(),
    message: z.string().min(1),
    branch: z.string().default('main'),
    sha: z.string().optional(),
  });
  const d = schema.parse(req.body);
  const result = await GitHubService.commitFile(user.githubToken, d.owner, d.repo, d.path, d.content, d.message, d.branch, d.sha);
  res.json(result);
}));

app.get('/api/v1/github/commits', auth, wrap(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.uid }, select: { githubToken: true } });
  if (!user?.githubToken) return res.status(400).json({ error: 'GitHub account not connected' });

  const owner = req.query.owner as string;
  const repo = req.query.repo as string;
  if (!owner || !repo) return res.status(400).json({ error: 'Missing owner or repo' });

  const commits = await GitHubService.listCommits(user.githubToken, owner, repo);
  res.json(commits);
}));

// ----------------------------------------------------
// 5. Code Comments & Line Discussions
// ----------------------------------------------------
app.get('/api/v1/rooms/:id/comments', auth, wrap(async (req, res) => {
  if (!(await member(req.params.id, req.uid))) return res.status(403).json({ error: 'Forbidden' });
  const comments = await prisma.codeComment.findMany({
    where: { roomId: req.params.id },
    orderBy: { createdAt: 'asc' },
  });
  res.json(comments);
}));

app.post('/api/v1/rooms/:id/comments', auth, wrap(async (req, res) => {
  if (!(await member(req.params.id, req.uid))) return res.status(403).json({ error: 'Forbidden' });
  const user = await prisma.user.findUnique({ where: { id: req.uid }, select: { name: true } });

  const schema = z.object({
    lineNumber: z.number().int().min(1),
    comment: z.string().min(1).max(1000),
  });
  const { lineNumber, comment } = schema.parse(req.body);

  const newComment = await prisma.codeComment.create({
    data: {
      roomId: req.params.id,
      userId: req.uid,
      userName: user?.name || 'Anonymous',
      lineNumber,
      comment,
    },
  });

  io.to(req.params.id).emit('comment:added', newComment);
  res.json(newComment);
}));

app.patch('/api/v1/rooms/:id/comments/:commentId/resolve', auth, wrap(async (req, res) => {
  const c = await prisma.codeComment.findUnique({ where: { id: req.params.commentId } });
  if (!c) return res.status(404).json({ error: 'Comment not found' });

  const updated = await prisma.codeComment.update({
    where: { id: req.params.commentId },
    data: { status: 'RESOLVED' },
  });
  io.to(req.params.id).emit('comment:resolved', updated);
  res.json(updated);
}));

// ----------------------------------------------------
// 7. Coding Battles & Leaderboards
// ----------------------------------------------------
app.get('/api/v1/contests', auth, wrap(async (_req, res) => {
  const contests = await prisma.contest.findMany({
    orderBy: { createdAt: 'desc' },
    take: 30,
    include: {
      _count: { select: { submissions: true } },
    },
  });
  res.json(contests);
}));

app.post('/api/v1/contests', auth, wrap(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.uid }, select: { name: true } });
  const schema = z.object({
    title: z.string().min(1).max(100),
    description: z.string().default('Live Competitive Coding Battle'),
    durationMinutes: z.number().default(45),
    problemId: z.string(),
    isPublic: z.boolean().default(true),
  });
  const data = schema.parse(req.body);

  const contest = await prisma.contest.create({
    data: {
      ...data,
      creatorId: req.uid,
      creatorName: user?.name || 'Anonymous',
    },
  });
  res.json(contest);
}));

app.get('/api/v1/contests/:id', auth, wrap(async (req, res) => {
  const contest = await prisma.contest.findUnique({
    where: { id: req.params.id },
    include: {
      submissions: {
        orderBy: [{ score: 'desc' }, { timeMs: 'asc' }],
        take: 50,
      },
    },
  });
  if (!contest) return res.status(404).json({ error: 'Contest not found' });
  res.json(contest);
}));

app.post('/api/v1/contests/:id/submit', auth, wrap(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.uid }, select: { name: true } });
  const contest = await prisma.contest.findUnique({ where: { id: req.params.id } });
  if (!contest) return res.status(404).json({ error: 'Contest not found' });

  const schema = z.object({
    language: z.enum(['python', 'javascript', 'cpp', 'java']),
    code: z.string().max(100_000),
    testCases: z.array(z.object({ input: z.string(), expectedOutput: z.string() })).default([]),
  });
  const d = schema.parse(req.body);

  // Evaluate test cases with executor
  let passedCases = 0;
  const totalCases = d.testCases.length || 1;
  let totalTime = 0;

  for (const tc of d.testCases) {
    try {
      const r = await fetch(`${EXECUTOR_URL}/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-secret': EXECUTOR_SECRET },
        body: JSON.stringify({ language: d.language, code: d.code, stdin: tc.input }),
      });
      if (r.ok) {
        const out: any = await r.json();
        totalTime += out.timeMs || 0;
        const actual = (out.stdout || '').trim();
        const expected = tc.expectedOutput.trim();
        if (actual.includes(expected)) {
          passedCases++;
        }
      }
    } catch {}
  }

  if (d.testCases.length === 0) {
    // If no test cases provided, single run validation
    try {
      const r = await fetch(`${EXECUTOR_URL}/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-secret': EXECUTOR_SECRET },
        body: JSON.stringify({ language: d.language, code: d.code, stdin: '' }),
      });
      const out: any = await r.json();
      totalTime = out.timeMs || 50;
      passedCases = out.exitCode === 0 ? 1 : 0;
    } catch {}
  }

  const score = Math.round((passedCases / totalCases) * 100);

  const sub = await prisma.contestSubmission.create({
    data: {
      contestId: req.params.id,
      userId: req.uid,
      userName: user?.name || 'Anonymous',
      language: d.language,
      code: d.code,
      score,
      passedCases,
      totalCases,
      timeMs: totalTime,
    },
  });

  io.emit('contest:submission', { contestId: req.params.id, submission: sub });
  res.json(sub);
}));

// ----------------------------------------------------
// 8. Advanced Analytics Dashboard
// ----------------------------------------------------
app.get('/api/v1/analytics', auth, wrap(async (req, res) => {
  const [totalRooms, userSubmissions, userReports, contestSubs] = await Promise.all([
    prisma.roomParticipant.count({ where: { userId: req.uid } }),
    prisma.submission.findMany({ where: { userId: req.uid }, orderBy: { createdAt: 'desc' }, take: 100 }),
    prisma.interviewReport.findMany({ where: { candidateId: req.uid } }),
    prisma.contestSubmission.findMany({ where: { userId: req.uid } }),
  ]);

  const langMap: Record<string, { count: number; success: number }> = {};
  let totalTimeMs = 0;
  let successfulRuns = 0;

  userSubmissions.forEach((s) => {
    if (!langMap[s.language]) {
      langMap[s.language] = { count: 0, success: 0 };
    }
    langMap[s.language].count++;
    totalTimeMs += s.timeMs;
    const isSuccess = s.stderr.trim() === '';
    if (isSuccess) {
      successfulRuns++;
      langMap[s.language].success++;
    }
  });

  const failedRuns = userSubmissions.length - successfulRuns;
  const successRate = userSubmissions.length > 0 ? Math.round((successfulRuns / userSubmissions.length) * 100) : 0;
  const avgTimeMs = userSubmissions.length > 0 ? Math.round(totalTimeMs / userSubmissions.length) : 0;

  // Real Weekly activity metrics (past 7 days)
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  let last7DaysCount = 0;
  let prev7DaysCount = 0;

  const weeklyActivity = Array.from({ length: 7 }, (_, i) => {
    const dayStart = new Date(now - (6 - i) * dayMs);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + dayMs);
    const daySubs = userSubmissions.filter((s) => s.createdAt >= dayStart && s.createdAt < dayEnd);
    const daySuccess = daySubs.filter((s) => s.stderr.trim() === '').length;
    const dayFailed = daySubs.length - daySuccess;
    last7DaysCount += daySubs.length;

    return {
      day: dayStart.toLocaleDateString('en-US', { weekday: 'short' }),
      date: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      success: daySuccess,
      failed: dayFailed,
      total: daySubs.length,
    };
  });

  // Calculate prior 7-day period for real trend calculation
  const prevPeriodStart = new Date(now - 14 * dayMs);
  const prevPeriodEnd = new Date(now - 7 * dayMs);
  prev7DaysCount = userSubmissions.filter((s) => s.createdAt >= prevPeriodStart && s.createdAt < prevPeriodEnd).length;

  let trendPercent = 0;
  if (prev7DaysCount > 0) {
    trendPercent = Math.round(((last7DaysCount - prev7DaysCount) / prev7DaysCount) * 100);
  } else if (last7DaysCount > 0) {
    trendPercent = 100;
  }

  const languageStats = Object.entries(langMap).map(([lang, stats]) => ({
    language: lang,
    count: stats.count,
    successCount: stats.success,
    successRate: stats.count > 0 ? Math.round((stats.success / stats.count) * 100) : 0,
  }));

  res.json({
    totalSessions: totalRooms,
    totalSubmissions: userSubmissions.length,
    successfulRuns,
    failedRuns,
    successRate,
    avgExecutionTimeMs: avgTimeMs,
    trendPercent,
    statusDistribution: {
      success: successfulRuns,
      failed: failedRuns,
      total: userSubmissions.length,
    },
    languageStats,
    weeklyActivity,
    interviewCount: userReports.length,
    contestCount: contestSubs.length,
  });
}));

// ----------------------------------------------------
// 11. Session Recording, Snapshots & Replay
// ----------------------------------------------------
app.post('/api/v1/rooms/:id/snapshots', auth, wrap(async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.uid }, select: { name: true } });
  const schema = z.object({
    code: z.string().max(100_000),
    label: z.string().optional(),
  });
  const { code, label } = schema.parse(req.body);

  const snapshot = await prisma.codeSnapshot.create({
    data: {
      roomId: req.params.id,
      userId: req.uid,
      userName: user?.name || 'Anonymous',
      code,
      label,
    },
  });
  res.json(snapshot);
}));

app.get('/api/v1/rooms/:id/snapshots', auth, wrap(async (req, res) => {
  if (!(await member(req.params.id, req.uid))) return res.status(403).json({ error: 'Forbidden' });
  const snapshots = await prisma.codeSnapshot.findMany({
    where: { roomId: req.params.id },
    orderBy: { createdAt: 'asc' },
    take: 100,
  });
  res.json(snapshots);
}));

app.get('/api/v1/rooms/:id/export-summary', auth, wrap(async (req, res) => {
  if (!(await member(req.params.id, req.uid))) return res.status(403).json({ error: 'Forbidden' });
  const [room, messages, submissions, report] = await Promise.all([
    prisma.room.findUnique({ where: { id: req.params.id } }),
    prisma.message.findMany({ where: { roomId: req.params.id }, orderBy: { createdAt: 'asc' } }),
    prisma.submission.findMany({ where: { roomId: req.params.id }, orderBy: { createdAt: 'asc' } }),
    prisma.interviewReport.findUnique({ where: { roomId: req.params.id } }),
  ]);

  res.json({
    sessionInfo: room,
    messagesCount: messages.length,
    submissionsCount: submissions.length,
    report,
    exportedAt: new Date().toISOString(),
  });
}));

// ----------------------------------------------------
// 12. Notifications System
// ----------------------------------------------------
app.get('/api/v1/notifications', auth, wrap(async (req, res) => {
  const notifications = await prisma.notification.findMany({
    where: { userId: req.uid },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  res.json(notifications);
}));

app.patch('/api/v1/notifications/:id/read', auth, wrap(async (req, res) => {
  const n = await prisma.notification.update({
    where: { id: req.params.id },
    data: { isRead: true },
  });
  res.json(n);
}));

app.patch('/api/v1/notifications/read-all', auth, wrap(async (req, res) => {
  await prisma.notification.updateMany({
    where: { userId: req.uid, isRead: false },
    data: { isRead: true },
  });
  res.json({ ok: true });
}));

// ----------------------------------------------------
// Code Runner with Sandboxing & Persisted Submissions
// ----------------------------------------------------
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    credentials: true,
  },
});

app.post('/api/v1/rooms/:id/run', auth, rateLimit({ windowMs: 60_000, limit: 30 }), wrap(async (req, res) => {
  if (!(await member(req.params.id, req.uid))) return res.status(403).json({ error: 'Forbidden' });
  const d = z
    .object({
      language: z.enum(['python', 'javascript', 'cpp', 'java']),
      code: z.string().max(100_000),
      stdin: z.string().max(10_000).default(''),
    })
    .parse(req.body);

  let out: any;
  try {
    const r = await fetch(`${EXECUTOR_URL}/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-secret': EXECUTOR_SECRET },
      body: JSON.stringify(d),
    });
    if (!r.ok) {
      const errJson = await r.json().catch(() => ({}));
      return res.status(502).json({ error: errJson.error || 'Executor returned an error' });
    }
    out = await r.json();
  } catch (err: any) {
    return res.status(502).json({
      error: `Could not reach executor service at ${EXECUTOR_URL}. Please ensure the executor service is running.`,
    });
  }

  const user = await prisma.user.findUnique({ where: { id: req.uid }, select: { name: true } });
  const executionPayload = {
    ...out,
    language: d.language,
    executedBy: user?.name || 'Someone',
    timestamp: new Date().toISOString(),
  };

  await prisma.submission.create({
    data: {
      roomId: req.params.id,
      userId: req.uid,
      language: d.language,
      code: d.code,
      stdout: out.stdout || '',
      stderr: out.stderr || '',
      timeMs: out.timeMs || 0,
    },
  });

  // Auto-record snapshot for session replay
  await prisma.codeSnapshot
    .create({
      data: {
        roomId: req.params.id,
        userId: req.uid,
        userName: user?.name || 'Someone',
        code: d.code,
        label: `Execution run (${d.language})`,
      },
    })
    .catch(() => {});

  io.to(req.params.id).emit('code:execution', executionPayload);
  res.json(executionPayload);
}));

app.use((e: any, _q: Request, res: Response, _n: NextFunction) => {
  if (e instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input', details: e.flatten() });
  console.error(JSON.stringify({ level: 'error', msg: e.message, stack: e.stack }));
  res.status(500).json({ error: e.message || 'Internal server error' });
});

// Redis setup (optional for local standalone dev)
if (process.env.REDIS_URL) {
  try {
    const pub = createClient({ url: process.env.REDIS_URL });
    const sub = pub.duplicate();
    pub.on('error', (err) => console.warn('[Redis] Pub error:', err.message));
    sub.on('error', (err) => console.warn('[Redis] Sub error:', err.message));
    Promise.all([pub.connect(), sub.connect()])
      .then(() => {
        io.adapter(createAdapter(pub, sub));
        console.log('[Redis] Adapter connected successfully.');
      })
      .catch((err) => {
        console.warn('[Redis] Connection failed, running with built-in in-memory adapter:', err.message);
      });
  } catch (e: any) {
    console.warn('[Redis] Initialization skipped:', e.message);
  }
} else {
  console.log('[Backend] Running with in-memory Socket.IO adapter (no REDIS_URL specified)');
}

// Track active socket participants & state
const roomUsers = new Map<string, Map<string, { id: string; name: string }>>();
const roomTimers = new Map<string, { seconds: number; isRunning: boolean; updatedAt: number }>();

io.use((s, next) => {
  const uid = verify(s.handshake.auth?.token);
  if (!uid) return next(new Error('unauthorized'));
  s.data.uid = uid;
  next();
});

io.on('connection', (socket) => {
  // Join user's personal notification room
  socket.join(`user:${socket.data.uid}`);

  socket.on('room:join', async (roomId: string) => {
    const user = await prisma.user.findUnique({ where: { id: socket.data.uid } });
    if (!user) return;
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) return;

    await prisma.roomParticipant
      .upsert({
        where: { roomId_userId: { roomId, userId: user.id } },
        update: {},
        create: { roomId, userId: user.id, role: room.hostId === user.id ? 'HOST' : 'PARTICIPANT' },
      })
      .catch(() => {});

    socket.data.name = user.name;
    socket.data.room = roomId;
    socket.join(roomId);

    if (!roomUsers.has(roomId)) {
      roomUsers.set(roomId, new Map());
    }
    roomUsers.get(roomId)!.set(socket.id, { id: user.id, name: user.name });

    const activeList = Array.from(roomUsers.get(roomId)!.values());
    io.to(roomId).emit('room:active_users', activeList);
    socket.to(roomId).emit('participant:joined', { name: user.name, id: user.id });

    if (roomTimers.has(roomId)) {
      socket.emit('timer:state', roomTimers.get(roomId));
    }
  });

  socket.on('chat:message', async (data: { body: string; recipientId?: string; isCodeSnippet?: boolean }) => {
    const roomId = socket.data.room;
    const body = typeof data === 'string' ? data : data.body;
    const recipientId = typeof data === 'object' ? data.recipientId : undefined;
    const isCodeSnippet = typeof data === 'object' ? !!data.isCodeSnippet : false;

    if (!roomId || typeof body !== 'string' || !body.trim()) return;

    const m = await prisma.message.create({
      data: {
        roomId,
        userId: socket.data.uid,
        recipientId: recipientId || null,
        isCodeSnippet,
        body: body.slice(0, 2000),
      },
    });

    const msgPayload = {
      id: m.id,
      body: m.body,
      recipientId: m.recipientId,
      isCodeSnippet: m.isCodeSnippet,
      createdAt: m.createdAt,
      user: { id: socket.data.uid, name: socket.data.name },
    };

    if (recipientId) {
      // Private direct message
      io.to(`user:${recipientId}`).emit('chat:message', msgPayload);
      socket.emit('chat:message', msgPayload);
    } else {
      io.to(roomId).emit('chat:message', msgPayload);
    }
  });

  socket.on('message:reaction', async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
    const roomId = socket.data.room;
    if (roomId && messageId && emoji) {
      io.to(roomId).emit('message:reaction', { messageId, emoji, userId: socket.data.uid });
    }
  });

  socket.on('typing:start', () => {
    if (socket.data.room) socket.to(socket.data.room).emit('typing:start', socket.data.name);
  });

  socket.on('typing:stop', () => {
    if (socket.data.room) socket.to(socket.data.room).emit('typing:stop', socket.data.name);
  });

  socket.on('reaction:send', (emoji: string) => {
    const roomId = socket.data.room;
    if (roomId && emoji) {
      io.to(roomId).emit('reaction:received', {
        emoji,
        sender: socket.data.name,
        id: crypto.randomUUID(),
      });
    }
  });

  socket.on('timer:sync', (timerState: { seconds: number; isRunning: boolean }) => {
    const roomId = socket.data.room;
    if (roomId) {
      const state = { ...timerState, updatedAt: Date.now() };
      roomTimers.set(roomId, state);
      io.to(roomId).emit('timer:state', state);
    }
  });

  // Collaborative Whiteboard live drawing sync
  socket.on('whiteboard:draw', (drawAction: any) => {
    if (socket.data.room) {
      socket.to(socket.data.room).emit('whiteboard:draw', drawAction);
    }
  });

  // WebRTC Mesh / SFU Video Call Signaling
  socket.on('webrtc:signal', ({ to, signal }: { to: string; signal: any }) => {
    socket.to(to).emit('webrtc:signal', { from: socket.id, user: socket.data.name, signal });
  });

  socket.on('webrtc:media_toggle', (mediaState: { video: boolean; audio: boolean; screen: boolean }) => {
    if (socket.data.room) {
      socket.to(socket.data.room).emit('webrtc:peer_media', { socketId: socket.id, user: socket.data.name, ...mediaState });
    }
  });

  // Cursor following feature
  socket.on('cursor:position', (pos: { line: number; ch: number }) => {
    if (socket.data.room) {
      socket.to(socket.data.room).emit('cursor:position', { user: socket.data.name, ...pos });
    }
  });

  socket.on('disconnect', () => {
    const roomId = socket.data.room;
    if (roomId && roomUsers.has(roomId)) {
      roomUsers.get(roomId)!.delete(socket.id);
      const activeList = Array.from(roomUsers.get(roomId)!.values());
      io.to(roomId).emit('room:active_users', activeList);
      socket.to(roomId).emit('participant:left', { name: socket.data.name });
      socket.to(roomId).emit('webrtc:peer_left', { socketId: socket.id });
    }
  });
});

// Yjs persistence in SQLite/Postgres
const save = (roomId: string, doc: Y.Doc) => {
  const state = Buffer.from(Y.encodeStateAsUpdate(doc));
  return prisma.codeDocument
    .upsert({
      where: { roomId },
      update: { state },
      create: { roomId, state },
    })
    .catch(console.error);
};

setPersistence({
  bindState: async (name: string, doc: Y.Doc) => {
    try {
      const saved = await prisma.codeDocument.findUnique({ where: { roomId: name } });
      if (saved && saved.state) {
        Y.applyUpdate(doc, saved.state);
      }
    } catch (err) {
      console.error('[Yjs bindState error]', err);
    }
    let t: NodeJS.Timeout | null = null;
    doc.on('update', () => {
      if (t) clearTimeout(t);
      t = setTimeout(() => save(name, doc), 1500);
    });
  },
  writeState: async (name: string, doc: Y.Doc) => {
    await save(name, doc);
  },
});

const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', async (req, socket, head) => {
  try {
    const url = new URL(req.url || '', 'http://localhost');
    const m = url.pathname.match(/^\/yjs\/([^/?#]+)\/?$/);
    const uid = verify(url.searchParams.get('token') || '');

    if (!m || !uid) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      return socket.destroy();
    }

    const roomId = m[1];
    const room = await prisma.room.findUnique({ where: { id: roomId } });
    if (!room) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      return socket.destroy();
    }

    await prisma.roomParticipant
      .upsert({
        where: { roomId_userId: { roomId, userId: uid } },
        update: {},
        create: { roomId, userId: uid, role: room.hostId === uid ? 'HOST' : 'PARTICIPANT' },
      })
      .catch(() => {});

    wss.handleUpgrade(req, socket, head, (ws) => {
      setupWSConnection(ws, req, { docName: roomId });
    });
  } catch (err) {
    socket.write('HTTP/1.1 500 Internal Error\r\n\r\n');
    socket.destroy();
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Backend] Server listening on 0.0.0.0:${PORT}`);

  // Connect to database and sync schema in background without blocking port binding
  prisma.$connect()
    .then(() => {
      console.log('[Database] Database connection verified.');
      import('child_process').then(({ exec }) => {
        exec('npx prisma db push --skip-generate', (err, stdout, stderr) => {
          if (err) {
            console.warn('[Database Sync] Schema sync notice:', stderr || err.message);
          } else {
            console.log('[Database Sync] Prisma schema pushed successfully.');
          }
        });
      });
    })
    .catch((err) => {
      console.error('[Database] Connection notice:', err.message);
    });
});
