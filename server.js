import express from 'express';
import path from 'path';
import fs from 'fs';
import compression from 'compression';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(compression());

const DEFAULT_AVG_MINUTES = 5;
const MAX_SERVICE_SAMPLES = 100;
const DEFAULT_QUEUE_ID = 'default';
const DEFAULT_QUEUE_NAME = 'Main queue';

const queues = new Map();

function createQueueState(id, name) {
  return {
    id,
    name,
    createdAt: Date.now(),
    queue: [], // [{ id, name, username, joinedAt }]
    serviceDurations: [],
    avgServiceMinutes: DEFAULT_AVG_MINUTES,
  };
}

function ensureQueue(queueId, name) {
  const id = queueId || DEFAULT_QUEUE_ID;
  if (!queues.has(id)) {
    queues.set(id, createQueueState(id, name || (id === DEFAULT_QUEUE_ID ? DEFAULT_QUEUE_NAME : id)));
  } else if (name && !queues.get(id).name) {
    queues.get(id).name = name;
  }
  return queues.get(id);
}

function recordServiceDuration(queueState, durationMs) {
  if (!queueState || !Number.isFinite(durationMs) || durationMs <= 0) return;
  queueState.serviceDurations.push(durationMs);
  if (queueState.serviceDurations.length > MAX_SERVICE_SAMPLES) {
    queueState.serviceDurations.shift();
  }
  const total = queueState.serviceDurations.reduce((sum, value) => sum + value, 0);
  const avgMs = total / queueState.serviceDurations.length;
  queueState.avgServiceMinutes = Number.isFinite(avgMs)
    ? Math.max(0.1, Number((avgMs / 60000).toFixed(1)))
    : DEFAULT_AVG_MINUTES;
}

function serializeQueueMeta(queueState) {
  return {
    id: queueState.id,
    name: queueState.name,
    size: queueState.queue.length,
    avgServiceMinutes: queueState.avgServiceMinutes,
    createdAt: queueState.createdAt,
  };
}

function slugifyName(value) {
  const base = (value || '').toString().trim().toLowerCase();
  if (!base) return '';
  return base
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

ensureQueue(DEFAULT_QUEUE_ID, DEFAULT_QUEUE_NAME);

app.get('/api/queues', (_req, res) => {
  const list = Array.from(queues.values()).map(serializeQueueMeta);
  res.json({ queues: list });
});

app.post('/api/queues', (req, res) => {
  let { name, id } = req.body || {};
  name = typeof name === 'string' ? name.trim() : '';
  if (!name) {
    return res.status(400).json({ ok: false, error: 'queue name required' });
  }
  let queueId = typeof id === 'string' && id.trim() ? id.trim().toLowerCase() : slugifyName(name);
  if (!queueId) {
    queueId = `queue-${Date.now().toString(36)}`;
  }
  if (queues.has(queueId)) {
    const base = queueId;
    let attempt = 1;
    while (queues.has(`${base}-${attempt}`)) {
      attempt += 1;
    }
    queueId = `${base}-${attempt}`;
  }
  const queueState = ensureQueue(queueId, name);
  res.status(201).json({ ok: true, queue: serializeQueueMeta(queueState) });
});

app.get('/api/queues/:queueId', (req, res) => {
  const queueState = ensureQueue(req.params.queueId);
  res.json({
    id: queueState.id,
    name: queueState.name,
    queue: queueState.queue,
    avgServiceMinutes: queueState.avgServiceMinutes,
  });
});

app.post('/api/queues/:queueId/join', (req, res) => {
  const queueState = ensureQueue(req.params.queueId);
  const { userId, name, username } = req.body || {};
  if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
  const exists = queueState.queue.find((x) => String(x.id) === String(userId));
  if (!exists) {
    queueState.queue.push({
      id: userId,
      name,
      username,
      joinedAt: Date.now(),
    });
  }
  const position = queueState.queue.findIndex((x) => String(x.id) === String(userId)) + 1;
  res.json({ ok: true, position });
});

app.post('/api/queues/:queueId/leave', (req, res) => {
  const queueState = ensureQueue(req.params.queueId);
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
  const now = Date.now();
  const entry = queueState.queue.find((x) => String(x.id) === String(userId));
  if (entry) {
    const joinedAt = Number(entry.joinedAt);
    if (Number.isFinite(joinedAt) && joinedAt > 0 && joinedAt <= now) {
      recordServiceDuration(queueState, now - joinedAt);
    }
  }
  queueState.queue = queueState.queue.filter((x) => String(x.id) !== String(userId));
  res.json({ ok: true });
});

app.post('/api/queues/:queueId/clear', (req, res) => {
  const queueState = ensureQueue(req.params.queueId);
  queueState.queue = [];
  queueState.serviceDurations = [];
  queueState.avgServiceMinutes = DEFAULT_AVG_MINUTES;
  res.json({ ok: true });
});

app.delete('/api/queues/:queueId', (req, res) => {
  const rawId = (req.params.queueId || '').trim();
  if (!rawId) return res.status(400).json({ ok: false, error: 'queueId required' });
  if (rawId === DEFAULT_QUEUE_ID) {
    return res.status(400).json({ ok: false, error: 'default queue cannot be deleted' });
  }
  if (!queues.has(rawId)) {
    return res.status(404).json({ ok: false, error: 'queue not found' });
  }
  queues.delete(rawId);
  if (queues.size === 0) {
    ensureQueue(DEFAULT_QUEUE_ID, DEFAULT_QUEUE_NAME);
  }
  res.json({ ok: true });
});

// Backwards compatibility with single queue API
app.get('/api/queue', (req, res) => {
  const queueState = ensureQueue(DEFAULT_QUEUE_ID);
  res.json({
    queue: queueState.queue,
    avgServiceMinutes: queueState.avgServiceMinutes,
    id: queueState.id,
    name: queueState.name,
  });
});

app.post('/api/queue/join', (req, res) => {
  const queueState = ensureQueue(DEFAULT_QUEUE_ID);
  const { userId, name, username } = req.body || {};
  if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
  const exists = queueState.queue.find((x) => String(x.id) === String(userId));
  if (!exists) {
    queueState.queue.push({ id: userId, name, username, joinedAt: Date.now() });
  }
  const position = queueState.queue.findIndex((x) => String(x.id) === String(userId)) + 1;
  res.json({ ok: true, position });
});

app.post('/api/queue/leave', (req, res) => {
  const queueState = ensureQueue(DEFAULT_QUEUE_ID);
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ ok: false, error: 'userId required' });
  const now = Date.now();
  const entry = queueState.queue.find((x) => String(x.id) === String(userId));
  if (entry) {
    const joinedAt = Number(entry.joinedAt);
    if (Number.isFinite(joinedAt) && joinedAt > 0 && joinedAt <= now) {
      recordServiceDuration(queueState, now - joinedAt);
    }
  }
  queueState.queue = queueState.queue.filter((x) => String(x.id) !== String(userId));
  res.json({ ok: true });
});

app.post('/api/queue/clear', (_req, res) => {
  const queueState = ensureQueue(DEFAULT_QUEUE_ID);
  queueState.queue = [];
  queueState.serviceDurations = [];
  queueState.avgServiceMinutes = DEFAULT_AVG_MINUTES;
  res.json({ ok: true });
});

const distPath = path.resolve(__dirname, 'dist');
const indexHtml = path.join(distPath, 'index.html');
app.use(express.static(distPath, {
  index: false,
  fallthrough: true,
  maxAge: '1y',
  immutable: true,
}));

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  if (!fs.existsSync(indexHtml)) return res.status(500).send('index.html not found');
  res.sendFile(indexHtml);
});

app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
