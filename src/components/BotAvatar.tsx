// Аватар бота: логотип Blizzard на сером фоне, чем сильнее бот — тем темнее.
export function BotAvatar({ level, size = 44 }: { level: number; size?: number }) {
  const shade = Math.round(255 - (level - 1) * 22);
  return (
    <span className="bot-av" style={{ width: size, height: size, background: `rgb(${shade},${shade},${shade})`, color: level > 5 ? '#fff' : '#000' }}>
      <img src="logo.svg" alt="" style={{ filter: level > 5 ? 'none' : 'invert(1)' }} />
      <b>{level}</b>
    </span>
  );
}
