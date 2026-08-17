import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import path from 'path'
import { db } from './db'
import { registerIpc } from './ipc'
import { WhatsAppManager, type WaMessage, type WaState } from './whatsapp'
import { startReminderScheduler } from './calendar'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let wa: WhatsAppManager | null = null

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
      sandbox: false
    }
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
