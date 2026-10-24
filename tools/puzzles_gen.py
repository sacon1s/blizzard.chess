# Задачи из партий ботов Blizzard: ищем момент, когда соперник ошибся и у игрока есть единственный сильный ход.
# Решение продлевается, пока ход игрока остаётся единственным. Рейтинг задачи — по глубине, на которой
# движок находит первый ход, и по длине решения. Запуск: python3 tools/puzzles_gen.py <worker_id> <minutes> <out.jsonl> <путь к движку>
import sys, random, json, time
import chess, chess.engine

ENGINE = sys.argv[4] if len(sys.argv) > 4 else 'blizzard-linux'  # путь к движку Blizzard (native)
wid, minutes, out_path = int(sys.argv[1]), float(sys.argv[2]), sys.argv[3]
random.seed(1000 + wid * 7919 + int(time.time()))
MATE = 100000

def sc(info, color):
    return info['score'].pov(color).score(mate_score=MATE)

def is_mate(v):
    return abs(v) > MATE - 1000

def open_engine(skill=None, book=True):
    e = chess.engine.SimpleEngine.popen_uci(ENGINE)
    e.configure({'Hash': 32, 'Threads': 1, 'OwnBook': book})
    if skill: e.configure({'Skill Level': skill})
    return e

bot = open_engine(book=True)
ana = open_engine(book=False)

def only_move(board, nodes=800_000):
    """лучший ход, если он единственный; иначе None"""
    infos = ana.analyse(board, chess.engine.Limit(nodes=nodes), multipv=2)
    if not infos or 'pv' not in infos[0]:
        return None, None
    me = board.turn
    s1 = sc(infos[0], me)
    m1 = infos[0]['pv'][0]
    if len(infos) < 2 or 'pv' not in infos[1]:
        return m1, s1
    s2 = sc(infos[1], me)
    if is_mate(s1) and s1 > 0:
        return (m1, s1) if not (is_mate(s2) and s2 > 0) else (None, s1)
    if s1 >= 220 and s1 - s2 >= 220 and s2 < 180:
        return m1, s1
    return None, s1

def depth_found(board, move):
    for d in range(1, 11):
        info = ana.analyse(board, chess.engine.Limit(depth=d))
        if info.get('pv') and info['pv'][0] == move:
            return d
    return 11

def game():
    board = chess.Board()
    skills = [random.randint(2, 7), random.randint(2, 7)]
    while not board.is_game_over() and board.ply() < 160:
        bot.configure({'Skill Level': skills[0 if board.turn == chess.WHITE else 1]})
        r = bot.play(board, chess.engine.Limit(time=0.05))
        if r.move is None:
            break
        board.push(r.move)
    return board.move_stack[:]

def puzzles_from(moves):
    out = []
    b = chess.Board()
    evals = []  # оценка позиции с точки зрения того, кто ходит
    positions = []
    for m in moves:
        positions.append(b.copy())
        b.push(m)
    positions.append(b.copy())
    for p in positions:
        if p.is_game_over():
            evals.append(None); continue
        info = ana.analyse(p, chess.engine.Limit(nodes=40_000))
        evals.append(sc(info, p.turn) if 'score' in info else None)
    i = 8
    while i < len(positions) - 1:
        before, after = evals[i - 1], evals[i]
        p = positions[i]
        if before is None or after is None or p.is_game_over():
            i += 1; continue
        # соперник (ходивший из positions[i-1]) не был проигран, а после его хода у игрока большой перевес
        if before > -200 and after >= 260 and after + before >= 320:
            pz = build(positions[i - 1], moves[i - 1], p)
            if pz:
                out.append(pz)
                i += 6
                continue
        i += 1
    return out

def build(start, blunder, p):
    m1, s1 = only_move(p)
    if m1 is None:
        return None
    board = p.copy()
    sol = [m1]
    board.push(m1)
    player = p.turn
    mate_line = is_mate(s1) and s1 > 0
    for _ in range(3 if mate_line else 1):
        if board.is_game_over():
            break
        reply = ana.analyse(board, chess.engine.Limit(nodes=500_000))
        if not reply.get('pv'):
            break
        r = reply['pv'][0]
        board.push(r)
        if board.is_game_over():
            board.pop(); break
        m, s = only_move(board)
        if m is None or (mate_line and not (is_mate(s) and s > 0)):
            board.pop(); break
        sol += [r, m]
        board.push(m)
    final = ana.analyse(board, chess.engine.Limit(nodes=200_000)) if not board.is_game_over() else None
    mated = board.is_checkmate()
    if not mated and final is not None and sc(final, player) < 200:
        return None
    if mate_line and not mated:
        return None
    nplayer = (len(sol) + 1) // 2
    first_capture = p.is_capture(m1)
    d = depth_found(p, m1)
    rating = 450 + 140 * d + 170 * (nplayer - 1) + (120 if not first_capture else 0) + random.randint(-60, 60)
    if mated and nplayer == 1:
        rating = min(rating, 900)
    rating = max(400, min(2700, rating))
    themes = []
    if mated:
        themes.append(f'mateIn{nplayer}')
    else:
        themes.append('crushing' if final and sc(final, player) >= 500 else 'advantage')
    pieces = sum(1 for sq in chess.SQUARES if (pc := start.piece_at(sq)) and pc.piece_type not in (chess.PAWN, chess.KING))
    if pieces <= 4:
        themes.append('endgame')
    themes.append('oneMove' if nplayer == 1 else 'short' if nplayer == 2 else 'long')
    return {'fen': start.fen(), 'moves': ' '.join(m.uci() for m in [blunder] + sol), 'rating': rating, 'themes': themes, 'd': d, 'cap': bool(first_capture)}

end = time.time() + minutes * 60
n = 0
with open(out_path, 'a') as f:
    while time.time() < end:
        try:
            for pz in puzzles_from(game()):
                f.write(json.dumps(pz) + '\n'); f.flush(); n += 1
        except chess.engine.EngineTerminatedError:
            bot = open_engine(book=True); ana = open_engine(book=False)
        except Exception as e:  # одна плохая партия не должна останавливать генерацию
            print('skip:', e, file=sys.stderr)
print('worker', wid, 'puzzles', n)
bot.quit(); ana.quit()
