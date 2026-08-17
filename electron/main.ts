import { app, BrowserWindow, Menu, session, Tray, nativeImage } from 'electron'
import path from 'path'
import { fileURLToPath } from 'url'
import { db } from './db'
import { registerIpc } from './ipc'
import { WhatsAppManager, type WaMessage, type WaState } from './whatsapp'
import { startReminderScheduler } from './calendar'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let wa: WhatsAppManager | null = null

// Allow-list used by the navigation guards below. In dev it is the Vite server
// origin; in production the app is loaded from the packaged index.html via file://.
function allowedNavigation(url: string): boolean {
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    // Dev-mode gating: allow only same-origin navigation within the Vite
    // server; a prefix match would let a look-alike host through.
    try {
      return new URL(url).origin === new URL(devUrl).origin
    } catch {
      return false
    }
  }
  if (!url.startsWith('file://')) return false
  try {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
    return path.resolve(fileURLToPath(url)) === path.resolve(indexPath)
  } catch {
    return false
  }
}

// Production CSP, also delivered as a response header (instead of relying only
// on a <meta> tag) so a compromised renderer cannot loosen it for http(s)
// loads. Note: the packaged app loads via file://, and Electron's webRequest
// API does not intercept file:// responses, so index.html keeps a matching
// <meta> CSP as the effective enforcement for packaged builds. `style-src
// 'unsafe-inline'` is required because React components rely heavily on the
// `style` attribute (React's style={{...}} props); removing it would break the UI.
const CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' http://localhost:11434",
  "font-src 'self' data:"
].join('; ')

function hardenSession(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const responseHeaders = { ...details.responseHeaders }
    if (!process.env.VITE_DEV_SERVER_URL && details.url.startsWith('file://')) {
      responseHeaders['Content-Security-Policy'] = [CSP]
    }
    callback({ responseHeaders })
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 940,
    minHeight: 640,
    title: 'Toqi',
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'assets', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // Deny all window.open targets. The preload API does not use them and OAuth
  // flows open the browser from the main process, so nothing here is external.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  // Block any navigation or redirect away from the app origin (Vite dev server
  // in dev, the packaged index.html in production).
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!allowedNavigation(url)) e.preventDefault()
  })
  mainWindow.webContents.on('will-redirect', (e, url) => {
    if (!allowedNavigation(url)) e.preventDefault()
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    void mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    void mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function createTray(): void {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png')
  let image: Electron.NativeImage
  try {
    image = nativeImage.createFromPath(iconPath)
    if (image.isEmpty()) image = nativeImage.createEmpty()
  } catch {
    image = nativeImage.createEmpty()
  }
  tray = new Tray(image)
  tray.setToolTip('Toqi')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Toqi', click: () => showWindow() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
  tray.on('click', () => showWindow())
}

function showWindow(): void {
  if (!mainWindow) {
    createWindow()
  }
  mainWindow?.show()
  mainWindow?.focus()
}

function initWhatsApp(): void {
  wa = new WhatsAppManager({
    onState: (state: WaState, qr?: string) => {
      mainWindow?.webContents.send('wa:state', state, qr)
    },
    onMessage: (msg: WaMessage) => {
      mainWindow?.webContents.send('wa:message', msg)
    },
    onError: (err: string) => {
      mainWindow?.webContents.send('wa:error', err)
    }
  })
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => showWindow())

  app.whenReady().then(async () => {
    await db.init()
    hardenSession()
    initWhatsApp()
    registerIpc(() => mainWindow, () => wa!)
    startReminderScheduler()
    createWindow()
    createTray()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  db.close()
})
