# Уведомления Blizzard Chess, когда сайт закрыт

Бесплатный тариф Firebase не умеет сам отправлять уведомления, поэтому их отправляет этот маленький посредник —
Cloudflare Worker (`worker.js`, без зависимостей). Бесплатного тарифа Cloudflare хватает с запасом,
банковская карта не нужна.

Что он делает: после хода в партии по переписке (или её конца), вызова на партию или заявки в друзья сайт
просит посредника уведомить другого игрока. Посредник проверяет вход игрока (токен Firebase) и по базе —
что событие настоящее, и отправляет Web Push на все устройства получателя (до пяти).

## Как включить (один раз, минут десять)

1. Зарегистрируйтесь на [dash.cloudflare.com](https://dash.cloudflare.com/sign-up) (бесплатно).
2. **Workers & Pages → Create → Create Worker.** Имя: `blizzard-push`. Нажмите **Deploy**.
3. **Edit code**: удалите пример, вставьте всё содержимое `worker.js`, нажмите **Deploy**.
4. **Хранилище.** Слева **Storage & Databases → KV → Create** (имя `blizzard-push`).
   Затем откройте свой Worker → **Settings → Bindings → Add → KV namespace**: Variable name — `PUSH`,
   namespace — `blizzard-push`. Сохраните (**Deploy**).
5. Скопируйте адрес Worker'а (вида `https://blizzard-push.<ваше-имя>.workers.dev`) и впишите его в
   `public/config.json` и `docs/config.json` сайта:

       { "pushUrl": "https://blizzard-push.<ваше-имя>.workers.dev" }

Проверка: откройте адрес Worker'а в браузере — должно быть `{"ok":true,...}`.

Ключи VAPID создаются сами при первом запросе и хранятся в KV. Если их удалить, все подписки перестанут
работать, и игрокам нужно будет снова включить уведомления в настройках.

Через командную строку вместо шагов 2–4: `npx wrangler kv namespace create PUSH`, вписать id в
`wrangler.toml`, затем `npx wrangler deploy`.
