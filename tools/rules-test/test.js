// проверка правил базы на типичных действиях сайта и на попытках подделки
const targaryen = require('targaryen');
const rules = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'));
const A = { uid: 'alice' }, B = { uid: 'bob' }, C = { uid: 'carol' };
const zero = { bullet: 0, blitz: 0, rapid: 0, classical: 0 }, r1200 = { bullet: 1200, blitz: 1200, rapid: 1200, classical: 1200 };
const user = (name, extra = {}) => ({ name, created: 1, ratings: { ...r1200 }, games: { ...zero }, wins: 0, draws: 0, losses: 0, ...extra });
const game = (extra = {}) => ({ tc: '3+0', base: 180000, inc: 0, speed: 'blitz', rated: true, created: 1, moves: '', clock: { w: 180000, b: 180000, last: 0 }, ...extra });
const base = {
  names: { alice: 'alice', bob: 'bob', carol: 'carol' },
  users: { alice: user('Alice'), bob: user('Bob'), carol: user('Carol') },
  games: {
    g1: game({ white: 'alice', black: 'bob', wName: 'Alice', bName: 'Bob', status: 'started', moves: 'e2e4' }),
    g2: game({ white: 'alice', black: 'bob', status: 'over', result: '1-0', reason: 'resign', settled: { alice: 20 } }),
    open1: game({ white: 'alice', wName: 'Alice', host: 'alice', status: 'open', rated: false }),
  },
};
let db = targaryen.database(rules, base);
let fails = 0, n = 0;
function t(name, expect, fn) {
  n++;
  let r;
  try { r = fn(db); } catch (e) { console.log('ИСКЛЮЧЕНИЕ', name, e.message); fails++; return; }
  const ok = r.allowed === expect;
  if (!ok) { fails++; console.log((expect ? 'ЗАПРЕЩЕНО, а должно быть можно: ' : 'РАЗРЕШЕНО, а не должно: ') + name); console.log(r.info.split('\n').slice(0, 30).join('\n')); }
  return r;
}
const ok = (name, fn) => t(name, true, fn), no = (name, fn) => t(name, false, fn);
const W = (auth, path, v) => (d) => d.as(auth).write(path, v);
const U = (auth, path, v) => (d) => d.as(auth).update(path, v);

// профиль
ok('новый игрок создаёт профиль', (d) => d.with({}).as({ uid: 'dan' }).write('/names/dan', 'dan').newDatabase.as({ uid: 'dan' }).write('/users/dan', user('Dan')));
no('профиль с чужим именем', W({ uid: 'dan' }, '/users/dan', user('Alice')));
no('профиль с рейтингом 3000', (d) => d.as({ uid: 'dan' }).write('/names/dan', 'dan').newDatabase.as({ uid: 'dan' }).write('/users/dan', user('Dan', { ratings: { ...r1200, blitz: 3000 } })));
no('писать в чужой профиль', U(B, '/users/alice', { about: 'hi' }));
ok('о себе, страна, фото', U(A, '/users/alice', { about: 'Hello', country: 'ru', avatar: 'p', photo: 'data:image/jpeg;base64,AAAA' }));
no('страна не из двух букв', U(A, '/users/alice', { country: 'Russia' }));
no('рейтинг блица сразу 3000', U(A, '/users/alice/ratings', { blitz: 3000 }));
no('рейтинг +40 без партии', U(A, '/users/alice/ratings', { blitz: 1240 }));
ok('итог партии: +20 и игра +1 (транзакция целиком)', W(A, '/users/alice', { ...user('Alice'), ratings: { ...r1200, blitz: 1220 }, games: { ...zero, blitz: 1 }, wins: 1 }));
no('итог партии: +60', W(A, '/users/alice', { ...user('Alice'), ratings: { ...r1200, blitz: 1260 }, games: { ...zero, blitz: 1 }, wins: 1 }));
no('побед сразу +5', U(A, '/users/alice', { wins: 5 }));
ok('ничья, рейтинг не изменился', W(A, '/users/alice', { ...user('Alice'), games: { ...zero, blitz: 1 }, draws: 1 }));
ok('рейтинг задач', U(A, '/users/alice', { puzzle: { rating: 1350, solved: 3, failed: 1 } }));
ok('достижение', W(A, '/users/alice/ach/win1', 1700000000000));
ok('рекорд Rush', W(A, '/users/alice/rush', 25));
ok('история рейтинга', W(A, '/users/alice/hist/blitz/k1', { r: 1220, t: 5 }));
no('занять чужое имя', W(C, '/names/alice', 'carol'));
no('удалить своё имя', W(A, '/names/alice', null));
no('имя с пробелом', W({ uid: 'dan' }, '/names/d n', 'dan'));
ok('на сайте', W(A, '/online/alice', 123));
no('чужое присутствие', W(B, '/online/alice', 123));

// поиск соперника
ok('встать в очередь', W(C, '/seeks/3+0', { carol: { name: 'Carol', rating: 1200, t: 1 } }));
no('поставить в очередь другого', W(C, '/seeks/3+0', { bob: { name: 'Bob', rating: 1200, t: 1 } }));
ok('найти соперника в очереди (убрать его)', (d) => d.as(B).write('/seeks/3+0', { carol: { name: 'Carol', rating: 1200, t: 1 } }).newDatabase.as(A).write('/seeks/3+0', null));
ok('создать партию с соперником из очереди', W(A, '/games/g9', game({ white: 'carol', black: 'alice', status: 'started' })));
no('создать партию за двух других', W(A, '/games/g9', game({ white: 'carol', black: 'bob', status: 'started' })));
ok('сообщить сопернику о партии', W(A, '/matches/bob', 'g1'));
no('подсунуть чужую партию', W(C, '/matches/bob', 'g1'));
ok('убрать своё сообщение', W(B, '/matches/bob', null));

// партия
ok('ход (транзакция целиком)', W(B, '/games/g1', { ...base.games.g1, moves: 'e2e4 e7e5', clock: { w: 180000, b: 179000, last: 9 } }));
no('переписать ходы', W(B, '/games/g1', { ...base.games.g1, moves: 'd2d4' }));
no('посторонний делает ход', W(C, '/games/g1', { ...base.games.g1, moves: 'e2e4 e7e5' }));
ok('сдаться', W(A, '/games/g1', { ...base.games.g1, status: 'over', result: '0-1', reason: 'resign' }));
no('удалить партию', W(A, '/games/g1', null));
no('подменить соперника', W(A, '/games/g1', { ...base.games.g1, black: 'carol' }));
no('убрать соперника', (d) => { const g = { ...base.games.g1 }; delete g.black; return d.as(A).write('/games/g1', g); });
no('поменять итог законченной', W(B, '/games/g2', { ...base.games.g2, result: '0-1' }));
no('воскресить законченную', W(A, '/games/g2', { ...base.games.g2, status: 'started' }));
ok('учесть итог у себя (settled)', W(B, '/games/g2/settled/bob', -20));
no('учесть итог за соперника', W(A, '/games/g2/settled/bob', -40));
no('переписать свой settled', W(A, '/games/g2/settled/alice', 40));
ok('предложить ничью', U(A, '/games/g1', { drawOffer: 'alice' }));
no('предложить ничью от имени соперника', U(A, '/games/g1', { drawOffer: 'bob' }));
ok('чат игрока', W(A, '/games/g1/chat/m1', { u: 'alice', n: 'Alice', m: 'gl', t: 1 }));
no('чат от чужого имени', W(A, '/games/g1/chat/m1', { u: 'bob', n: 'Bob', m: 'gl', t: 1 }));
no('чат зрителя', W(C, '/games/g1/chat/m1', { u: 'carol', n: 'Carol', m: 'hi', t: 1 }));
ok('ушёл из партии (присутствие)', W(A, '/games/g1/left/alice', 5));
ok('предложить реванш', W(A, '/games/g2/rematch', { gid: 'r1', by: 'alice' }));
no('реванш от имени соперника', W(A, '/games/g2/rematch', { gid: 'r1', by: 'bob' }));

// партия с другом
ok('создать открытую партию', W(C, '/games/o2', game({ black: 'carol', bName: 'Carol', host: 'carol', status: 'open', rated: false })));
ok('войти в открытую партию', W(B, '/games/open1', { ...base.games.open1, black: 'bob', bName: 'Bob', status: 'started' }));
no('войти в открытую за другого', W(B, '/games/open1', { ...base.games.open1, black: 'carol', status: 'started' }));
no('посторонний меняет контроль открытой', W(B, '/games/open1', { ...base.games.open1, tc: '1+0' }));
no('сделать открытую рейтинговой', W(B, '/games/open1', { ...base.games.open1, rated: true }));
ok('хозяин отменяет открытую', W(A, '/games/open1', { ...base.games.open1, status: 'aborted' }));
ok('вызвать друга', W(A, '/challenges/bob/open1', { from: 'alice', name: 'Alice', tc: '3+0', t: 1 }));
no('вызов от чужого имени', W(C, '/challenges/bob/open1', { from: 'alice', name: 'Alice', tc: '3+0', t: 1 }));
no('вызов на чужую партию', W(C, '/challenges/bob/open1', { from: 'carol', name: 'Carol', tc: '3+0', t: 1 }));
ok('отклонить вызов', (d) => d.as(A).write('/challenges/bob/open1', { from: 'alice', name: 'Alice', tc: '3+0', t: 1 }).newDatabase.as(B).write('/challenges/bob/open1', null));
ok('отозвать свой вызов', (d) => d.as(A).write('/challenges/bob/open1', { from: 'alice', name: 'Alice', tc: '3+0', t: 1 }).newDatabase.as(A).write('/challenges/bob/open1', null));
no('удалить чужой вызов', (d) => d.as(A).write('/challenges/bob/open1', { from: 'alice', name: 'Alice', tc: '3+0', t: 1 }).newDatabase.as(C).write('/challenges/bob/open1', null));

// друзья
ok('заявка в друзья', W(A, '/friendRequests/bob/alice', { name: 'Alice', t: 1 }));
no('заявка от чужого имени', W(C, '/friendRequests/bob/alice', { name: 'Alice', t: 1 }));
ok('принять заявку', (d) => d.as(A).write('/friendRequests/bob/alice', { name: 'Alice', t: 1 }).newDatabase.as(B).update('/', { 'friends/alice/bob': { name: 'Bob', since: 1 }, 'friends/bob/alice': { name: 'Alice', since: 1 }, 'friendRequests/bob/alice': null }));
no('добавить себя в друзья без заявки', W(C, '/friends/bob/carol', { name: 'Carol', since: 1 }));
ok('удалить друга', (d) => d.as(A).write('/friendRequests/bob/alice', { name: 'Alice', t: 1 }).newDatabase.as(B).update('/', { 'friends/alice/bob': { name: 'Bob', since: 1 }, 'friends/bob/alice': { name: 'Alice', since: 1 }, 'friendRequests/bob/alice': null }).newDatabase.as(A).update('/', { 'friends/alice/bob': null, 'friends/bob/alice': null }));

// арены
const aid = 'blitz-2026102518';
ok('войти в арену', W(A, `/arenas/${aid}/players/alice`, { name: 'Alice', score: 0, streak: 0, games: 0, rating: 1200, sheet: '' }));
no('войти сразу с очками', W(A, `/arenas/${aid}/players/alice`, { name: 'Alice', score: 50, streak: 0, games: 0, rating: 1200, sheet: '' }));
ok('победа в арене +2', (d) => d.as(A).write(`/arenas/${aid}/players/alice`, { name: 'Alice', score: 0, streak: 0, games: 0, rating: 1200, sheet: '' }).newDatabase.as(A).write(`/arenas/${aid}/players/alice`, { name: 'Alice', score: 2, streak: 1, games: 1, rating: 1200, sheet: '2', done: { g1: true } }));
no('очки без партии', (d) => d.as(A).write(`/arenas/${aid}/players/alice`, { name: 'Alice', score: 0, streak: 0, games: 0, rating: 1200, sheet: '' }).newDatabase.as(A).write(`/arenas/${aid}/players/alice`, { name: 'Alice', score: 4, streak: 1, games: 0, rating: 1200, sheet: '2' }));
no('арена с выдуманным id', W(A, '/arenas/x/players/alice', { name: 'Alice', score: 0, streak: 0, games: 0, rating: 1200, sheet: '' }));

// история и прочее
ok('своя история партий', W(A, '/userGames/alice/g1', { opp: 'bob', oppName: 'Bob', color: 0, tc: '3+0', speed: 'blitz', rated: true, date: 1, pending: true }));
no('чужая история', W(B, '/userGames/alice/g1', { opp: 'bob' }));
no('запись в корень', W(A, '/hack', 1));
no('без входа', W(null, '/online/alice', 1));
console.log(`${n - fails} из ${n} проверок прошли`);
process.exit(fails ? 1 : 0);
