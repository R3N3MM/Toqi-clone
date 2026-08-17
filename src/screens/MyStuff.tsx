import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from '../components/icons'
import { useToast } from '../utils'
import type { Reminder } from '../../electron/types'

interface Props {
  onOpenReminders: () => void
}

function MyStuff({ onOpenReminders }: Props): JSX.Element {
  const { t } = useTranslation()
  const toast = useToast()
  const [pending, setPending] = useState(0)

  useEffect(() => {
    void window.toqi.reminders.list().then((r: Reminder[]) => setPending(r.filter((x) => !x.done).length))
  }, [])

  const items: Array<{ icon: IconName; labelKey: string; count: number; action: () => void }> = [
    { icon: 'check-box', labelKey: 'mystuff.tasks', count: 0, action: () => toast(t('common.comingSoon')) },
    { icon: 'infinity', labelKey: 'mystuff.routines', count: 0, action: () => toast(t('common.comingSoon')) },
    { icon: 'bell', labelKey: 'mystuff.reminders', count: pending, action: onOpenReminders }
  ]

  return (
    <div className="screen my-stuff">
      <h1 className="screen-title">
        <Icon name="star" size={22} /> {t('nav.mystuff')}
      </h1>
      <p className="mystuff-tagline">{t('mystuff.tagline')}</p>
      <div className="mystuff-grid">
        {items.map((it) => (
          <button key={it.labelKey} className="mystuff-card" onClick={it.action}>
            <span className="mystuff-circle">
              <Icon name={it.icon} size={30} />
            </span>
            <span className="mystuff-label">{t(it.labelKey)}</span>
            <span className="mystuff-count">{it.count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default MyStuff