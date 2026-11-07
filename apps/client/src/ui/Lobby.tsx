import type { Room } from '@colyseus/sdk';
import { MAX_SURVIVORS, SURVIVORS } from '@nishi/shared';
import { useEffect, useState } from 'react';
import { SERVER_URL, createRoom, forgetReconnect, hasReconnectToken, joinByCode, quickJoin, reconnect } from '../game/net';
import { netState, type NetPlayer } from '../game/session';
import { intensityValue } from '../state/settings';
import { useApp } from '../state/store';
import { Btn, ScreenFrame } from './common';

function useRoomState(room: Room | null) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!room) return;
    const cb = () => setTick((t) => t + 1);
    room.onStateChange(cb);
    return () => room.onStateChange.remove(cb);
  }, [room]);
  return room ? netState(room) : null;
}

export function Lobby() {
  const room = useApp((s) => s.room);
  const profile = useApp((s) => s.profile);
  const settings = useApp((s) => s.settings);
  const updateProfile = useApp((s) => s.updateProfile);
  const go = useApp((s) => s.go);
  const [name, setName] = useState(profile.name);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const state = useRoomState(room);

  const attach = (r: Room) => {
    r.onLeave(() => {
      if (useApp.getState().room === r) useApp.setState({ room: null });
    });
    r.onMessage('event', (e: { type: string; text?: string; tone?: 'info' | 'warn' }) => {
      if (e.type === 'message' && useApp.getState().screen === 'lobby') useApp.getState().toast({ title: e.text ?? '', tone: e.tone ?? 'info' }, 2600);
    });
    useApp.setState({ room: r });
  };

  const run = async (fn: () => Promise<Room>) => {
    setBusy(true);
    setError('');
    try {
      updateProfile((p) => ({ ...p, name: name.trim() || 'Guest' }));
      attach(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // match started → load into the game
  useEffect(() => {
    if (room && state?.phase === 'playing' && useApp.getState().screen === 'lobby') {
      useApp.setState({ start: { kind: 'multi', room } });
      go('loading');
    }
  }, [room, state?.phase, go]);

  const leave = async () => {
    forgetReconnect();
    await room?.leave(true).catch(() => undefined);
    useApp.setState({ room: null });
  };

  if (!room || !state) {
    return (
      <ScreenFrame title="Multiplayer" kicker="Up to 4 survivors · 1 Caller">
        <div className="lobby-join">
          <section className="panel">
            <h3>Your name</h3>
            <input className="text" value={name} maxLength={20} onChange={(e) => setName(e.target.value)} />
            <h3>Start</h3>
            <div className="col">
              <Btn primary disabled={busy} onClick={() => run(() => quickJoin(name, intensityValue(settings.intensity)))}>Quick match (public)</Btn>
              <Btn disabled={busy} onClick={() => run(() => createRoom(name, true, intensityValue(settings.intensity)))}>Create private room</Btn>
              <Btn disabled={busy} onClick={() => run(() => createRoom(name, false, intensityValue(settings.intensity)))}>Create public room</Btn>
            </div>
            <h3>Join with a code</h3>
            <div className="row">
              <input className="text code-input" placeholder="K7Q2M" value={code} maxLength={5} onChange={(e) => setCode(e.target.value.toUpperCase())} />
              <Btn disabled={busy || code.length !== 5} onClick={() => run(() => joinByCode(code, name))}>Join</Btn>
            </div>
            {hasReconnectToken() && (
              <Btn small disabled={busy} onClick={() => run(async () => {
                const r = await reconnect();
                if (!r) throw new Error('Your previous room has closed.');
                return r;
              })}>Rejoin previous room</Btn>
            )}
            {busy && <p className="muted">Connecting…</p>}
            {error && <p className="error">{error}</p>}
          </section>
          <section className="panel">
            <h3>How it works</h3>
            <p>Survivors explore Platform Zero together, share one inventory, and revive each other. If someone takes the <b>Caller</b> role they hunt the team with real abilities; otherwise the AI Caller hunts you.</p>
            <p>The server is authoritative: movement, pickups, puzzles, captures and the win condition are all validated there.</p>
            <h3>Testing locally</h3>
            <ol className="muted small">
              <li>Run <code>npm run dev:server</code> and <code>npm run dev</code>.</li>
              <li>Open this page in two browser windows (or a normal and a private window).</li>
              <li>Create a private room in one, join with its code in the other.</li>
            </ol>
            <p className="muted small">Server: {SERVER_URL}</p>
          </section>
        </div>
      </ScreenFrame>
    );
  }

  if (!state.players || !state.code) {
    return (
      <ScreenFrame title="Lobby" kicker="Connecting" back={null} actions={<Btn onClick={leave}>Leave room</Btn>}>
        <p className="muted">Receiving the room state…</p>
      </ScreenFrame>
    );
  }
  const players: NetPlayer[] = [];
  state.players.forEach((p) => players.push(p));
  const me = players.find((p) => p.id === room.sessionId);
  const isHost = state.hostId === room.sessionId;
  const ghostTaken = players.some((p) => p.role === 'ghost');
  const survivors = players.filter((p) => p.role === 'survivor');
  const othersReady = players.every((p) => p.ready || p.id === room.sessionId);
  const canStart = isHost && survivors.length > 0 && othersReady;

  return (
    <ScreenFrame title="Lobby" kicker={state.isPrivate ? 'Private room' : 'Public room'} back={null} actions={<Btn onClick={leave}>Leave room</Btn>}>
      <div className="lobby-room">
        <section className="panel">
          <div className="room-code">
            <span className="kicker">Room code</span>
            <span className="code">{state.code}</span>
            <Btn small onClick={() => navigator.clipboard?.writeText(state.code)}>Copy</Btn>
          </div>
          <table className="players">
            <thead>
              <tr><th>Player</th><th>Role</th><th>Character</th><th>Status</th></tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id} className={p.id === room.sessionId ? 'me' : ''}>
                  <td>{p.name}{p.isHost ? ' ★' : ''}{p.connected ? '' : ' (reconnecting…)'}</td>
                  <td>{p.role === 'ghost' ? 'The Caller' : 'Survivor'}</td>
                  <td>{p.role === 'ghost' ? '—' : SURVIVORS.find((s) => s.id === p.characterId)?.name}</td>
                  <td className={p.ready ? 'ready' : ''}>{p.isHost ? 'Host' : p.ready ? 'Ready' : 'Not ready'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small">{players.length}/5 players · {survivors.length}/{MAX_SURVIVORS} survivors · {ghostTaken ? 'a player is the Caller' : 'AI controls the Caller'}</p>
        </section>
        <section className="panel">
          <h3>Your role</h3>
          <div className="segmented">
            <button className={me?.role === 'survivor' ? 'active' : ''} onClick={() => room.send('lobby_role', { role: 'survivor' })}>Survivor</button>
            <button className={me?.role === 'ghost' ? 'active' : ''} disabled={ghostTaken && me?.role !== 'ghost'} onClick={() => room.send('lobby_role', { role: 'ghost' })}>The Caller</button>
          </div>
          {me?.role === 'survivor' && (
            <>
              <h3>Character</h3>
              <div className="segmented">
                {SURVIVORS.filter((s) => s.playable).map((s) => (
                  <button key={s.id} className={me.characterId === s.id ? 'active' : ''} onClick={() => room.send('lobby_character', { characterId: s.id })}>
                    {s.name}
                  </button>
                ))}
              </div>
              <p className="muted small">{SURVIVORS.find((s) => s.id === me.characterId)?.ability.description}</p>
            </>
          )}
          {me?.role === 'ghost' && <p className="muted small">You will hunt with Voice Deception, Apparition, Blackout, Echo Trap and Hunt. Hunting unlocks after 60 seconds.</p>}
          <div className="row lobby-actions">
            {!isHost && (
              <Btn primary={!me?.ready} onClick={() => room.send('lobby_ready', { ready: !me?.ready })}>{me?.ready ? 'Not ready' : 'Ready'}</Btn>
            )}
            {isHost && (
              <Btn primary disabled={!canStart} onClick={() => room.send('lobby_start', {})} title={canStart ? '' : 'Waiting for everyone to be ready'}>
                Start match
              </Btn>
            )}
          </div>
          {isHost && !canStart && <p className="muted small">{survivors.length ? 'Waiting for all players to be ready…' : 'At least one survivor is needed.'}</p>}
        </section>
      </div>
    </ScreenFrame>
  );
}
