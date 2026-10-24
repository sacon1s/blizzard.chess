// Главная: доска сама разыгрывает «оперную партию» Морфи, ниже — разделы сайта.
import { useEffect, useMemo, useState } from 'react';
import Board from '../components/Board';
import { Icon } from '../components/icons';
import { E, START_FEN, newPos, play, type MoveRec } from '../lib/chess';
import { useSettings, savedGames } from '../lib/store';
import { useAuth, useOnlineCount } from '../lib/auth';
import { go } from '../lib/router';
import { GameRow } from './Review';

const OPERA = '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8#';

function DemoBoard() {
  const s = useSettings();
  const ucis = useMemo<string[]>(() => E.parsePgn(OPERA).moves, []);
  const [k, setK] = useState(0);
  const recs = useMemo(() => { const p = newPos(), out: MoveRec[] = []; for (const u of ucis) out.push(play(p, u)!); return out; }, [ucis]);
  useEffect(() => {
    const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (still) { setK(recs.length); return; }
    const t = setTimeout(() => setK((x) => (x >= recs.length ? 0 : x + 1)), k === 0 ? 1400 : k >= recs.length ? 5000 : 1100);
    return () => clearTimeout(t);
  }, [k, recs.length]);
  const fen = k === 0 ? START_FEN : recs[k - 1].fenAfter;
  return (
    <figure className="demo">
      <Board fen={fen} orientation={0} movable={null} lastMove={k ? recs[k - 1] : null} animate theme={s.theme} coords={false} />
      <figcaption>Paul Morphy against the Duke of Brunswick and Count Isouard, Paris 1858{k ? <>: <b>{Math.ceil(k / 2)}{k % 2 ? '.' : '…'} {recs[k - 1].san}</b></> : null}</figcaption>
    </figure>
  );
}

export default function Home() {
  const { profile } = useAuth();
  const online = useOnlineCount();
  const games = savedGames().slice(0, 4);
  return (
    <div className="home">
      <section className="hero">
        <div className="hero-text">
          <h1>Blizzard<br />Chess</h1>
          <p className="lede">Play people and bots, review every game with a 3200-rated engine and solve puzzles. All of it free.</p>
          <div className="row">
            <button className="btn primary big" onClick={() => go('/online')}><Icon.online />Play online</button>
            <button className="btn big" onClick={() => go('/bots')}><Icon.bot />Play a bot</button>
          </div>
          <p className="hero-note">
            {online ? <>{online} {online === 1 ? 'player' : 'players'} online now. </> : null}
            {profile ? <>Signed in as <a href={'#/profile/' + profile.name}>{profile.name}</a>.</> : <><a href="#/login">Create an account</a> to play rated games.</>}
          </p>
        </div>
        <DemoBoard />
      </section>

      <section className="features">
        <a className="feature" href="#/online">
          <Icon.online />
          <h2>Play online</h2>
          <p>Rated games from bullet to classical. Ratings start at 1200 and move after every game.</p>
        </a>
        <a className="feature" href="#/bots">
          <Icon.bot />
          <h2>Ten bots</h2>
          <p>From a beginner who leaves pieces hanging to Blizzard at full strength. Hints and takebacks included.</p>
        </a>
        <a className="feature" href="#/review">
          <Icon.review />
          <h2>Game review</h2>
          <p>Every move rated from brilliant to blunder, with accuracy and the move you should have played.</p>
        </a>
        <a className="feature" href="#/puzzles">
          <Icon.puzzle />
          <h2>Puzzles</h2>
          <p>Tactics at your level. Find the winning move, then the next one.</p>
        </a>
      </section>

      {games.length > 0 && (
        <section className="home-recent">
          <h2>Continue where you left off</h2>
          <ul className="game-list">{games.map((g) => <GameRow key={g.id} g={g} />)}</ul>
        </section>
      )}

      <footer className="foot">
        <p>Blizzard Chess runs on <a href="https://sacon1s.github.io/blizzard/">Blizzard 0.9</a>, an open-source engine that plays in your browser.</p>
        <p><a href="https://github.com/sacon1s/blizzard.chess">Source on GitHub</a></p>
      </footer>
    </div>
  );
}
