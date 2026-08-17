import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { PublicUser } from '../electron/types'
import Auth from './screens/Auth'
import Chat from './screens/Chat'
import History from './screens/History'
import CalendarScreen from './screens/Calendar'
import Settings from './screens/Settings'
import { Icon, type IconName } from './components/icons'

type Screen = 'chat' | 'history' | 'calendar' | 'settings'

const NAV: Array<{ id: Screen; icon: IconName; labelKey: string }> = [
  { id: 'chat', icon: 'chat', labelKey: 'nav.chat' },
  { id: 'history', icon: 'history', labelKey: 'nav.history' },
  { id: 'calendar', icon: 'calendar', labelKey: 'nav.calendar' },
  { id: 'settings', icon: 'settings', labelKey: 'nav.settings' }
]

function App(): JSX.Element {
  const { t, i18n } = useTranslation()
  const [loaded, setLoaded] = useState(false)
  const [user, setUser] = useState<PublicUser | null>(null)
  const [screen, setScreen] = useState<Screen>('chat')
  const [chatTarget, setChatTarget] = useState<number | null>(null)

  useEffect(() => {
    const lang = localStorage.getItem('toqi-lang')
    if (lang) void i18n.changeLanguage(lang)
    void window.toqi.settings.getLang().then((saved) => {
      if (saved && saved !== lang) void i18n.changeLanguage(saved)
    })
  }, [i18n])

  useEffect(() => {
    document.documentElement.dir = ['ar', 'fa'].includes(i18n.language) ? 'rtl' : 'ltr'
  }, [i18n.language])

  useEffect(() => {
    void window.toqi.auth.current().then((u) => {
      setUser(u)
      setLoaded(true)
    })
  }, [])

  const onAuthDone = useCallback((u: PublicUser) => {
    setUser(u)
    setScreen('chat')
  }, [])

  const onSignOut = useCallback(() => {
    void window.toqi.auth.signout()
    localStorage.removeItem('toqi-onboarded')
    setUser(null)
  }, [])

  const onRestartOnboarding = useCallback(() => {
    localStorage.removeItem('toqi-onboarded')
    setUser(user ? { ...user } : null)
  }, [user])

  const openFromHistory = useCallback((id: number) => {
    setChatTarget(id)
    setScreen('chat')
  }, [])

  if (!loaded) {
    return <div className="app-loading">{t('common.loading')}</div>
  }

  if (!user || localStorage.getItem('toqi-onboarded') !== '1') {
    return <Auth user={user} onDone={onAuthDone} />
  }

  const screens: Record<Screen, JSX.Element> = {
    chat: <Chat key={chatTarget ?? 'new'} initialConversationId={chatTarget} />,
    history: <History onOpen={openFromHistory} />,
    calendar: <CalendarScreen />,
    settings: <Settings user={user} onSignOut={onSignOut} onRestartOnboarding={onRestartOnboarding} />
  }

  return (
    <div className="app">
      <aside className="sidebar">
        {NAV.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${screen === item.id ? 'active' : ''}`}
            onClick={() => {
              setChatTarget(null)
              setScreen(item.id)
            }}
          >
            <Icon name={item.icon} size={20} />
            <span>{t(item.labelKey)}</span>
          </button>
        ))}
      </aside>
      <main className="main">{screens[screen]}</main>
    </div>
  )
}

export default App