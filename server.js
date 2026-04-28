import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3001;
const ROOM_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ROOMS = 1000;

const app = express();
app.use(express.json({ limit: '128kb' }));

const rooms = new Map();

function pruneStale() {
  const cutoff = Date.now() - ROOM_TTL_MS;
  for (const [id, room] of rooms) {
    if ((room.updatedAt || 0) < cutoff) rooms.delete(id);
  }
}
setInterval(pruneStale, 60 * 60 * 1000);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, rooms: rooms.size });
});

app.get('/api/rooms/:id', (req, res) => {
  const room = rooms.get(req.params.id);
  if (!room) return res.status(404).json({ error: 'not_found' });
  res.json(room);
});

app.put('/api/rooms/:id', (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'invalid_body' });
  }
  if (!rooms.has(req.params.id) && rooms.size >= MAX_ROOMS) {
    pruneStale();
    if (rooms.size >= MAX_ROOMS) {
      return res.status(503).json({ error: 'capacity' });
    }
  }
  rooms.set(req.params.id, req.body);
  res.json({ ok: true });
});

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, 'dist');
  app.use(express.static(distPath));
  app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

app.listen(PORT, () => {
  const mode = process.env.NODE_ENV === 'production' ? 'production' : 'dev (API only)';
  console.log(`Planning Poker [${mode}] → http://localhost:${PORT}`);
});
