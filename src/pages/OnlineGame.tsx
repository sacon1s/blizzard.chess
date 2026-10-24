// Партия онлайн: доска, часы по серверному времени, ничья, сдача, отмена; приглашение по ссылке; итог с рейтингом.
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import Board from '../components/Board';
import { PlayerBar, MoveList, NavButtons, useArrowKeys } from '../components/GameParts';
import { Icon } from '../components/icons';
import { START_FEN, newPos, play, resultText, type MoveRec } from '../lib/chess';
import { useAuth } from '../lib/auth';
import { watchGame, joinGame, sendMove, claimTimeout, resign, abort, offerDraw, answerDraw, claimAbandon, presence, recordStart, settle, serverNow, movesOf, tcName, SPEED_LABEL, LEAVE_MS, type OGame } from '../lib/online';
import { useSettings, saveGame } from '../lib/store';
import { playSound, soundFor } from '../lib/sound';
import { materialDiff } from './BotGame';
import { go } from '../lib/router';
import { dropChallenge } from '../lib/social';

export default function OnlineGame({ id }: { id?: string }) {
  const [g, setG] = useState<OGame | null | undefined>(undefined);
  useEffect(() => { if (!id) { setG(null); return; } setG(undefined); return watchGame(id, setG); }, [id]);
  if (g === undefined) return <div className="page narrow"><p className="muted">Loading the game…</p></div>;
  if (g === null) {
    return (
      <div className="page narrow">
        <h1>Game not found</h1>
        <p className="muted">The link may be wrong, or the game was removed.</p>
        <button className="btn primary" onClick={() => go('/')}>Find a game</button>
      </div>
    );
  }
  if (g.status === 'open' || (g.status === 'aborted' && !g.moves && (!g.white || !g.black))) return <Invite g={g} />;
  return <Live key={g.id} g={g} />;
}

function Invite({ g }: { g: OGame }) {
  const { user, profile } = useAuth();
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');
  const link = location.href;
  const host = g.host === (user && user.uid);
  const hostName = g.wName || g.bName || 'A player';
  if (g.status === 'aborted') {
    return (
      <div className="page narrow">
        <h1>Challenge cancelled</h1>
        <button className="btn primary" onClick={() => go('/')}>Find a game</button>
      </div>
    );
  }
  return (
    <div className="page narrow invite">
      <h1>{host ? 'Waiting for your friend' : `${hostName} challenges you`}</h1>
      <p className="muted">{tcName(g.tc)} · {SPEED_LABEL[g.speed]} · casual (no rating change). {host ? (g.invited ? 'Challenge sent. The game starts when your friend accepts it. You can also send this link.' : 'Send this link. The game starts when your friend opens it and joins.') : ''}</p>
      {host ? (
        <>
          <div className="copy-row">
            <input readOnly value={link} onFocus={(e) => e.target.select()} aria-label="Game link" />
            <button className="btn primary" onClick={() => navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }, () => {})}><Icon.copy />{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <span className="waiting" aria-hidden="true"><i /><i /><i /></span>
          <button className="btn ghost" onClick={() => { if (g.invited) dropChallenge(g.invited, g.id).catch(() => {}); abort(g.id).then(() => go('/')); }}>Cancel challenge</button>
        </>
      ) : !user ? (
        <button className="btn primary big" onClick={() => go('/login')}>Sign in to play</button>
      ) : !profile ? (
        <button className="btn primary big" onClick={() => go('/login')}>Choose a username to play</button>
      ) : (
        <>
          <button className="btn primary big" onClick={() => joinGame(g.id, profile).then((r) => { dropChallenge(profile.uid, g.id).catch(() => {}); if (!r.committed) setErr('Someone else already joined this game.'); }, () => setErr('Couldn’t join. Check your connection.'))}>Join the game</button>
          {err && <p className="error" role="alert">{err}</p>}
        </>
      )}
    </div>
  );
}

function Live({ g }: { g: OGame }) {
  const s = useSettings();
  const { user } = useAuth();
  const uid = user ? user.uid : '';
  const myColor: 0 | 1 | null = g.white === uid ? 0 : g.black === uid ? 1 : null;
  const [orient, setOrient] = useState<0 | 1>(myColor ?? 0);
  const [pending, setPending] = useState<string | null>(null);
  const [view, setView] = useState(-1); // -1 — следить за последним ходом
  const [, tick] = useReducer((x: number) => x + 1, 0);
  const [delta, setDelta] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [drawSent, setDrawSent] = useState(false);
  const [resignArm, setResignArm] = useState(false);
  useEffect(() => { if (!resignArm) return; const t = setTimeout(() => setResignArm(false), 3000); return () => clearTimeout(t); }, [resignArm]);
  const live = g.status === 'started';

  // ходы: из базы + свой ещё не подтверждённый
  const ucis = useMemo(() => { const m = movesOf(g); return pending && m.length % 2 === myColor ? [...m, pending] : m; }, [g.moves, pending, myColor]); // eslint-disable-line react-hooks/exhaustive-deps
  const moves = useMemo(() => { const p = newPos(), out: MoveRec[] = []; for (const u of ucis) { const r = play(p, u); if (!r) break; out.push(r); } return out; }, [ucis]);
  const N = moves.length;
  const shown = view < 0 || view > N ? N : view;
  const fen = shown === 0 ? START_FEN : moves[shown - 1].fenAfter;
  const sideToMove = (N & 1) as 0 | 1;
  const liveFen = N === 0 ? START_FEN : moves[N - 1].fenAfter;
  const [premoves, setPremoves] = useState<string[]>([]);
  const onPremove = (u: string | null) => setPremoves((l) => (u ? [...l, u] : []));

  // звук чужого хода
  const lastN = useRef(N);
  useEffect(() => {
    if (N > lastN.current && moves[N - 1] && moves[N - 1].color !== myColor) playSound(soundFor(moves[N - 1]));
    lastN.current = N;
  }, [N]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (pending && (movesOf(g).length % 2 !== myColor || g.status !== 'started')) setPending(null); }, [g.moves, g.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // присутствие и запись в историю
  useEffect(() => { if (myColor === null || !live) return; recordStart(g, uid).catch(() => {}); return presence(g.id, uid); }, [myColor, live]); // eslint-disable-line react-hooks/exhaustive-deps

  // часы
  useEffect(() => { if (!live) return; const t = setInterval(tick, 100); return () => clearInterval(t); }, [live]);
  const clockOf = (side: 0 | 1) => {
    const base = side === 0 ? g.clock.w : g.clock.b;
    const ms = movesOf(g).length;
    if (!live || ms < 2 || (ms & 1) !== side) return base;
    return base - (serverNow() - g.clock.last);
  };
  const flagSent = useRef(0);
  useEffect(() => {
    if (!live) return;
    const ms = movesOf(g).length;
    if (ms < 2) return;
    const side = (ms & 1) as 0 | 1;
    if (clockOf(side) <= 0 && Date.now() - flagSent.current > 2000) { flagSent.current = Date.now(); claimTimeout(g.id).catch(() => {}); }
  });

  // конец партии: рейтинг и сохранение для разбора
  useEffect(() => {
    if (g.status !== 'over' && g.status !== 'aborted') return;
    if (myColor !== null) settle(g, uid).then((d) => setDelta(d), () => {});
    if (g.status === 'over' && g.result && N > 0) {
      saveGame({
        id: g.id, date: new Date(g.created || Date.now()).toISOString(), white: g.wName || 'White', black: g.bName || 'Black', startFen: START_FEN,
        moves: movesOf(g), sans: moves.map((m) => m.san), result: g.result, reason: g.reason || '', source: 'online', playerColor: myColor ?? undefined,
        event: `${g.rated ? 'Rated' : 'Casual'} ${SPEED_LABEL[g.speed].toLowerCase()} game`,
      });
    }
  }, [g.status, g.settled && uid ? g.settled[uid] : undefined]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMove = (uci: string): boolean => {
    if (myColor === null || !live || sideToMove !== myColor || pending) return false;
    const p = newPos(liveFen), rec = play(p, uci);
    if (!rec) return false;
    setPending(rec.uci); setView(-1);
    playSound(soundFor(rec));
    sendMove(g.id, rec.uci, myColor).then((r) => { if (!r.committed) setPending(null); }, () => setPending(null));
    return true;
  };
  // предход: как только соперник сходил, сыграть его (если ход легален)
  useEffect(() => {
    if (!premoves.length) return;
    if (!live) { setPremoves([]); return; }
    if (myColor !== null && sideToMove === myColor && !pending) {
      const [u, ...rest] = premoves;
      setPremoves(onMove(u) ? rest : []);
    }
  }, [N, live]); // eslint-disable-line react-hooks/exhaustive-deps
  const onView = useCallback((i: number) => setView(i >= N ? -1 : Math.max(0, i)), [N]);
  useArrowKeys(shown, N, onView);

  const run = (f: () => Promise<unknown>) => { setBusy(true); f().catch(() => {}).finally(() => setBusy(false)); };
  const diff = useMemo(() => materialDiff(fen), [fen]);
  const top = (orient ^ 1) as 0 | 1, bottom = orient;
  const nameOf = (c: 0 | 1) => (c === 0 ? g.wName : g.bName) || '…';
  const subOf = (c: 0 | 1) => {
    const r = c === 0 ? g.wRating : g.bRating, d = c === 0 ? diff : -diff;
    return [g.rated && r ? String(Math.round(r)) : '', d > 0 ? `+${d}` : ''].filter(Boolean).join('  ');
  };
  const oppUid = myColor === null ? '' : (myColor === 0 ? g.black : g.white) || '';
  const oppLeft = live && oppUid && g.left && g.left[oppUid] ? serverNow() - g.left[oppUid] : 0;
  const nMoves = movesOf(g).length;
  const won = g.result && myColor !== null && ((g.result === '1-0') === (myColor === 0)) && g.result !== '1/2-1/2';
  const drawn = g.result === '1/2-1/2';
  const offerFromOpp = live && g.drawOffer && g.drawOffer !== uid && myColor !== null;
  useEffect(() => { if (!g.drawOffer) setDrawSent(false); }, [g.drawOffer]);

  return (
    <div className="game-layout fixed-panel">
      <div className="board-col">
        <PlayerBar color={top} name={nameOf(top)} sub={subOf(top)} avatar={<Icon.user />} clock={clockOf(top)} running={live && nMoves >= 2 && sideToMove === top} />
        <Board fen={fen} orientation={orient} movable={myColor !== null && live && shown === N && !pending ? myColor : null}
          premovable={myColor !== null && live && shown === N && s.premove ? myColor : null} premoves={premoves} onPremove={onPremove}
          lastMove={shown > 0 ? moves[shown - 1] : null} animate onMove={onMove} theme={s.theme} coords={s.showCoords} autoQueen={s.autoQueen} />
        <PlayerBar color={bottom} name={nameOf(bottom)} sub={subOf(bottom)} avatar={<Icon.user />} clock={clockOf(bottom)} running={live && nMoves >= 2 && sideToMove === bottom} />
      </div>
      <aside className="side-panel">
        <div className="panel-head">
          <span className="tc-chip"><Icon.clock /></span>
          <div><b>{tcName(g.tc)} {SPEED_LABEL[g.speed]}</b><span>{g.rated ? 'Rated' : 'Casual'}{myColor === null ? ' · watching' : ''}</span></div>
        </div>
        {g.status === 'aborted' && (
          <div className="result-card draw">
            <h2>Game aborted</h2>
            <p>No rating change.</p>
            <div className="row"><button className="btn primary" onClick={() => go('/')}>New game</button></div>
          </div>
        )}
        {g.status === 'over' && (
          <div className={'result-card' + (myColor === null ? ' draw' : won ? ' win' : drawn ? ' draw' : ' loss')}>
            <h2>{myColor === null ? (drawn ? 'Draw' : g.result === '1-0' ? 'White won' : 'Black won') : won ? 'You won' : drawn ? 'Draw' : 'You lost'}</h2>
            <p>{resultText(g.result ? { result: g.result, reason: g.reason || '' } : null)}{g.rated && delta !== null ? <> · rating <b>{delta >= 0 ? '+' : '−'}{Math.abs(delta)}</b></> : null}</p>
            <div className="row">
              <button className="btn primary" onClick={() => go('/review/' + g.id)}><Icon.review />Game review</button>
              <button className="btn" onClick={() => go('/online?tc=' + encodeURIComponent(g.tc))}>New {tcName(g.tc)}</button>
            </div>
          </div>
        )}
        {live && nMoves < 2 && myColor !== null && (
          <p className="notice">{nMoves === 0 ? (myColor === 0 ? 'Your move. The clocks start after both sides have moved.' : 'Waiting for White’s first move.') : myColor === 1 ? 'Your move.' : 'Waiting for Black’s first move.'}</p>
        )}
        {oppLeft > 0 && (
          <div className="notice warn">
            <span>Your opponent left the game.{oppLeft < LEAVE_MS ? ` You can claim the win in ${Math.ceil((LEAVE_MS - oppLeft) / 1000)} s.` : ''}</span>
            {oppLeft >= LEAVE_MS && <button className="btn primary" disabled={busy} onClick={() => run(() => claimAbandon(g.id, myColor!))}>{nMoves < 2 ? 'Abort game' : 'Claim the win'}</button>}
          </div>
        )}
        {offerFromOpp && (
          <div className="notice">
            <span>Your opponent offers a draw.</span>
            <div className="row">
              <button className="btn primary" disabled={busy} onClick={() => run(() => answerDraw(g.id, uid, true))}>Accept</button>
              <button className="btn" disabled={busy} onClick={() => run(() => answerDraw(g.id, uid, false))}>Decline</button>
            </div>
          </div>
        )}
        <MoveList moves={moves} view={shown} onView={onView} />
        <NavButtons view={shown} total={N} onView={onView} onFlip={() => setOrient((orient ^ 1) as 0 | 1)} />
        {live && myColor !== null && (
          <div className="actions">
            {nMoves < 2 ? (
              <button className="btn" disabled={busy} onClick={() => run(() => abort(g.id))}>Abort</button>
            ) : (
              <>
                <button className="btn" disabled={busy || drawSent || !!g.drawOffer} onClick={() => { setDrawSent(true); run(() => offerDraw(g.id, uid)); }}><Icon.handshake />{g.drawOffer === uid ? 'Draw offered' : 'Draw'}</button>
                <button className="btn danger" disabled={busy} onClick={() => { if (resignArm) { setResignArm(false); run(() => resign(g.id, myColor)); } else setResignArm(true); }}><Icon.flag />{resignArm ? 'Confirm resign' : 'Resign'}</button>
              </>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}
