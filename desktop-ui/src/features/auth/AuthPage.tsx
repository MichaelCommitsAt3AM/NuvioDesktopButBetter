import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, LoaderCircle, LockKeyhole, Mail, MoreVertical } from 'lucide-react';
import { actions } from '../../bridge';
import { AuthOptionsPanel, useAuthOptions } from './AuthOptionsPanel';
import './auth.css';

import { useLocale } from '../../i18n/strings';

export function AuthPage() {
  const { t } = useLocale();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [serverMenuOpen, setServerMenuOpen] = useState(false);
  const { snapshot: authOptions } = useAuthOptions();
  const emailPasswordEnabled = authOptions?.active.emailPassword ?? true;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await (mode === 'signIn' ? actions.signIn(email, password) : actions.signUp(email, password));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not complete sign in.');
    } finally {
      setBusy(false);
    }
  }

  async function asGuest() {
    setBusy(true);
    setError(null);
    try {
      await actions.guest();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Guest session is unavailable.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page">
    <section className="auth-brand-pane" aria-label="Nuvio">
      <div className="auth-brand-copy">
        <img className="auth-brand-wordmark" src="/images/nuvio-wordmark.png" alt="Nuvio" />
        <h1>{t('compose_auth_tagline')}</h1>
        <p>{t('compose_auth_sign_up_subtitle')}</p>
      </div>
    </section>

    <aside className="auth-form-pane">
      <div className="auth-form-content">
        <header className="auth-heading">
          <h2>{mode === 'signIn' ? t('compose_auth_welcome_back') : t('compose_auth_create_account')}</h2>
          <p>{mode === 'signIn' ? t('compose_auth_sign_in_subtitle') : t('compose_auth_sign_up_subtitle')}</p>
        </header>

        {emailPasswordEnabled ? <form key={mode} className="auth-form auth-form-crossfade" onSubmit={(event) => void submit(event)}>
          <label className="auth-field">
            <Mail aria-hidden="true" />
            <span className="sr-only">{t('compose_auth_email')}</span>
            <input aria-label={t('compose_auth_email')} autoComplete="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder={t('compose_auth_email')} />
          </label>
          <label className="auth-field">
            <LockKeyhole aria-hidden="true" />
            <span className="sr-only">{t('compose_auth_password')}</span>
            <input aria-label={t('compose_auth_password')} autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} type={showPassword ? 'text' : 'password'} minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required placeholder={t('compose_auth_password')} />
            <button className="auth-password-toggle" type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff /> : <Eye />}</button>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button primary full auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : null}{mode === 'signIn' ? t('compose_auth_sign_in') : t('compose_auth_sign_up')}</button>
        </form> : <p className="muted auth-device-only-notice">Email and password sign-in are not enabled on this server.</p>}

        {emailPasswordEnabled && <p className="auth-switch">{mode === 'signIn' ? t('compose_auth_dont_have_account') : t('compose_auth_already_have_account')} <button type="button" onClick={() => { setMode(mode === 'signIn' ? 'signUp' : 'signIn'); setError(null); }}>{mode === 'signIn' ? t('compose_auth_sign_up') : t('compose_auth_sign_in')}</button></p>}
        {emailPasswordEnabled && <div className="auth-divider"><span />{t('compose_auth_or_separator').trim() || 'or'}<span /></div>}
        <button className="button secondary full auth-guest" onClick={() => void asGuest()} disabled={busy}>{t('compose_auth_continue_without_account')}</button>
        {error && !emailPasswordEnabled && <p className="form-error" role="alert">{error}</p>}
        <p className="auth-local-note">{t('compose_auth_store_locally')}</p>
      </div>
    </aside>

    <div className="auth-server-menu-anchor">
      <button className="auth-server-menu-trigger" type="button" aria-label="Server options" aria-expanded={serverMenuOpen} onClick={() => setServerMenuOpen((open) => !open)}><MoreVertical /></button>
      {serverMenuOpen && <div className="auth-server-menu-popover"><AuthOptionsPanel /></div>}
    </div>
  </main>;
}
