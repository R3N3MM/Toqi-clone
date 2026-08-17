import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { AiSettings, OllamaModel, PublicUser, SmtpConfig } from '../../electron/types'
import { ACCENTS, useTheme, type AccentName } from '../theme'
import { LANGUAGES } from '../i18n'
import { useToast } from '../utils'
import { Icon } from '../components/icons'
import { friendlyModelLabel } from '../../electron/ollama'

interface SettingsProps {
  user: PublicUser | null
  onSignOut: () => void
  onRestartOnboarding: () => void
  focus?: 'wa' | 'oauth'
}

export default function Settings({ user, onSignOut, onRestartOnboarding, focus }: SettingsProps): JSX.Element {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const { mode, accent, setMode, setAccent } = useTheme()

  const [models, setModels] = useState<OllamaModel[]>([])
  const [ollamaUp, setOllamaUp] = useState(false)
  const [settings, setSettings] = useState<AiSettings>({ model: '', temperature: 0.6, language: 'English' })
  const [smtp, setSmtp] = useState<SmtpConfig>({
    host: '', port: 587, secure: false, user: '', pass: '', fromName: '', fromEmail: ''
  })
  const [testResult, setTestResult] = useState<string | null>(null)
  const [name, setName] = useState(user?.name ?? '')
  const [curPass, setCurPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [googleId, setGoogleId] = useState('')
  const [msId, setMsId] = useState('')
  const [msSecret, setMsSecret] = useState('')
  const [location, setLocation] = useState('')
  const [notifications, setNotifications] = useState(true)
  const [waState, setWaState] = useState('uninitialized')
  const [waQr, setWaQr] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const status = await window.toqi.ollama.status()
      setOllamaUp(status.running)
      if (status.running) {
        const ms = await window.toqi.ollama.models()
        setModels(ms)
        const def = await window.toqi.ollama.defaultModel()
        const s = await window.toqi.settings.get()
        if (!s.model && def) s.model = def
        setSettings(s)
      }
      const cfg = await window.toqi.mail.smtp()
      if (cfg) setSmtp(cfg)
      const prefs = await window.toqi.settings.getPrefs()
      setLocation(prefs.location)
      setNotifications(prefs.notifications)
      const g = await window.toqi.auth.oauthConfig('google')
      const m = await window.toqi.auth.oauthConfig('microsoft')
      setGoogleId(g.clientId)
      setMsId(m.clientId)
      setMsSecret(m.clientSecret)
    })()
  }, [])

  useEffect(() => {
    const off = window.toqi.wa.onState((state, qr) => {
      setWaState(state)
      setWaQr(qr ?? null)
    })
    void window.toqi.wa.state().then((s) => setWaState(s))
    return () => {
      off()
    }
  }, [])

  useEffect(() => {
    if (!focus) return
    const el = document.getElementById(focus === 'wa' ? 'settings-card-wa' : 'settings-card-oauth')
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [focus])

  const saveSettings = async (): Promise<void> => {
    await window.toqi.settings.save(settings)
    toast(t('settings.saved'))
  }

  const changeLang = async (code: string): Promise<void> => {
    await i18n.changeLanguage(code)
    localStorage.setItem('toqi-lang', code)
    await window.toqi.settings.setLang(code)
  }

  const saveSmtp = async (): Promise<void> => {
    await window.toqi.mail.saveSmtp(smtp)
    toast(t('settings.saved'))
  }

  const testSmtp = async (): Promise<void> => {
    setTestResult(null)
    const ok = await window.toqi.mail.testSmtp(smtp)
    setTestResult(ok ? t('settings.smtpTestOk') : t('settings.smtpTestFail'))
  }

  const savePrefs = async (): Promise<void> => {
    await window.toqi.settings.setPrefs({ location: location.trim(), notifications })
    toast(t('settings.saved'))
  }

  const saveName = async (): Promise<void> => {
    if (user && name.trim() && name.trim() !== user.name) {
      await window.toqi.auth.updateName(user.id, name.trim())
      toast(t('settings.saved'))
    }
  }

  const savePassword = async (): Promise<void> => {
    if (!user) return
    try {
      await window.toqi.auth.changePassword(user.id, curPass, newPass)
      setCurPass('')
      setNewPass('')
      toast(t('settings.saved'))
    } catch (err) {
      toast(err instanceof Error ? err.message : t('settings.updated'))
    }
  }

  const saveOauth = async (): Promise<void> => {
    await window.toqi.auth.saveOauthConfig('google', googleId.trim(), '')
    await window.toqi.auth.saveOauthConfig('microsoft', msId.trim(), msSecret.trim())
    toast(t('settings.saved'))
  }

  const deleteAccount = async (): Promise<void> => {
    if (!user) return
    if (!window.confirm(t('settings.deleteConfirm'))) return
    await window.toqi.auth.deleteAccount(user.id)
    onSignOut()
  }

  const connectWa = async (): Promise<void> => {
    const s = await window.toqi.wa.init()
    setWaState(s)
  }

  const qrForDisplay = waQr ?? ''

  return (
    <div className="screen settings-screen">
      <h2 className="screen-title">
        <Icon name="settings" size={22} /> {t('settings.title')}
      </h2>

      <section className="settings-section">
        <h3 className="settings-heading">{t('settings.general')}</h3>

        <div className="card">
          <h4>{t('settings.language')}</h4>
          <div className="lang-picker">
            {LANGUAGES.map((l) => (
              <button key={l.code} className={i18n.language === l.code ? 'active' : ''} onClick={() => void changeLang(l.code)}>
                {l.name}
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <h4>{t('settings.aiLanguage')}</h4>
          <input
            list="ai-langs"
            value={settings.language}
            onChange={(e) => setSettings({ ...settings, language: e.target.value })}
          />
          <datalist id="ai-langs">
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.name} />
            ))}
          </datalist>
          <label>{t('settings.temperature')}: <b>{settings.temperature.toFixed(1)}</b></label>
          <input
            type="range"
            min={0} max={1} step={0.1}
            value={settings.temperature}
            onChange={(e) => setSettings({ ...settings, temperature: Number(e.target.value) })}
          />
          <div className="row" style={{ marginTop: 12 }}>
            <span className={`pill ${ollamaUp ? 'ok' : 'bad'}`}>{ollamaUp ? 'Ollama' : t('common.ollamaDown')}</span>
            {models.length > 0 && (
              <select value={settings.model} onChange={(e) => setSettings({ ...settings, model: e.target.value })}>
                {models.map((m) => (
                  <option key={m.name} value={m.name}>
                    {t(`settings.modelTier.${friendlyModelLabel(m.name)}`)}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={() => void saveSettings()}>{t('common.save')}</button>
          </div>
        </div>

        <div className="card">
          <h4>{t('settings.smtp')}</h4>
          <div className="grid-2">
            <div>
              <label>{t('settings.smtpHost')}</label>
              <input value={smtp.host} onChange={(e) => setSmtp({ ...smtp, host: e.target.value })} placeholder="smtp.gmail.com" />
            </div>
            <div>
              <label>{t('settings.smtpPort')}</label>
              <input type="number" value={smtp.port} onChange={(e) => setSmtp({ ...smtp, port: Number(e.target.value) })} />
            </div>
          </div>
          <label className="checkbox-label">
            <input type="checkbox" checked={smtp.secure} onChange={(e) => setSmtp({ ...smtp, secure: e.target.checked })} />
            {t('settings.smtpSecure')}
          </label>
          <div className="grid-2">
            <div>
              <label>{t('settings.smtpUser')}</label>
              <input value={smtp.user} onChange={(e) => setSmtp({ ...smtp, user: e.target.value })} />
            </div>
            <div>
              <label>{t('settings.smtpPass')}</label>
              <input type="password" value={smtp.pass} onChange={(e) => setSmtp({ ...smtp, pass: e.target.value })} />
            </div>
          </div>
          <div className="grid-2">
            <div>
              <label>{t('settings.smtpFromName')}</label>
              <input value={smtp.fromName} onChange={(e) => setSmtp({ ...smtp, fromName: e.target.value })} />
            </div>
            <div>
              <label>{t('settings.smtpFromEmail')}</label>
              <input value={smtp.fromEmail} onChange={(e) => setSmtp({ ...smtp, fromEmail: e.target.value })} />
            </div>
          </div>
          {testResult && <div className="info-box">{testResult}</div>}
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn btn-primary" onClick={() => void saveSmtp()}>{t('common.save')}</button>
            <button className="btn btn-ghost" onClick={() => void testSmtp()}>{t('settings.smtpTest')}</button>
          </div>
        </div>

        <div className="card">
          <h4>{t('settings.location')}</h4>
          <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Nairobi" />
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn btn-primary" onClick={() => void savePrefs()}>{t('common.save')}</button>
          </div>
        </div>

        <div className="card">
          <h4>{t('settings.notifications')}</h4>
          <label className="checkbox-label">
            <input type="checkbox" checked={notifications} onChange={(e) => setNotifications(e.target.checked)} />
            {t('settings.notifications')}
          </label>
          <button className="btn btn-primary" onClick={() => void savePrefs()}>{t('common.save')}</button>
        </div>

        <div className="card">
          <h4>{t('settings.onboarding')}</h4>
          <button className="btn btn-ghost" onClick={onRestartOnboarding}>{t('settings.onboarding')}</button>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-heading">{t('settings.account')}</h3>

        <div className="card">
          <h4>{t('settings.accountMgmt')}</h4>
          {user && (
            <div className="account-info">
              <div className="account-avatar"><Icon name="user" size={20} /></div>
              <div>
                <div>{user.name || user.email}</div>
                <div className="small muted">{user.email}</div>
              </div>
            </div>
          )}
          <label>{t('settings.name')}</label>
          <div className="row">
            <input value={name} onChange={(e) => setName(e.target.value)} />
            <button className="btn btn-primary" onClick={() => void saveName()}>{t('common.save')}</button>
          </div>
          {user?.provider === 'local' && (
            <>
              <label>{t('settings.currentPassword')}</label>
              <input type="password" value={curPass} onChange={(e) => setCurPass(e.target.value)} />
              <label>{t('settings.newPassword')}</label>
              <input type="password" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
              <button className="btn btn-ghost" onClick={() => void savePassword()}>{t('settings.changePassword')}</button>
            </>
          )}
        </div>

        <div className="card" id="settings-card-oauth">
          <h4>Google / Microsoft OAuth</h4>
          <p className="small muted">{t('settings.oauthHint')}</p>
          <label>{t('settings.googleClientId')}</label>
          <input value={googleId} onChange={(e) => setGoogleId(e.target.value)} />
          <label>{t('settings.microsoftClientId')}</label>
          <input value={msId} onChange={(e) => setMsId(e.target.value)} />
          <label>{t('settings.microsoftSecret')}</label>
          <input type="password" value={msSecret} onChange={(e) => setMsSecret(e.target.value)} />
          <button className="btn btn-primary" onClick={() => void saveOauth()}>{t('settings.save')}</button>
        </div>

        <div className="card" id="settings-card-wa">
          <h4>WhatsApp</h4>
          <p className="small muted">{t('settings.waHint')}</p>
          {waState === 'ready' ? (
            <span className="pill ok">WhatsApp</span>
          ) : waState === 'qr' ? (
            <div className="qr-wrap">
              <div className="qr-box">{qrForDisplay && <img src={`data:image/png;base64,${qrForDisplay}`} alt="QR" />}</div>
              <p className="small muted">{t('whatsapp.scanQr')}</p>
            </div>
          ) : (
            <button className="btn btn-primary" onClick={() => void connectWa()}>{t('whatsapp.connect')}</button>
          )}
        </div>

        <div className="card">
          <h4>{t('settings.privacy')}</h4>
          <p className="small muted">
            {t('settings.updated')} — Toqi stores your data locally on this computer. No data leaves your machine except
            messages you send through your own accounts.
          </p>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-heading">{t('settings.preferences')}</h3>

        <div className="card">
          <h4>{t('settings.appearance')}</h4>
          <label>{t('settings.mode')}</label>
          <div className="row">
            <button className={`btn ${mode === 'light' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('light')}>
              <Icon name="sun" size={16} /> {t('settings.light')}
            </button>
            <button className={`btn ${mode === 'dark' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('dark')}>
              <Icon name="moon" size={16} /> {t('settings.dark')}
            </button>
          </div>
          <label>{t('settings.colorTheme')}</label>
          <div className="swatch-row">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                className={`swatch ${accent === a.id ? 'active' : ''}`}
                data-accent={a.id}
                title={t(a.labelKey)}
                onClick={() => setAccent(a.id as AccentName)}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="settings-section">
        <h3 className="settings-heading">{t('settings.session')}</h3>
        <div className="card danger-zone">
          <h4>{t('settings.danger')}</h4>
          <div className="row">
            <button className="btn btn-danger" onClick={onSignOut}>{t('settings.signOut')}</button>
            <button className="btn btn-danger" onClick={() => void deleteAccount()}>{t('settings.deleteAccount')}</button>
          </div>
        </div>
      </section>
    </div>
  )
}