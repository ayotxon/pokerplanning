import React, { useState, useEffect, useRef } from 'react';
import {
  Users, Crown, Clock, Eye, Play, RotateCcw, Copy, Check,
  LogOut, Plus, UserPlus, Sparkles, AlertCircle,
  ChevronDown, ChevronRight, Timer, Award, Share2, X,
} from 'lucide-react';
import QRCode from 'react-qr-code';
import { fetchRoom, saveRoom, updateRoom, recordVisit } from './api.js';

// ============================================================
// Constants
// ============================================================
const CARDS = ['0', '1', '2', '3', '5', '8', '13', '21', '34', '55', '89', '?', '☕'];
const FIB = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
const TIMER_OPTIONS = [
  { label: '30 sec', value: 30 },
  { label: '1 min',  value: 60 },
  { label: '2 min',  value: 120 },
  { label: '5 min',  value: 300 },
];
const POLL_MS = 1500;
// Set to '' to hide the donate button.
const DONATE_URL = 'https://ko-fi.com/D1D21YOBOK';

// ============================================================
// Utils
// ============================================================
function genRoomId() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 6; i++) r += c[Math.floor(Math.random() * c.length)];
  return r;
}
function genUserId() {
  return 'u' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function fmtTime(s) {
  if (s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
function computeStats(participants) {
  const voters = Object.values(participants).filter(p => p.hasVoted && p.vote != null);
  const numeric = voters.filter(p => !isNaN(parseFloat(p.vote))).map(p => parseFloat(p.vote));
  if (numeric.length === 0) return { count: voters.length, hasNumeric: false };
  const sorted = [...numeric].sort((a, b) => a - b);
  const sum = numeric.reduce((a, b) => a + b, 0);
  const avg = sum / numeric.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const min = sorted[0], max = sorted[sorted.length - 1];
  const counts = {};
  voters.forEach(v => { counts[v.vote] = (counts[v.vote] || 0) + 1; });
  const modeEntry = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const closest = FIB.reduce((p, c) => Math.abs(c - avg) < Math.abs(p - avg) ? c : p);
  const allSame = sorted.every(v => v === sorted[0]) && voters.length > 1;
  // Agreement level — based on distance between Fibonacci indexes of min and max.
  // 0 → consensus, 1–2 → aligned, ≥3 → diverging.
  const idxMin = FIB.indexOf(min);
  const idxMax = FIB.indexOf(max);
  const fibSpread = (idxMin >= 0 && idxMax >= 0) ? (idxMax - idxMin) : 0;
  let agreement = 'aligned';
  if (allSame) agreement = 'consensus';
  else if (fibSpread >= 3) agreement = 'diverging';
  return {
    hasNumeric: true,
    count: voters.length,
    avg: Number.isInteger(avg) ? avg.toString() : avg.toFixed(1),
    median: Number.isInteger(median) ? median.toString() : median.toFixed(1),
    min, max,
    mode: modeEntry[0],
    consensus: allSame,
    agreement,
    fibSpread,
    suggested: closest,
    distribution: counts,
  };
}

// ============================================================
// Global Styles + Fonts
// ============================================================
function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;0,9..144,700;0,9..144,800;1,9..144,400;1,9..144,500&family=Manrope:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');

      :root {
        --bg: #F2E8D2;
        --bg-soft: #F8F1E0;
        --bg-card: #FCF8EC;
        --ink: #1A1614;
        --ink-2: #44403C;
        --ink-3: #8A8278;
        --line: #DFD0AC;
        --line-soft: #ECE0BE;
        --accent: #7C2536;
        --accent-2: #5F1A28;
        --accent-tint: #FBE9E7;
        --gold: #B89855;
        --gold-soft: #D4B97D;
        --success: #587442;
        --success-soft: #7E9663;
        --success-tint: #E8F0DD;
        --warning: #B85537;
        --warning-soft: #D17B5C;
        --warning-tint: #FCE6DB;
      }

      body {
        background: var(--bg);
        color: var(--ink);
        font-family: 'Manrope', system-ui, sans-serif;
        margin: 0;
      }

      .ff-display { font-family: 'Fraunces', Georgia, serif; font-feature-settings: "ss01"; }
      .ff-italic  { font-family: 'Fraunces', serif; font-style: italic; }
      .ff-mono    { font-family: 'JetBrains Mono', ui-monospace, monospace; }

      .grain {
        background-image:
          radial-gradient(rgba(120,80,40,0.045) 1px, transparent 1px),
          radial-gradient(rgba(120,80,40,0.03) 1px, transparent 1px);
        background-size: 3px 3px, 7px 7px;
        background-position: 0 0, 1px 1px;
      }
      .felt {
        background-color: var(--bg-soft);
        background-image: radial-gradient(circle at 1px 1px, rgba(124,37,54,0.06) 1px, transparent 0);
        background-size: 14px 14px;
      }

      @keyframes flipIn { from { transform: rotateY(180deg); opacity: 0 } to { transform: rotateY(0); opacity: 1 } }
      @keyframes fadeUp { from { transform: translateY(8px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      @keyframes pulseGold { 0%,100% { box-shadow: 0 0 0 0 rgba(184,152,85,0.45) } 50% { box-shadow: 0 0 0 10px rgba(184,152,85,0) } }
      @keyframes pulseSuccess { 0%,100% { box-shadow: 0 0 0 0 rgba(88,116,66,0.45) } 50% { box-shadow: 0 0 0 10px rgba(88,116,66,0) } }
      .flip-in       { animation: flipIn .55s cubic-bezier(.4,0,.2,1); }
      .fade-up       { animation: fadeUp .35s ease-out; }
      .pulse-gold    { animation: pulseGold 2s infinite; }
      .pulse-success { animation: pulseSuccess 2s infinite; }

      .shadow-card { box-shadow: 0 1px 2px rgba(26,22,20,.06), 0 4px 16px rgba(26,22,20,.06), 0 18px 36px rgba(26,22,20,.04); }
      .shadow-deep { box-shadow: 0 2px 4px rgba(26,22,20,.08), 0 10px 28px rgba(26,22,20,.10), 0 28px 56px rgba(26,22,20,.06); }

      .vote-card { transition: transform .2s cubic-bezier(.4,0,.2,1), box-shadow .2s, background .2s, border-color .2s; }
      .vote-card:hover:not(:disabled):not(.selected) { transform: translateY(-6px); }
      .vote-card.selected { transform: translateY(-12px); }

      input { font-family: inherit; }
      input:focus, button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
      input::placeholder { color: var(--ink-3); opacity: .7; }

      .btn-primary { background: var(--accent); color: white; transition: background .15s; }
      .btn-primary:hover:not(:disabled) { background: var(--accent-2); }
      .btn-primary:disabled { opacity: .4; cursor: not-allowed; }
      .btn-ghost { background: var(--bg-card); color: var(--ink-2); border: 1px solid var(--line); transition: background .15s; }
      .btn-ghost:hover:not(:disabled) { background: var(--bg-soft); }

      .tabular { font-variant-numeric: tabular-nums; }
    `}</style>
  );
}

// ============================================================
// Home Screen
// ============================================================
function Home({ onJoin }) {
  const [tab, setTab] = useState('create');
  const [name, setName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [hostVotes, setHostVotes] = useState(true);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [invitedRoom, setInvitedRoom] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const r = params.get('room');
    if (!r) return;
    const sanitized = r.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    if (!sanitized) return;
    setTab('join');
    setCode(sanitized);
    setInvitedRoom(sanitized);
    window.history.replaceState({}, '', window.location.pathname);
  }, []);

  async function handleSubmit(e) {
    e?.preventDefault();
    if (!name.trim()) { setError('Veuillez entrer votre nom.'); return; }
    setError(''); setLoading(true);
    try {
      if (tab === 'create') {
        const roomId = genRoomId();
        const userId = genUserId();
        const newRoom = {
          name: roomName.trim(),
          hostId: userId,
          participants: {
            [userId]: {
              name: name.trim(), vote: null, hasVoted: false,
              isObserver: !hostVotes, joinedAt: Date.now(),
            },
          },
          revealed: false,
          timerEnd: null,
          timerDuration: 60,
          round: 1,
          story: '',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        const ok = await saveRoom(roomId, newRoom);
        if (!ok) throw new Error('save_failed');
        onJoin({ roomId, userId, userName: name.trim() });
      } else {
        const roomId = code.trim().toUpperCase();
        if (!roomId) { setError('Veuillez entrer un code de salle.'); setLoading(false); return; }
        const room = await fetchRoom(roomId);
        if (!room) { setError("Cette salle n'existe pas. Vérifiez le code."); setLoading(false); return; }
        const userId = genUserId();
        const updated = await updateRoom(roomId, (r) => {
          r.participants[userId] = {
            name: name.trim(), vote: null, hasVoted: false,
            isObserver: false, joinedAt: Date.now(),
          };
          return r;
        });
        if (!updated) throw new Error('join_failed');
        onJoin({ roomId, userId, userName: name.trim() });
      }
    } catch {
      setError("Une erreur est survenue. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 grain">
      <div className="w-full max-w-md fade-up">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center mb-6 relative">
            <div className="absolute inset-0 blur-2xl opacity-25" style={{ background: 'var(--accent)' }} />
            <div className="relative rounded-md flex items-center justify-center shadow-deep"
                 style={{ width: 64, height: 84, background: 'var(--bg-card)', border: '1px solid var(--line)' }}>
              <span className="text-4xl" style={{ color: 'var(--accent)' }}>♠</span>
            </div>
          </div>
          <h1 className="ff-display tracking-tight" style={{ color: 'var(--ink)', fontWeight: 700, fontSize: '2.75rem', lineHeight: 1.05 }}>
            Poker Planning
          </h1>
          <p className="ff-italic mt-3 text-base" style={{ color: 'var(--ink-3)' }}>
            l'estimation collective, en bonne compagnie
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-7 shadow-card"
             style={{ background: 'var(--bg-card)', border: '1px solid var(--line)' }}>
          {invitedRoom ? (
            <div className="mb-5 fade-up text-center">
              <div className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-2" style={{ color: 'var(--ink-3)' }}>
                Invitation
              </div>
              <div className="ff-display" style={{ fontWeight: 600, fontSize: '1.05rem', color: 'var(--ink)' }}>
                Vous rejoignez la salle
              </div>
              <div className="ff-mono mt-2 inline-block px-4 py-2 rounded-lg"
                   style={{ background: 'var(--bg-soft)', border: '1px solid var(--line)', color: 'var(--ink)',
                            letterSpacing: '0.3em', fontWeight: 700, fontSize: '1.4rem' }}>
                {invitedRoom}
              </div>
            </div>
          ) : (
            <div className="flex gap-1 p-1 rounded-lg mb-6" style={{ background: 'var(--bg)' }}>
              {[
                { id: 'create', icon: <Plus size={16} />, label: 'Créer une salle' },
                { id: 'join',   icon: <UserPlus size={16} />, label: 'Rejoindre' },
              ].map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="flex-1 py-2.5 px-3 rounded-md font-medium text-sm transition-all flex items-center justify-center gap-2"
                  style={{
                    background: tab === t.id ? 'var(--bg-card)' : 'transparent',
                    color: tab === t.id ? 'var(--ink)' : 'var(--ink-3)',
                    boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.06)' : 'none',
                  }}>
                  {t.icon}{t.label}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {tab === 'create' && !invitedRoom && (
              <div className="fade-up">
                <label className="block text-[11px] uppercase tracking-[0.15em] mb-2 font-semibold"
                       style={{ color: 'var(--ink-2)' }}>Nom de la salle</label>
                <input
                  type="text" value={roomName} onChange={(e) => setRoomName(e.target.value)}
                  placeholder="Sprint 42 — Refinement" maxLength={60}
                  className="w-full px-4 py-3 rounded-lg text-base"
                  style={{ background: 'var(--bg-soft)', border: '1px solid var(--line)', color: 'var(--ink)' }}
                />
              </div>
            )}

            <div>
              <label className="block text-[11px] uppercase tracking-[0.15em] mb-2 font-semibold"
                     style={{ color: 'var(--ink-2)' }}>
                {tab === 'create' && !invitedRoom ? "Votre nom (organisateur)" : 'Votre nom'}
              </label>
              <input
                type="text" value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Ayawo" maxLength={30} autoFocus={!!invitedRoom}
                className="w-full px-4 py-3 rounded-lg text-base"
                style={{ background: 'var(--bg-soft)', border: '1px solid var(--line)', color: 'var(--ink)' }}
              />
            </div>

            {tab === 'create' && !invitedRoom && (
              <label className="fade-up flex items-center justify-between gap-3 px-4 py-3 rounded-lg cursor-pointer"
                     style={{ background: 'var(--bg-soft)', border: '1px solid var(--line)' }}>
                <span className="text-sm" style={{ color: 'var(--ink-2)' }}>
                  Je participe au vote
                  <span className="block text-[11px] mt-0.5" style={{ color: 'var(--ink-3)' }}>
                    {hostVotes ? "Vous apparaîtrez à la table." : "Vous animez sans voter — invisible à la table."}
                  </span>
                </span>
                <span className="relative inline-block flex-shrink-0" style={{ width: 38, height: 22 }}>
                  <input
                    type="checkbox" checked={hostVotes}
                    onChange={(e) => setHostVotes(e.target.checked)}
                    className="sr-only peer"
                  />
                  <span aria-hidden
                        className="absolute inset-0 rounded-full transition-colors"
                        style={{ background: hostVotes ? 'var(--accent)' : 'var(--line)' }} />
                  <span aria-hidden
                        className="absolute top-0.5 rounded-full bg-white transition-all"
                        style={{ width: 18, height: 18, left: hostVotes ? 18 : 2, boxShadow: '0 1px 2px rgba(0,0,0,.18)' }} />
                </span>
              </label>
            )}

            {tab === 'join' && !invitedRoom && (
              <div className="fade-up">
                <label className="block text-[11px] uppercase tracking-[0.15em] mb-2 font-semibold"
                       style={{ color: 'var(--ink-2)' }}>Code de la salle</label>
                <input
                  type="text" value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder="ABC123" maxLength={6}
                  className="w-full px-4 py-3 rounded-lg ff-mono text-center uppercase"
                  style={{ background: 'var(--bg-soft)', border: '1px solid var(--line)', color: 'var(--ink)',
                           fontSize: '1.4rem', letterSpacing: '0.3em', fontWeight: 700 }}
                />
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 rounded-lg text-sm fade-up"
                   style={{ background: 'var(--accent-tint)', color: 'var(--accent-2)', border: '1px solid #F0C9CD' }}>
                <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button type="submit" disabled={loading}
                    className="btn-primary w-full py-3.5 rounded-lg font-semibold tracking-wide flex items-center justify-center gap-2">
              {loading ? 'Chargement…' : (tab === 'create' ? 'Créer la salle' : 'Rejoindre la salle')}
              {!loading && <ChevronRight size={18} />}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-5" style={{ color: 'var(--ink-3)' }}>
          Plusieurs salles peuvent tourner en parallèle, indépendamment.
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Voting deck card
// ============================================================
function VoteCard({ value, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`vote-card relative rounded-xl flex flex-col items-center justify-center select-none ${selected ? 'selected' : ''}`}
      style={{
        width: 64, height: 92,
        background: selected ? 'var(--accent)' : 'var(--bg-card)',
        color: selected ? 'white' : 'var(--ink)',
        border: selected ? '2px solid var(--accent)' : '1px solid var(--line)',
        boxShadow: selected
          ? '0 14px 26px rgba(124,37,54,.28), 0 4px 8px rgba(124,37,54,.14)'
          : '0 1px 2px rgba(0,0,0,.04), 0 4px 10px rgba(0,0,0,.04)',
      }}>
      <span className="text-[10px] absolute top-1.5 left-2 ff-mono font-medium" style={{ opacity: .55 }}>{value}</span>
      <span className="ff-display text-2xl" style={{ fontWeight: 600 }}>{value}</span>
      <span className="text-[10px] absolute bottom-1.5 right-2 ff-mono font-medium"
            style={{ opacity: .55, transform: 'rotate(180deg)' }}>{value}</span>
    </button>
  );
}

// ============================================================
// Participant tile (around the table)
// ============================================================
function ParticipantTile({ participant, isHost, revealed, isMe }) {
  const { hasVoted, vote, name } = participant;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative">
        <div className="rounded-lg flex items-center justify-center"
             style={{
               width: 60, height: 84,
               background: revealed && hasVoted ? 'var(--bg-card)' : (hasVoted ? 'var(--accent)' : 'var(--bg-soft)'),
               border: hasVoted && !revealed ? '1px solid var(--accent-2)' : '1px solid var(--line)',
               boxShadow: hasVoted ? '0 4px 12px rgba(0,0,0,.08)' : '0 1px 2px rgba(0,0,0,.04)',
               transition: 'all .2s',
             }}>
          {revealed && hasVoted ? (
            <span className="ff-display flip-in" style={{ color: 'var(--ink)', fontWeight: 600, fontSize: '1.6rem' }}>
              {vote}
            </span>
          ) : hasVoted ? (
            <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 22 }}>♠</span>
          ) : (
            <span style={{ color: 'var(--ink-3)', fontSize: 18 }}>···</span>
          )}
        </div>
        {isHost && (
          <div className="absolute -top-1.5 -right-1.5 rounded-full p-1"
               style={{ background: 'var(--gold)', boxShadow: '0 1px 3px rgba(0,0,0,.18)' }}>
            <Crown size={10} className="text-white" />
          </div>
        )}
      </div>
      <div className="text-center" style={{ maxWidth: 90 }}>
        <div className="text-xs font-semibold truncate" style={{ color: 'var(--ink)' }}>
          {name}{isMe && <span className="font-normal" style={{ color: 'var(--ink-3)' }}> (vous)</span>}
        </div>
        <div className="text-[10px] uppercase tracking-wider mt-0.5"
             style={{ color: hasVoted ? 'var(--success)' : 'var(--ink-3)' }}>
          {hasVoted ? '✓ voté' : 'en attente'}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Stat card + Results
// ============================================================
const STAT_VARIANTS = {
  default: { bg: 'var(--bg-card)', fg: 'var(--ink)',  border: 'var(--line)' },
  accent:  { bg: 'var(--accent)',  fg: 'white',       border: 'var(--accent)' },
  success: { bg: 'var(--success)', fg: 'white',       border: 'var(--success)' },
  warning: { bg: 'var(--warning)', fg: 'white',       border: 'var(--warning)' },
};

function StatCard({ label, value, variant = 'default', icon }) {
  const v = STAT_VARIANTS[variant] || STAT_VARIANTS.default;
  return (
    <div className="rounded-lg p-3"
         style={{ background: v.bg, color: v.fg, border: `1px solid ${v.border}` }}>
      <div className="text-[10px] uppercase tracking-[0.15em] flex items-center gap-1 mb-1 font-semibold" style={{ opacity: .7 }}>
        {icon}{label}
      </div>
      <div className="ff-display tabular" style={{ fontWeight: 600, fontSize: '1.6rem', lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

function ResultsPanel({ stats }) {
  const { agreement } = stats;
  const isConsensus = agreement === 'consensus';
  const isDiverging = agreement === 'diverging';

  const estimationVariant = isConsensus ? 'success' : isDiverging ? 'warning' : 'accent';
  const spreadVariant     = isDiverging ? 'warning' : 'default';
  const modeBg            = isConsensus ? 'var(--success)' : isDiverging ? 'var(--warning)' : 'var(--accent)';

  return (
    <div className="space-y-5 fade-up">
      {isConsensus && (
        <div className="text-center py-3 rounded-lg flex items-center justify-center gap-2 pulse-success"
             style={{ background: 'var(--success-tint)', color: 'var(--success)', border: '1px solid var(--success-soft)' }}>
          <Sparkles size={18} />
          <span className="ff-display" style={{ fontWeight: 600, fontSize: '1.05rem' }}>
            Consensus parfait — l'équipe est alignée.
          </span>
        </div>
      )}
      {isDiverging && (
        <div className="text-center py-3 px-4 rounded-lg flex items-center justify-center gap-2"
             style={{ background: 'var(--warning-tint)', color: 'var(--warning)', border: '1px solid var(--warning-soft)' }}>
          <AlertCircle size={18} />
          <span className="ff-display" style={{ fontWeight: 600, fontSize: '1.05rem' }}>
            Estimations divergentes — discutez avant d'arrêter une valeur.
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Moyenne" value={stats.avg} />
        <StatCard label="Médiane" value={stats.median} />
        <StatCard
          label="Étendue"
          value={stats.min === stats.max ? stats.min : `${stats.min}–${stats.max}`}
          variant={spreadVariant}
        />
        <StatCard
          label="Estimation"
          value={stats.suggested}
          variant={estimationVariant}
          icon={<Award size={12} />}
        />
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-[0.15em] mb-2 font-semibold" style={{ color: 'var(--ink-3)' }}>
          Distribution des votes
        </div>
        <div className="flex flex-wrap gap-2">
          {Object.entries(stats.distribution).sort((a, b) => b[1] - a[1]).map(([vote, count]) => {
            const isMode = vote === stats.mode;
            return (
              <div key={vote}
                   className="px-3 py-1.5 rounded-lg flex items-center gap-2 text-sm"
                   style={{
                     background: isMode ? modeBg : 'var(--bg-card)',
                     color: isMode ? 'white' : 'var(--ink-2)',
                     border: `1px solid ${isMode ? modeBg : 'var(--line)'}`,
                   }}>
                <span className="ff-mono font-bold">{vote}</span>
                <span className="text-xs" style={{ opacity: .7 }}>×{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Room Screen
// ============================================================
function Room({ roomId, userId, onLeave }) {
  const [roomState, setRoomState] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [copied, setCopied] = useState(false);
  const [showTimerMenu, setShowTimerMenu] = useState(false);
  const [storyDraft, setStoryDraft] = useState('');
  const [storyEditing, setStoryEditing] = useState(false);
  const [missing, setMissing] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const lastUpdateRef = useRef(0);
  const revealLockRef = useRef(false);

  // Polling
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const room = await fetchRoom(roomId);
      if (cancelled) return;
      if (!room) { setMissing(true); return; }
      if (room.updatedAt !== lastUpdateRef.current) {
        lastUpdateRef.current = room.updatedAt;
        setRoomState(room);
        if (!storyEditing) setStoryDraft(room.story || '');
      }
    }
    poll();
    const i = setInterval(poll, POLL_MS);
    return () => { cancelled = true; clearInterval(i); };
  }, [roomId, storyEditing]);

  // Tick for timer
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(i);
  }, []);

  // Auto-reveal
  useEffect(() => {
    if (!roomState || roomState.revealed || revealLockRef.current) return;
    const ps = Object.values(roomState.participants).filter(p => !p.isObserver);
    const allVoted = ps.length > 0 && ps.every(p => p.hasVoted);
    const timerExpired = roomState.timerEnd && now >= roomState.timerEnd;
    if (allVoted || timerExpired) {
      revealLockRef.current = true;
      updateRoom(roomId, (r) => {
        if (r.revealed) return r;
        r.revealed = true;
        r.timerEnd = null;
        return r;
      }).finally(() => {
        setTimeout(() => { revealLockRef.current = false; }, 2000);
      });
    }
  }, [roomState, now, roomId]);

  if (missing) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center max-w-sm fade-up">
          <div className="text-4xl mb-4" style={{ color: 'var(--accent)' }}>♠</div>
          <h2 className="ff-display text-2xl mb-2" style={{ fontWeight: 700 }}>Salle introuvable</h2>
          <p className="text-sm mb-6" style={{ color: 'var(--ink-3)' }}>
            Cette salle a été fermée ou supprimée.
          </p>
          <button onClick={onLeave} className="btn-primary px-5 py-2.5 rounded-lg font-semibold">
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  if (!roomState) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl animate-pulse mb-3" style={{ color: 'var(--accent)' }}>♠</div>
          <p className="ff-italic" style={{ color: 'var(--ink-3)' }}>Préparation de la table…</p>
        </div>
      </div>
    );
  }

  const me = roomState.participants[userId];
  if (!me) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center fade-up">
          <p className="mb-4" style={{ color: 'var(--ink-3)' }}>Vous n'êtes plus dans cette salle.</p>
          <button onClick={onLeave} className="btn-primary px-5 py-2.5 rounded-lg font-semibold">
            Retour à l'accueil
          </button>
        </div>
      </div>
    );
  }

  const isHost = roomState.hostId === userId;
  const participants = Object.entries(roomState.participants);
  const active = participants.filter(([, p]) => !p.isObserver);
  const votedCount = active.filter(([, p]) => p.hasVoted).length;
  const totalCount = active.length;
  const stats = roomState.revealed ? computeStats(roomState.participants) : null;
  const timerRemaining = roomState.timerEnd ? Math.max(0, (roomState.timerEnd - now) / 1000) : null;

  // Actions
  async function handleVote(value) {
    if (roomState.revealed) return;
    setRoomState(prev => prev && ({
      ...prev,
      participants: {
        ...prev.participants,
        [userId]: { ...prev.participants[userId], vote: value, hasVoted: true },
      },
    }));
    await updateRoom(roomId, (r) => {
      if (r.participants[userId]) {
        r.participants[userId].vote = value;
        r.participants[userId].hasVoted = true;
      }
      return r;
    });
  }

  async function handleReveal() {
    await updateRoom(roomId, (r) => {
      r.revealed = true; r.timerEnd = null; return r;
    });
  }

  async function handleNewRound() {
    await updateRoom(roomId, (r) => {
      r.revealed = false; r.timerEnd = null;
      r.round = (r.round || 1) + 1;
      Object.keys(r.participants).forEach(uid => {
        r.participants[uid].vote = null;
        r.participants[uid].hasVoted = false;
      });
      return r;
    });
  }

  async function handleStartTimer(duration) {
    setShowTimerMenu(false);
    await updateRoom(roomId, (r) => {
      r.timerDuration = duration;
      r.timerEnd = Date.now() + duration * 1000;
      return r;
    });
  }

  async function handleSaveStory() {
    setStoryEditing(false);
    await updateRoom(roomId, (r) => { r.story = storyDraft.trim(); return r; });
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  async function handleShareLink() {
    const url = `${window.location.origin}?room=${roomId}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  }

  const shareUrl = `${window.location.origin}?room=${roomId}`;

  return (
    <div className="min-h-screen grain">
      {/* Header */}
      <header className="px-4 sm:px-6 py-4 sticky top-0 z-10 backdrop-blur"
              style={{ background: 'rgba(242,232,210,0.92)', borderBottom: '1px solid var(--line)' }}>
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded flex items-center justify-center"
                 style={{ width: 36, height: 48, background: 'var(--bg-card)', border: '1px solid var(--line)' }}>
              <span style={{ color: 'var(--accent)', fontSize: 20 }}>♠</span>
            </div>
            <div className="min-w-0">
              <h1 className="ff-display leading-none truncate"
                  style={{ fontWeight: 700, fontSize: '1.05rem', maxWidth: '60vw' }}>
                {roomState.name?.trim() || 'Poker '}
              </h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ink-3)' }}>
                Tour {roomState.round}{isHost && ' · animateur'}{me.isObserver && ' (observateur)'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowShareModal(true)}
              className="p-2 rounded-lg hover:opacity-70 flex items-center gap-2 text-sm font-medium"
              style={{ background: 'var(--accent)', color: 'white' }}
              title="Partager"
            >
              <Share2 size={18} />
              <span className="hidden sm:inline">Partager</span>
            </button>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg"
                 style={{ background: 'var(--bg-card)', border: '1px solid var(--line)' }}>
              <span className="text-[10px] uppercase tracking-[0.15em] font-semibold" style={{ color: 'var(--ink-3)' }}>Salle</span>
              <span className="ff-mono font-bold tracking-wider" style={{ color: 'var(--ink)' }}>{roomId}</span>
              <button onClick={handleCopy} className="ml-1 p-1 rounded hover:opacity-70" title="Copier">
                {copied
                  ? <Check size={14} style={{ color: 'var(--success)' }} />
                  : <Copy size={14} style={{ color: 'var(--ink-3)' }} />}
              </button>
            </div>
            <button onClick={onLeave} className="p-2 rounded-lg hover:opacity-70" title="Quitter"
                    style={{ color: 'var(--ink-3)' }}>
              <LogOut size={18} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Mobile room code */}
        <div className="sm:hidden flex items-center gap-2 px-3 py-2 rounded-lg"
             style={{ background: 'var(--bg-card)', border: '1px solid var(--line)' }}>
          <span className="text-[10px] uppercase tracking-[0.15em] font-semibold" style={{ color: 'var(--ink-3)' }}>Salle</span>
          <span className="ff-mono font-bold tracking-wider flex-1" style={{ color: 'var(--ink)' }}>{roomId}</span>
          <button onClick={handleCopy} className="p-1.5 rounded">
            {copied
              ? <Check size={14} style={{ color: 'var(--success)' }} />
              : <Copy size={14} style={{ color: 'var(--ink-3)' }} />}
          </button>
        </div>

        {/* Story bar */}
        <div className="rounded-xl p-4 sm:p-5 flex items-center gap-3 shadow-card"
             style={{ background: 'var(--bg-card)', border: '1px solid var(--line)' }}>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-[0.15em] mb-1 font-semibold" style={{ color: 'var(--ink-3)' }}>
              Sujet en cours
            </div>
            {storyEditing && isHost ? (
              <input
                value={storyDraft}
                onChange={(e) => setStoryDraft(e.target.value)}
                onBlur={handleSaveStory}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveStory()}
                placeholder="Quelle est la tâche à estimer ?"
                autoFocus
                className="w-full ff-display outline-none bg-transparent"
                style={{ color: 'var(--ink)', fontWeight: 600, fontSize: '1.15rem' }}
              />
            ) : (
              <div
                className={`ff-display ${isHost ? 'cursor-pointer hover:opacity-70' : ''}`}
                style={{ color: 'var(--ink)', fontWeight: 600, fontSize: '1.15rem', lineHeight: 1.3 }}
                onClick={() => isHost && setStoryEditing(true)}>
                {roomState.story || (
                  <span className="ff-italic" style={{ color: 'var(--ink-3)', fontStyle: 'italic' }}>
                    {isHost ? 'Cliquez pour saisir le sujet à estimer…' : 'En attente du sujet…'}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {timerRemaining !== null ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                   style={{
                     background: timerRemaining < 10 ? 'var(--accent-tint)' : 'var(--bg-soft)',
                     color: timerRemaining < 10 ? 'var(--accent)' : 'var(--ink-2)',
                     border: `1px solid ${timerRemaining < 10 ? '#F0C9CD' : 'var(--line)'}`,
                   }}>
                <Timer size={14} />
                <span className="ff-mono font-semibold tabular">{fmtTime(timerRemaining)}</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                   style={{ background: 'var(--bg-soft)', border: '1px solid var(--line)' }}>
                <Users size={14} style={{ color: 'var(--ink-3)' }} />
                <span className="text-sm font-semibold tabular" style={{ color: 'var(--ink-2)' }}>
                  {votedCount}/{totalCount}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* The table */}
        <div className="rounded-2xl p-6 sm:p-10 felt"
             style={{ border: '1px solid var(--line)' }}>
          <div className="text-center mb-6 sm:mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full"
                 style={{ background: 'var(--bg)', border: '1px solid var(--line)' }}>
              <span className="text-[10px] uppercase tracking-[0.2em] font-semibold" style={{ color: 'var(--ink-3)' }}>
                {roomState.revealed ? 'Cartes révélées' : 'À la table'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap justify-center gap-4 sm:gap-6 mb-2">
            {active.map(([uid, p]) => (
              <ParticipantTile
                key={uid}
                participant={p}
                isHost={uid === roomState.hostId}
                revealed={roomState.revealed}
                isMe={uid === userId}
              />
            ))}
            {active.length === 0 && (
              <p className="ff-italic italic py-6" style={{ color: 'var(--ink-3)' }}>
                En attente de participants…
              </p>
            )}
          </div>

          {roomState.revealed && stats && stats.hasNumeric && (
            <div className="border-t pt-6 mt-8" style={{ borderColor: 'var(--line)' }}>
              <ResultsPanel stats={stats} />
            </div>
          )}
          {roomState.revealed && (!stats || !stats.hasNumeric) && (
            <div className="text-center py-4 mt-4 fade-up">
              <p className="ff-italic italic" style={{ color: 'var(--ink-3)' }}>
                Aucun vote chiffré à analyser.
              </p>
            </div>
          )}
        </div>

        {/* Voting deck */}
        {!roomState.revealed && !me.isObserver && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-[11px] uppercase tracking-[0.2em] font-semibold" style={{ color: 'var(--ink-3)' }}>
                Votre choix
              </h2>
              {me.hasVoted && (
                <span className="text-xs flex items-center gap-1.5 fade-up" style={{ color: 'var(--success)' }}>
                  <Check size={14} /> Vote enregistré — vous pouvez encore changer d'avis.
                </span>
              )}
            </div>
            <div className="flex flex-wrap justify-center gap-2 sm:gap-2.5 pt-2">
              {CARDS.map(card => (
                <VoteCard
                  key={card}
                  value={card}
                  selected={me.vote === card}
                  onClick={() => handleVote(card)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          {isHost && !roomState.revealed && (
            <>
              <div className="relative">
                <button
                  onClick={() => setShowTimerMenu(v => !v)}
                  disabled={!!roomState.timerEnd}
                  className="btn-ghost px-4 py-2.5 rounded-lg font-medium text-sm flex items-center gap-2 disabled:opacity-50">
                  <Clock size={16} />
                  {roomState.timerEnd ? 'Chrono actif' : 'Démarrer un chrono'}
                  <ChevronDown size={14} />
                </button>
                {showTimerMenu && !roomState.timerEnd && (
                  <div className="absolute top-full mt-2 left-0 rounded-lg overflow-hidden shadow-card z-20 fade-up"
                       style={{ background: 'var(--bg-card)', border: '1px solid var(--line)', minWidth: 160 }}>
                    {TIMER_OPTIONS.map(opt => (
                      <button key={opt.value}
                              onClick={() => handleStartTimer(opt.value)}
                              className="w-full px-4 py-2.5 text-sm text-left flex items-center gap-2 hover:opacity-70"
                              style={{ color: 'var(--ink)' }}>
                        <Timer size={14} style={{ color: 'var(--ink-3)' }} />
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={handleReveal} disabled={votedCount === 0}
                      className="btn-primary px-5 py-2.5 rounded-lg font-semibold text-sm flex items-center gap-2">
                <Eye size={16} />
                Révéler maintenant
              </button>
            </>
          )}
          {isHost && roomState.revealed && (
            <button onClick={handleNewRound}
                    className="btn-primary px-5 py-2.5 rounded-lg font-semibold text-sm flex items-center gap-2">
              <RotateCcw size={16} />
              Tour suivant
            </button>
          )}
          {!isHost && (
            <p className="text-xs ff-italic italic text-center" style={{ color: 'var(--ink-3)' }}>
              {roomState.revealed
                ? 'En attente du tour suivant…'
                : "L'animateur peut révéler les cartes ou démarrer un chrono."}
            </p>
          )}
        </div>
      </main>

      {/* Share Modal */}
      {showShareModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(26,22,20,0.5)' }}
          onClick={() => setShowShareModal(false)}
        >
          <div 
            className="rounded-2xl p-6 shadow-deep fade-up max-w-sm w-full"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--line)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="ff-display text-xl font-semibold" style={{ color: 'var(--ink)' }}>
                Partager la salle
              </h2>
              <button 
                onClick={() => setShowShareModal(false)}
                className="p-1.5 rounded-lg hover:opacity-70"
                style={{ color: 'var(--ink-3)' }}
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="flex justify-center mb-4 p-4 rounded-xl" style={{ background: 'white', border: '1px solid var(--line)' }}>
              <QRCode 
                value={shareUrl} 
                size={180}
                style={{ height: 'auto', maxWidth: '100%', width: '180px' }}
                viewBox={`0 0 256 256`}
              />
            </div>
            
            <p className="text-center text-sm mb-4" style={{ color: 'var(--ink-3)' }}>
              Scannez ce QR code ou utilisez le lien ci-dessous
            </p>
            
            <div className="flex items-center gap-2 p-2 rounded-lg mb-4" style={{ background: 'var(--bg-soft)', border: '1px solid var(--line)' }}>
              <input 
                type="text" 
                readOnly 
                value={shareUrl}
                className="flex-1 bg-transparent text-sm outline-none ff-mono"
                style={{ color: 'var(--ink)' }}
              />
              <button 
                onClick={handleShareLink}
                className="p-2 rounded-lg flex items-center gap-1.5 text-sm font-medium"
                style={{ background: copied ? 'var(--success)' : 'var(--accent)', color: 'white' }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copié !' : 'Copier'}
              </button>
            </div>
            
            <p className="text-center text-xs" style={{ color: 'var(--ink-3)' }}>
              Code de la salle : <span className="ff-mono font-bold" style={{ color: 'var(--ink)' }}>{roomId}</span>
            </p>
          </div>
        </div>
      )}

      <footer className="text-center py-8 text-xs ff-italic italic" style={{ color: 'var(--ink-3)' }}>
        Partagez le code <span className="ff-mono not-italic font-semibold" style={{ color: 'var(--ink-2)' }}>{roomId}</span> avec votre équipe.
      </footer>
    </div>
  );
}

// ============================================================
// Global footer (signature + visit counter)
// ============================================================
function GlobalFooter() {
  const [stats, setStats] = useState(null);
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;
    recordVisit().then(s => { if (s) setStats(s); });
  }, []);

  const fmt = (n) => Number(n || 0).toLocaleString('fr-FR');
  const items = stats ? [
    { label: 'visites', value: stats.visits },
    { label: 'salles', value: stats.rooms },
    { label: 'votes', value: stats.votes },
    { label: 'personnes', value: stats.users },
  ].filter(i => i.value > 0) : [];

  return (
    <div
      className="text-center px-3 py-4 text-[10px] tracking-wide"
      style={{ color: 'var(--ink-3)', opacity: 0.55 }}>
      <span>Powered by </span>
      <span className="ff-display" style={{ fontWeight: 600 }}>Ayawo AMEGANVI</span>
      {items.map((i) => (
        <span key={i.label}>
          <span className="mx-2">·</span>
          <span className="ff-mono tabular">{fmt(i.value)}</span>
          <span className="ml-1">{i.label}</span>
        </span>
      ))}
    </div>
  );
}

// ============================================================
// Floating donate button (top-right)
// ============================================================
function DonateButton({ inRoom }) {
  if (!DONATE_URL) return null;
  // In Room on mobile, the sticky header has Share + Quit icons on the right,
  // so we hide the badge below sm to avoid overlap.
  const responsiveCls = inRoom ? 'hidden sm:inline-block' : 'inline-block';
  return (
    <a
      href={DONATE_URL}
      target="_blank"
      rel="noopener noreferrer"
      title="Soutenir le développement sur Ko-fi"
      className={`${responsiveCls} fixed top-3 right-3 sm:top-4 sm:right-4 z-50 transition-transform hover:scale-[1.04]`}
      style={{ filter: 'drop-shadow(0 4px 10px rgba(26,22,20,0.18))' }}
    >
      <img
        src="https://storage.ko-fi.com/cdn/kofi3.png?v=6"
        alt="Soutenir sur Ko-fi"
        height="36"
        style={{ height: 36, border: 0, display: 'block' }}
      />
    </a>
  );
}

// ============================================================
// App
// ============================================================
const SESSION_KEY = 'pp.session';

function loadSession() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s && typeof s.roomId === 'string' && typeof s.userId === 'string') return s;
  } catch {}
  return null;
}
function saveSession(s) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch {}
}
function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch {}
}

export default function App() {
  const [view, setView] = useState('booting'); // 'booting' | 'home' | 'room'
  const [session, setSession] = useState(null);

  // Boot: try to restore session from localStorage.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const inviteRoom = (params.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const saved = loadSession();
      // If user is being invited to a different room, drop the saved session
      // and let Home handle the invite flow.
      if (saved && (!inviteRoom || inviteRoom === saved.roomId)) {
        const room = await fetchRoom(saved.roomId);
        if (cancelled) return;
        if (room && room.participants && room.participants[saved.userId]) {
          setSession(saved);
          setView('room');
          return;
        }
        clearSession();
      }
      if (!cancelled) setView('home');
    })();
    return () => { cancelled = true; };
  }, []);

  function handleJoin(data) {
    saveSession(data);
    setSession(data);
    setView('room');
  }

  async function handleLeave() {
    if (session) {
      try {
        await updateRoom(session.roomId, (r) => {
          delete r.participants[session.userId];
          if (r.hostId === session.userId) {
            const remaining = Object.keys(r.participants);
            r.hostId = remaining[0] || session.userId;
          }
          return r;
        });
      } catch {}
    }
    clearSession();
    setSession(null);
    setView('home');
  }

  return (
    <>
      <GlobalStyles />
      {view === 'booting' && (
        <div className="min-h-screen flex items-center justify-center grain">
          <div className="text-center">
            <div className="text-4xl animate-pulse mb-3" style={{ color: 'var(--accent)' }}>♠</div>
            <p className="ff-italic" style={{ color: 'var(--ink-3)' }}>Reprise de la partie…</p>
          </div>
        </div>
      )}
      {view === 'home' && <Home onJoin={handleJoin} />}
      {view === 'room' && session && (
        <Room
          roomId={session.roomId}
          userId={session.userId}
          onLeave={handleLeave}
        />
      )}
      {view !== 'booting' && <DonateButton inRoom={view === 'room'} />}
      <GlobalFooter />
    </>
  );
}
