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
