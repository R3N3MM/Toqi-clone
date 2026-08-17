import { useTranslation } from 'react-i18next'
import { Icon, type IconName } from '../components/icons'

interface Props {
  onOpenSettings: (focus: 'wa' | 'oauth') => void
}

function Apps({ onOpenSettings }: Props): JSX.Element {
  const { t } = useTranslation()

  const tiles: Array<{ name: string; sub: string; icon: IconName; focus: 'wa' | 'oauth' }> = [
    { name: 'WhatsApp', sub: 'WhatsApp', icon: 'whatsapp', focus: 'wa' },
    { name: 'Google', sub: 'Google', icon: 'globe', focus: 'oauth' },
    { name: 'Outlook', sub: 'Outlook', icon: 'mail', focus: 'oauth' }
  ]

  return (
    <div className="screen apps">
      <h1 className="screen-title">
        <Icon name="cable" size={22} /> {t('apps.title')}
      </h1>
      <div className="apps-grid">
        {tiles.map((app) => (
          <button key={app.name} className="app-tile" onClick={() => onOpenSettings(app.focus)}>
            <span className="app-logo">
              <Icon name={app.icon} size={28} />
            </span>
            <span className="app-name">{app.name}</span>
            <span className="app-connect">{t('apps.connect')}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export default Apps