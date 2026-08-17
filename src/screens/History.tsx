import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Conversation } from '../../electron/types'
import { Icon } from '../components/icons'

interface HistoryProps {
  onOpen: (conversationId: number) => void
}

export default function History({ onOpen }: HistoryProps): JSX.Element {
  const { t } = useTranslation()
  const [items, setItems] = useState<Conversation[]>([])

  const refresh = useCallback(async () => {
    setItems(await window.toqi.conversations.list())
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  async function handleDelete(e: React.MouseEvent, id: number): Promise<void> {
    e.stopPropagation()
    if (!window.confirm(t('history.deleteConfirm'))) return
    await window.toqi.conversations.delete(id)
    void refresh()
  }

  return (
    <div className="screen">
      <h2 className="screen-title">
        <Icon name="history" size={22} /> {t('history.title')}
      </h2>
      {items.length === 0 ? (
        <p className="empty-state">{t('history.empty')}</p>
      ) : (
        <div className="history-list">
          {items.map((c) => (
            <div key={c.id} className="history-item" onClick={() => onOpen(c.id)} role="button" tabIndex={0}>
              <div className="history-main">
                <Icon name="chat" size={18} />
                <div>
                  <div className="history-title">{c.title}</div>
                  <div className="history-time">{new Date(c.updated_at).toLocaleString()}</div>
                </div>
              </div>
              <button className="icon-btn danger" onClick={(e) => void handleDelete(e, c.id)} title={t('history.delete')}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}