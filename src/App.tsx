import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Conversation, PublicUser } from '../electron/types'
import Auth from './screens/Auth'
import Chat from './screens/Chat'
import CalendarScreen from './screens/Calendar'
import Settings from './screens/Settings'
import MyStuff from './screens/MyStuff'
import Brief from './screens/Brief'
import Apps from './screens/Apps'
import { Icon, type IconName } from './components/icons'
import { useClipboard, useToast } from './utils'

type Screen = 'chat' | 'mystuff' | 'brief' | 'apps' | 'settings' | 'calendar'
type SettingsFocus = 'wa' | 'oauth' | undefined

const NAV: Array<{ id: Screen; icon: IconName; labelKey: string }> = [
  { id: 'mystuff', icon: 'star', labelKey: 'nav.mystuff' },
  { id: 'brief', icon: 'dessert', labelKey: 'nav.brief' },
  { id: 'apps', icon: 'cable', labelKey: 'nav.apps' },
  { id: 'settings', icon: 'settings', labelKey: 'nav.settings' }
]

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'now'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString()
}

function App(): JSX.Element {
  const { t, i18n } = useTranslation()
  const toast = useToast()
  const { copy } = useClipboard()
  const [loaded, setLoaded] = useState(false)
  const [user, setUser] = useState<PublicUser | null>(null)
  const [screen, setScreen] = useState<Screen>('chat')
  const [chatTarget, setChatTarget] = useState<number | null>(null)
  const [chatNonce, setChatNonce] = useState(0)
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('toqi-nav-collapsed') === '1')
  const [recents, setRecents] = useState<Conversation[]>([])
  const [settingsFocus, setSettingsFocus] = useState<SettingsFocus>()

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

  useEffect(() => {
    const refresh = () => {
      void window.toqi.conversations.list().then((c) => setRecents(c))
    }
    refresh()
    const id = window.setInterval(refresh, 10000)
    return () => window.clearInterval(id)
  }, [])

  const onAuthDone = useCallback((u: PublicUser) => {
    setUser(u)
    setScreen('chat')
    setChatTarget(null)
    setChatNonce((n) => n + 1)
  }, [])

  const onSignOut = useCallback(() => {
    void window.toqi.auth.signout()
    setUser(null)
  }, [])

  const onRestartOnboarding = useCallback(() => {
    setUser(user ? { ...user, name: '' } : null)
  }, [user])

  const startNewChat = useCallback(() => {
    setChatTarget(null)
    setChatNonce((n) => n + 1)
    setScreen('chat')
  }, [])

  const openConversation = useCallback((id: number) => {
    setChatTarget(id)
    setChatNonce((n) => n + 1)
    setScreen('chat')
  }, [])

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      localStorage.setItem('toqi-nav-collapsed', c ? '0' : '1')
      return !c
    })
  }, [])

  const onInvite = useCallback(() => {
    copy(t('invite.text'))
    toast(t('invite.copied'))
  }, [copy, toast, t])

  if (!loaded) {
    return <div className="app-loading">{t('common.loading')}</div>
  }

  if (!user || !user.name.trim()) {
    return <Auth user={user} onDone={onAuthDone} />
  }

  const screens: Record<Screen, JSX.Element> = {
    chat: <Chat key={`${chatTarget ?? 'new'}-${chatNonce}`} initialConversationId={chatTarget} />,
    mystuff: <MyStuff onOpenReminders={() => setScreen('calendar')} />,
    brief: <Brief />,
    apps: (
      <Apps
        onOpenSettings={(focus) => {
          setSettingsFocus(focus)
          setScreen('settings')
        }}
      />
    ),
    settings: (
      <Settings
        user={user}
        onSignOut={onSignOut}
        onRestartOnboarding={onRestartOnboarding}
        focus={settingsFocus}
      />
    ),
    calendar: <CalendarScreen />
  }

  return (
    <div className="app">
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-top">
          <button className="icon-btn collapse-btn" onClick={toggleCollapsed} title={collapsed ? t('nav.recents') : ''}>
            <Icon name={collapsed ? 'chevron-right' : 'chevron-left'} size={18} />
          </button>
          <button className="new-chat-btn" onClick={startNewChat} title={t('chat.newChat')}>
            <Icon name="chat-plus" size={20} />
            {!collapsed && <span>{t('chat.newChat')}</span>}
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${screen === item.id ? 'active' : ''}`}
              onClick={() => {
                setSettingsFocus(undefined)
                setScreen(item.id)
              }}
              title={collapsed ? t(item.labelKey) : undefined}
            >
              <Icon name={item.icon} size={20} />
              {!collapsed && <span>{t(item.labelKey)}</span>}
            </button>
          ))}
          <button className="nav-item" onClick={onInvite} title={collapsed ? t('nav.invite') : undefined}>
            <Icon name="user-plus" size={20} />
            {!collapsed && <span>{t('nav.invite')}</span>}
          </button>
        </nav>

        {!collapsed && (
          <div className="sidebar-recents">
            <div className="recents-label">{t('nav.recents')}</div>
            {recents.slice(0, 8).map((c) => (
              <button key={c.id} className="recent-item" onClick={() => openConversation(c.id)} title={c.title}>
                <Icon name="chat" size={16} />
                <span className="recent-title">{c.title}</span>
                <span className="recent-time">{timeAgo(c.updated_at)}</span>
              </button>
            ))}
          </div>
        )}
      </aside>
      <main className="main">{screens[screen]}</main>
    </div>
  )
}

export default App