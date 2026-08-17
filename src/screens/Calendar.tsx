import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Reminder } from '../../electron/types'
import { Icon } from '../components/icons'

export default function CalendarScreen(): JSX.Element {
  const { t } = useTranslation()
  const [items, setItems] = useState<Reminder[]>([])
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [type, setType] = useState<Reminder['type']>('reminder')
  const [dateTime, setDateTime] = useState('')

  const refresh = useCallback(async () => {
    setItems(await window.toqi.reminders.list())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function add(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const clean = title.trim()
    if (!clean || !dateTime) return
    const due = new Date(dateTime).toISOString()
    await window.toqi.reminders.add({ title: clean, dueAt: due, type, note: note.trim() })
    setTitle('')
    setNote('')
    setDateTime('')
    void refresh()
  }

  async function toggleDone(r: Reminder): Promise<void> {
    if (!r.done) await window.toqi.reminders.done(r.id)
    void refresh()
  }

  async function remove(r: Reminder): Promise<void> {
    await window.toqi.reminders.delete(r.id)
    void refresh()
  }

  const upcoming = items.filter((r) => !r.done)
  const finished = items.filter((r) => r.done)

  return (
    <div className="screen">
      <h2 className="screen-title">
        <Icon name="calendar" size={22} /> {t('calendar.title')}
      </h2>

      <form className="calendar-form" onSubmit={add}>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('calendar.titleField')} required />
        <input
          className="input"
          type="datetime-local"
          value={dateTime}
          onChange={(e) => setDateTime(e.target.value)}
          required
        />
        <select className="input" value={type} onChange={(e) => setType(e.target.value as Reminder['type'])}>
          <option value="reminder">{t('calendar.type.reminder')}</option>
          <option value="alarm">{t('calendar.type.alarm')}</option>
          <option value="event">{t('calendar.type.event')}</option>
        </select>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('calendar.note')} />
        <button className="btn btn-primary" type="submit">
          <Icon name="plus" size={16} /> {t('calendar.add')}
        </button>
      </form>

      {upcoming.length === 0 && finished.length === 0 ? (
        <p className="empty-state">{t('calendar.empty')}</p>
      ) : (
        <>
          {upcoming.map((r) => (
            <div key={r.id} className="reminder-item">
              <button className="icon-btn" onClick={() => void toggleDone(r)} title={t('calendar.done')}>
                <Icon name="check" size={16} />
              </button>
              <div className="reminder-body">
                <div className="reminder-title">{r.title}</div>
                <div className="reminder-meta">
                  <Icon name="calendar" size={12} /> {new Date(r.due_at).toLocaleString()}
                  {r.type !== 'reminder' && <span className="reminder-type">{t(`calendar.type.${r.type}`)}</span>}
                </div>
                {r.note && <div className="reminder-note">{r.note}</div>}
              </div>
              <button className="icon-btn danger" onClick={() => void remove(r)} title={t('calendar.delete')}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
          {finished.map((r) => (
            <div key={r.id} className="reminder-item done">
              <span className="reminder-checked">
                <Icon name="check" size={16} />
              </span>
              <div className="reminder-body">
                <div className="reminder-title">{r.title}</div>
                <div className="reminder-meta">
                  <Icon name="calendar" size={12} /> {new Date(r.due_at).toLocaleString()}
                </div>
              </div>
              <button className="icon-btn danger" onClick={() => void remove(r)} title={t('calendar.delete')}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  )
}