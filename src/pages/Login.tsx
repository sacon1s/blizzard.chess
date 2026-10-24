// Вход и регистрация: почта и пароль или Google; после первого входа — выбор имени игрока.
import { useEffect, useState } from 'react';
import { useAuth, signInGoogle, signInEmail, signUpEmail, createProfile, nameError, logOut } from '../lib/auth';
import { go } from '../lib/router';

function authMessage(e: any): string {
  const code = String((e && e.code) || '');
  const map: Record<string, string> = {
    'auth/invalid-email': 'This email address isn’t valid.',
    'auth/missing-password': 'Enter a password.',
    'auth/weak-password': 'Use a password of at least 6 characters.',
    'auth/email-already-in-use': 'An account with this email already exists. Sign in instead.',
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/wrong-password': 'Wrong email or password.',
    'auth/user-not-found': 'No account with this email. Create one instead.',
    'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
    'auth/popup-closed-by-user': 'The Google window was closed before signing in.',
    'auth/popup-blocked': 'The browser blocked the Google window. Allow pop-ups for this site and try again.',
    'auth/network-request-failed': 'No connection. Check your internet and try again.',
    'auth/operation-not-allowed': 'This sign-in method is turned off for the site.',
    'auth/unauthorized-domain': 'Sign-in isn’t allowed from this address yet.',
  };
  return map[code] || 'Sign-in failed. Try again.';
}

export default function Login() {
  const { user, profile, loading } = useAuth();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (profile) go('/profile/' + profile.name); }, [profile]);

  async function run(f: () => Promise<unknown>) {
    setBusy(true); setErr('');
    try { await f(); } catch (e) { setErr(authMessage(e)); }
    setBusy(false);
  }
  async function pickName(ev: React.FormEvent) {
    ev.preventDefault();
    const e = nameError(name.trim());
    if (e) { setErr(e); return; }
    setBusy(true); setErr('');
    try { const r = await createProfile(name.trim()); if (r) setErr(r); } catch { setErr('Couldn’t save the name. Try again.'); }
    setBusy(false);
  }

  if (loading) return <div className="page narrow"><p className="muted">Loading…</p></div>;

  if (user && !profile) {
    return (
      <div className="page narrow auth">
        <h1>Choose your name</h1>
        <p className="muted">Other players see it in games and on the leaderboard. You can’t change it later.</p>
        <form onSubmit={pickName} className="form">
          <label className="label" htmlFor="uname">Username</label>
          <input id="uname" value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} autoComplete="username" maxLength={20} autoFocus />
          {err && <p className="error" role="alert">{err}</p>}
          <button className="btn primary big" disabled={busy || !name.trim()}>Save name</button>
        </form>
        <button className="btn ghost" onClick={() => logOut()}>Use another account</button>
      </div>
    );
  }

  return (
    <div className="page narrow auth">
      <h1>{mode === 'in' ? 'Sign in' : 'Create an account'}</h1>
      <p className="muted">An account lets you play rated games online and keeps your rating. Bots, review and analysis work without one.</p>
      <button className="btn big google" onClick={() => run(signInGoogle)} disabled={busy}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3Z" /><path fill="currentColor" opacity=".8" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22Z" /><path fill="currentColor" opacity=".6" d="M6.4 14a6 6 0 0 1 0-3.9V7.5H3.1a10 10 0 0 0 0 9.1L6.4 14Z" /><path fill="currentColor" opacity=".9" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.5L6.4 10C7.2 7.7 9.4 6 12 6Z" /></svg>
        Continue with Google
      </button>
      <div className="or"><span>or with email</span></div>
      <form className="form" onSubmit={(e) => { e.preventDefault(); run(() => (mode === 'in' ? signInEmail(email.trim(), pass) : signUpEmail(email.trim(), pass))); }}>
        <label className="label" htmlFor="email">Email</label>
        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
        <label className="label" htmlFor="pass">Password</label>
        <input id="pass" type="password" value={pass} onChange={(e) => setPass(e.target.value)} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required minLength={6} />
        {err && <p className="error" role="alert">{err}</p>}
        <button className="btn primary big" disabled={busy}>{mode === 'in' ? 'Sign in' : 'Create account'}</button>
      </form>
      <p className="switch-mode">
        {mode === 'in' ? <>New here? <button className="link" onClick={() => { setMode('up'); setErr(''); }}>Create an account</button></> : <>Have an account? <button className="link" onClick={() => { setMode('in'); setErr(''); }}>Sign in</button></>}
      </p>
    </div>
  );
}
