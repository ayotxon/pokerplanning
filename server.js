import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Redis } from '@upstash/redis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ROOMS = 1000;

const app = express();
app.use(express.json({ limit: '128kb' }));

const rooms = new Map();

const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? Redis.fromEnv()
  : null;

const memStats = { visits: 0, rooms: 0, votes: 0 };
const memUsers = new Set();

async function incrStat(key, by = 1) {
  if (redis) {
    try { return await redis.incrby(`stats:${key}`, by); } catch { return null; }
  }
  memStats[key] = (memStats[key] || 0) + by;
  return memStats[key];
}

async function addUser(userId) {
  if (!userId) return;
  if (redis) {
    try { await redis.pfadd('stats:users', userId); } catch {}
    return;
  }
  memUsers.add(userId);
}

async function getStats() {
  if (redis) {
    try {
      const [visits, roomsT, votes, users] = await Promise.all([
        redis.get('stats:visits'),
        redis.get('stats:rooms'),
        redis.get('stats:votes'),
        redis.pfcount('stats:users'),
      ]);
      return {
        visits: Number(visits) || 0,
        rooms: Number(roomsT) || 0,
        votes: Number(votes) || 0,
        users: Number(users) || 0,
      };
    } catch {}
  }
  return {
    visits: memStats.visits,
    rooms: memStats.rooms,
    votes: memStats.votes,
    users: memUsers.size,
  };
}

function pruneStale() {
  const cutoff = Date.now() - ROOM_TTL_MS;
  for (const [id, room] of rooms) {
    if ((room.updatedAt || 0) < cutoff) rooms.delete(id);
  }
}
setInterval(pruneStale, 60 * 60 * 1000);

const ROOM_TTL_S = Math.floor(ROOM_TTL_MS / 1000);

async function loadRoom(id) {
  if (rooms.has(id)) return rooms.get(id);
  if (!redis) return null;
  try {
    const data = await redis.get(`rooms:${id}`);
    if (!data) return null;
    const room = typeof data === 'string' ? JSON.parse(data) : data;
    rooms.set(id, room);
    return room;
  } catch {
    return null;
  }
}

async function persistRoom(id, room) {
  rooms.set(id, room);
  if (!redis) return;
  try {
    await redis.set(`rooms:${id}`, JSON.stringify(room), { ex: ROOM_TTL_S });
  } catch {}
}

// Per-room serialization queue. Operations on the same room run one after another,
// preventing concurrent reads/writes from clobbering each other.
const roomQueues = new Map();
function queueOp(id, fn) {
  const prev = roomQueues.get(id) || Promise.resolve();
  const next = prev.catch(() => {}).then(fn);
  roomQueues.set(id, next.catch(() => {}));
  return next;
}

async function applyOp(id, op) {
  const room = await loadRoom(id);
  if (!room) return { status: 404, error: 'not_found' };

  const stamp = () => { room.updatedAt = Date.now(); };
  let voteIncrement = 0;
  let userAdded = null;

  switch (op?.type) {
    case 'vote': {
      const { userId, value } = op;
      if (!userId || !room.participants?.[userId]) return { status: 404, error: 'not_in_room' };
      if (room.revealed) return { status: 409, error: 'already_revealed' };
      const wasVoted = room.participants[userId].hasVoted === true;
      room.participants[userId].vote = value;
      room.participants[userId].hasVoted = true;
      if (!wasVoted) voteIncrement = 1;
      stamp();
      break;
    }
    case 'reveal': {
      if (!room.revealed) {
        room.revealed = true;
        room.timerEnd = null;
        stamp();
      }
      break;
    }
    case 'round': {
      room.revealed = false;
      room.timerEnd = null;
      room.round = (room.round || 1) + 1;
      Object.keys(room.participants || {}).forEach(uid => {
        room.participants[uid].vote = null;
        room.participants[uid].hasVoted = false;
      });
      stamp();
      break;
    }
    case 'timer': {
      const duration = Math.max(1, Math.min(3600, Number(op.duration) || 60));
      room.timerDuration = duration;
      room.timerEnd = Date.now() + duration * 1000;
      stamp();
      break;
    }
    case 'story': {
      room.story = String(op.story || '').slice(0, 500);
      stamp();
      break;
    }
    case 'leave': {
      const { userId } = op;
      if (userId && room.participants?.[userId]) {
        delete room.participants[userId];
        if (room.hostId === userId) {
          const remaining = Object.keys(room.participants);
          room.hostId = remaining[0] || userId;
        }
        stamp();
      }
      break;
    }
    case 'join': {
      const { userId, profile } = op;
      if (!userId || !profile || typeof profile.name !== 'string') {
        return { status: 400, error: 'invalid' };
      }
      const existing = room.participants?.[userId] || {};
      const isNewUser = !room.participants?.[userId];
      // Original creator reclaims host on rejoin.
      if (room.creatorId && room.creatorId === userId) room.hostId = userId;
      room.participants = room.participants || {};
      room.participants[userId] = {
        name: profile.name,
        vote: existing.vote ?? null,
        hasVoted: existing.hasVoted ?? false,
        isObserver: profile.isObserver != null ? !!profile.isObserver : (existing.isObserver ?? false),
        joinedAt: existing.joinedAt || Date.now(),
      };
      stamp();
      if (isNewUser) userAdded = userId;
      break;
    }
    default:
      return { status: 400, error: 'unknown_op' };
  }

  await persistRoom(id, room);

  // Stats — fire-and-forget after the persist
  if (voteIncrement) { try { await incrStat('votes', voteIncrement); } catch {} }
  if (userAdded)     { try { await addUser(userAdded); } catch {} }

  return { room };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size, redis: !!redis });
});

app.get('/api/stats', async (_req, res) => {
  res.json(await getStats());
});

app.post('/api/visit', async (_req, res) => {
  await incrStat('visits');
  res.json(await getStats());
});

app.get('/api/rooms/:id', async (req, res) => {
  const room = await loadRoom(req.params.id);
  if (!room) return res.status(404).json({ error: 'not_found' });
  res.json(room);
});

app.put('/api/rooms/:id', async (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'invalid_body' });
  }
  const id = req.params.id;
  try {
    const result = await queueOp(id, async () => {
      const old = await loadRoom(id);
      const isNew = !old;
      if (isNew && rooms.size >= MAX_ROOMS) {
        pruneStale();
        if (rooms.size >= MAX_ROOMS) return { status: 503, error: 'capacity' };
      }
      const next = req.body;
      await persistRoom(id, next);
      return { isNew, old, next };
    });
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    res.json({ ok: true });

    // Stat tracking — fire-and-forget after response.
    (async () => {
      try {
        const newP = result.next.participants || {};
        if (result.isNew) {
          await incrStat('rooms');
          for (const uid of Object.keys(newP)) await addUser(uid);
          let voteDelta = 0;
          for (const p of Object.values(newP)) if (p?.hasVoted) voteDelta++;
          if (voteDelta) await incrStat('votes', voteDelta);
          return;
        }
        const oldP = result.old?.participants || {};
        for (const uid of Object.keys(newP)) {
          if (!oldP[uid]) await addUser(uid);
        }
        let voteDelta = 0;
        for (const [uid, p] of Object.entries(newP)) {
          const wasVoted = oldP[uid]?.hasVoted === true;
          const isVoted = p?.hasVoted === true;
          if (!wasVoted && isVoted) voteDelta++;
        }
        if (voteDelta) await incrStat('votes', voteDelta);
      } catch {}
    })();
  } catch {
    res.status(500).json({ error: 'server_error' });
  }
});

app.post('/api/rooms/:id/op', async (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'invalid_body' });
  }
  const id = req.params.id;
  try {
    const result = await queueOp(id, () => applyOp(id, req.body));
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    res.json({ ok: true, room: result.room });
  } catch {
    res.status(500).json({ error: 'server_error' });
  }
});

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.listen(PORT, () => {
  const mode = process.env.NODE_ENV === 'production' ? 'production' : 'dev (API only)';
  console.log(`Planning Poker [${mode}] → http://localhost:${PORT} (redis: ${redis ? 'on' : 'off'})`);
});
