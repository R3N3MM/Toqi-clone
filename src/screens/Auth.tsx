import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PublicUser } from '../../electron/types'
import { Icon } from '../components/icons'

interface AuthProps {
  user: PublicUser | null
  onDone: (user: PublicUser) => void
}

export default function Auth({ user, onDone }: AuthProps): JSX.Element {
  const { t } = useTranslation()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [onboardingName, setOnboardingName] = useState(user?.name ?? '')

  async function handleLocal(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'signup') {
        const u = await window.toqi.auth.signup(email.trim(), password, '')
        onDone(u)
      } else {
        const u = await window.toqi.auth.signin(email.trim(), password)
        onDone(u)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('already exists')) setError(t('auth.errExists'))
      else if (msg.includes('at least 6')) setError(t('auth.errShort'))
      else setError(t('auth.errInvalid'))
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogle(): Promise<void> {
    setError(null)
    setBusy(true)
    try {
      const u = await window.toqi.auth.google()
      onDone(u)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('not configured')) setError(t('auth.oauthNotConfigured'))
      else setError(t('auth.oauthFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function handleMicrosoft(): Promise<void> {
    setError(null)
    setBusy(true)
    try {
      const u = await window.toqi.auth.microsoft()
      onDone(u)
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('not configured')) setError(t('auth.oauthNotConfigured'))
      else setError(t('auth.oauthFailed'))
    } finally {
      setBusy(false)
    }
  }

  async function handleOnboarding(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const finalName = onboardingName.trim() || user?.name || ''
    if (user && finalName && finalName !== user.name) {
      try {
        await window.toqi.auth.updateName(user.id, finalName)
      } catch {
        // ignore
      }
    }
    onDone(user ? { ...user, name: finalName } : { id: 0, email: '', name: finalName, provider: 'local', avatar: '' })
  }

  if (user) {
    return (
      <div className="auth-screen">
        <div className="auth-card onboarding">
          <div className="auth-eyes" aria-hidden="true">
            <span className="eye-arch" />
            <span className="eye-arch" />
          </div>
          <h1>{t('auth.onbTitle')}</h1>
          <p className="auth-sub">{t('auth.onbSub')}</p>
          <form onSubmit={handleOnboarding} className="auth-form">
            <input
              className="input"
              value={onboardingName}
              onChange={(e) => setOnboardingName(e.target.value)}
              placeholder={t('auth.name')}
              autoFocus
            />
            <button className="btn btn-primary" type="submit" disabled={busy || !onboardingName.trim()}>
              {t('auth.onbContinue')}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-eyes" aria-hidden="true">
          <span className="eye-arch" />
          <span className="eye-arch" />
        </div>
        <h1>{t('auth.welcome')}</h1>
        <p className="auth-sub">{t('auth.tagline')}</p>

        <form onSubmit={handleLocal} className="auth-form">
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t('auth.email')}
            required
          />
          <input
            className="input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t('auth.password')}
            required
          />
          {error && <p className="auth-error">{error}</p>}
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {mode === 'signup' ? t('auth.signUp') : t('auth.signIn')}
          </button>
        </form>

        <div className="auth-divider">
          <span>{t('auth.or')}</span>
        </div>

        <div className="auth-oauth">
          <button className="btn btn-oauth" onClick={handleGoogle} disabled={busy}>
            <Icon name="globe" size={18} /> {t('auth.google')}
          </button>
          <button className="btn btn-oauth" onClick={handleMicrosoft} disabled={busy}>
            <Icon name="monitor" size={18} /> {t('auth.microsoft')}
          </button>
        </div>

        <button
          className="link-btn"
          onClick={() => {
            setMode(mode === 'login' ? 'signup' : 'login')
            setError(null)
          }}
        >
          {mode === 'login' ? t('auth.toSignUp') : t('auth.toSignIn')}
        </button>
      </div>
    </div>
  )
}