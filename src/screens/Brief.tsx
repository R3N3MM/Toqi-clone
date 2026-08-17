import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Reminder } from '../../electron/types'

function fmt(due: string): string {
  return new Date(due).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function Section({ label, items }: { label: string; items: Reminder[] }): JSX.Element {
  const { t } = useTranslation()
  return (
    <section className="brief-section">
      <h2>{label}</h2>
      {items.length === 0 ? (
        <p className="brief-empty">{t('brief.empty')}</p>
      ) : (
        <ul>
          {items.map((r) => (
            <li key={r.id}>
              <strong>{r.title}</strong>
              <span className="brief-time">{fmt(r.due_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function Brief(): JSX.Element {
  const { t } = useTranslation()
  const [items, setItems] = useState<Reminder[]>([])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    void window.toqi.reminders.list().then(setItems)
  }, [])

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])

  const act = items.filter((r) => !r.done && new Date(r.due_at).getTime() <= now)
  const watch = items.filter((r) => !r.done && new Date(r.due_at).getTime() > now)
  const settled = items.filter((r) => r.done)

  return (
    <div className="screen brief">
      <h1 className="screen-title">{t('brief.title')}</h1>
      <Section label={t('brief.act')} items={act} />
      <Section label={t('brief.watch')} items={watch} />
      <Section label={t('brief.settled')} items={settled} />
    </div>
  )
}

export default Brief