const BASE = '/api/rooms';

export async function fetchRoom(roomId) {
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(roomId)}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function saveRoom(roomId, state) {
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(roomId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(state),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function recordVisit() {
  try {
    const res = await fetch('/api/visit', { method: 'POST' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function updateRoom(roomId, updater) {
  const current = await fetchRoom(roomId);
  if (!current) return null;
  const next = updater({ ...current });
  if (!next) return null;
  next.updatedAt = Date.now();
  const ok = await saveRoom(roomId, next);
  return ok ? next : null;
}

// Atomic, server-serialized operations (race-free).
async function callOp(roomId, op) {
  try {
    const res = await fetch(`${BASE}/${encodeURIComponent(roomId)}/op`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(op),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.room || null;
  } catch {
    return null;
  }
}

export const castVote   = (roomId, userId, value)        => callOp(roomId, { type: 'vote', userId, value });
export const revealRoom = (roomId)                       => callOp(roomId, { type: 'reveal' });
export const revote     = (roomId)                       => callOp(roomId, { type: 'revote' });
export const newRound   = (roomId)                       => callOp(roomId, { type: 'round' });
export const startTimer = (roomId, duration)             => callOp(roomId, { type: 'timer', duration });
export const setStory   = (roomId, story)                => callOp(roomId, { type: 'story', story });
export const leaveRoom  = (roomId, userId)               => callOp(roomId, { type: 'leave', userId });
export const joinRoom   = (roomId, userId, profile)      => callOp(roomId, { type: 'join', userId, profile });
