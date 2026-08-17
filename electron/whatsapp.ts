import { app, Notification } from 'electron'
import os from 'os'
import path from 'path'
import { Client, LocalAuth } from 'whatsapp-web.js'
import type { ChatInfo, WaContact, WaMessage } from './types'
import { db } from './db'
export type { WaMessage } from './types'

export type WaState = 'uninitialized' | 'connecting' | 'qr' | 'ready' | 'disconnected' | 'error'

export interface WaEventCallbacks {
  onState(state: WaState, qrData?: string): void
  onMessage(msg: WaMessage): void
  onError(err: string): void
}

async function ensureChrome(): Promise<string | undefined> {
  // Prefer the browser that `puppeteer` knows about (installed during `npm install`).
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const puppeteer = require('puppeteer') as { executablePath(): string }
    return puppeteer.executablePath()
  } catch {
    // fall through and try to install Chrome on demand
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const browsers = require('@puppeteer/browsers') as {
      detectBrowserPlatform(): string | undefined
      resolveBuildId(browser: string, platform: string, tag: string): Promise<string>
      install(opts: {
        browser: string
        buildId: string
        cacheDir: string
        force: boolean
      }): Promise<{ buildId: string }>
      computeExecutablePath(opts: {
        browser: string
        platform: string
        buildId: string
        cacheDir: string
      }): string
    }
    const platform = browsers.detectBrowserPlatform()
    if (!platform) return undefined
    const buildId = await browsers.resolveBuildId('chrome', platform, 'stable')
    const cacheDir = path.join(os.homedir(), '.cache', 'puppeteer')
    const info = await browsers.install({ browser: 'chrome', buildId, cacheDir, force: false })
    return browsers.computeExecutablePath({ browser: 'chrome', platform, buildId: info.buildId, cacheDir })
  } catch {
    return undefined
  }
}

export class WhatsAppManager {
  private client: Client | null = null
  private cb: WaEventCallbacks
  private qrData: string | null = null
  private sessionPath = ''

  constructor(callbacks: WaEventCallbacks) {
    this.cb = callbacks
  }

  private getSessionPath(): string {
    if (this.sessionPath) return this.sessionPath
    this.sessionPath = path.join(app.getPath('userData'), 'wa-session')
    return this.sessionPath
  }

  async init(): Promise<void> {
    if (this.client) return
    this.cb.onState('connecting')

    const client = new Client({
      authStrategy: new LocalAuth({ dataPath: this.getSessionPath() }),
      puppeteer: {
        headless: true,
        executablePath: await ensureChrome(),
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run'
        ]
      }
    })

    client.on('qr', (qr: string) => {
      this.qrData = qr
      this.cb.onState('qr', qr)
    })

    client.on('authenticated', () => {
      this.cb.onState('connecting')
    })

    client.on('auth_failure', (msg: string) => {
      this.cb.onError(`WhatsApp authentication failed: ${msg}`)
      this.cb.onState('error')
    })

    client.on('ready', () => {
      this.qrData = null
      this.cb.onState('ready')
    })

    client.on('disconnected', (reason: string) => {
      this.cb.onError(`WhatsApp disconnected: ${reason}`)
      this.cb.onState('disconnected')
      this.client = null
    })

    client.on('message', async (msg) => {
      try {
        const chat = await msg.getChat()
        const name = chat.name || chat.id.user || chat.id._serialized
        const record: WaMessage = {
          chatId: msg.from,
          chatName: name,
          fromMe: msg.fromMe,
          body: msg.body || '[non-text message]',
          timestamp: new Date().toISOString()
        }
        this.storeMessage(record)
        this.cb.onMessage(record)

        if (!msg.fromMe && Notification.isSupported()) {
          new Notification({
            title: `New message from ${name}`,
            body: record.body
          }).show()
        }
      } catch (err) {
        this.cb.onError(err instanceof Error ? err.message : String(err))
      }
    })

    this.client = client
    await client.initialize().catch((err) => {
      this.cb.onError(err instanceof Error ? err.message : String(err))
      this.cb.onState('error')
      this.client = null
    })
  }

  getQr(): string | null {
    return this.qrData
  }

  getState(): WaState {
    if (!this.client) return 'uninitialized'
    if (this.qrData) return 'qr'
    if (this.client.info && this.client.info.wid) return 'ready'
    return 'connecting'
  }

  async logout(): Promise<void> {
    if (this.client) {
      await this.client.logout().catch(() => undefined)
      await this.client.destroy().catch(() => undefined)
      this.client = null
    }
    this.qrData = null
    this.cb.onState('uninitialized')
  }

  async getChats(): Promise<ChatInfo[]> {
    if (!this.client || !this.client.info) return []
    const chats = await this.client.getChats()
    return chats
      .filter((c) => !c.archived)
      .map((c) => {
        let last = ''
        let ts: string | undefined
        const lm = c.lastMessage
        if (lm) {
          last = lm.body || ''
          ts = new Date(lm.timestamp * 1000).toISOString()
        }
        return {
          id: c.id._serialized,
          name: c.name || c.id.user || c.id._serialized,
          lastMessage: last,
          timestamp: ts,
          unreadCount: c.unreadCount || 0
        } satisfies ChatInfo
      })
      .sort((a, b) => (b.timestamp ?? '').localeCompare(a.timestamp ?? ''))
  }

  async getChatMessages(chatId: string, limit = 50): Promise<WaMessage[]> {
    if (!this.client || !this.client.info) return []
    const chat = await this.client.getChatById(chatId)
    const messages = await chat.fetchMessages({ limit })
    return messages.map((m) => ({
      chatId,
      chatName: chat.name || chat.id.user || chatId,
      fromMe: m.fromMe,
      body: m.body || '',
      timestamp: new Date(m.timestamp * 1000).toISOString()
    }))
  }

  async sendMessage(chatId: string, text: string): Promise<boolean> {
    if (!this.client || !this.client.info) throw new Error('WhatsApp is not connected')
    await this.client.sendMessage(chatId, text)
    const chat = await this.client.getChatById(chatId)
    const record: WaMessage = {
      chatId,
      chatName: chat.name || chat.id.user || chatId,
      fromMe: true,
      body: text,
      timestamp: new Date().toISOString()
    }
    this.storeMessage(record)
    this.cb.onMessage(record)
    return true
  }

  async searchContacts(query: string): Promise<WaContact[]> {
    if (!this.client || !this.client.info) return []
    const contacts = await this.client.getContacts()
    const q = query.toLowerCase()
    return contacts
      .filter(
        (c) =>
          c.name && (c.name.toLowerCase().includes(q) || (c.number ?? '').includes(q))
      )
      .slice(0, 20)
      .map((c) => ({ id: c.id._serialized, name: c.name || c.number || c.id._serialized }))
  }

  private storeMessage(record: WaMessage): void {
    db.run(
      `INSERT INTO wa_messages (chat_id, chat_name, from_me, body, ts) VALUES (?, ?, ?, ?, ?)`,
      [record.chatId, record.chatName, record.fromMe ? 1 : 0, record.body, record.timestamp]
    )
    const row = db.get<{ id: number }>('SELECT last_insert_rowid() AS id')
    record.id = row?.id
    db.run(
      `INSERT INTO chats (id, name, last_message, last_ts, unread) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET last_message = excluded.last_message, last_ts = excluded.last_ts, unread = unread + 1`,
      [record.chatId, record.chatName, record.body, record.timestamp, record.fromMe ? 0 : 1]
    )
    if (record.fromMe) {
      db.run(`UPDATE chats SET unread = 0 WHERE id = ?`, [record.chatId])
    }
  }
}

export function listStoredMessages(chatId?: string): WaMessage[] {
  const rows = db.all<{
    id: number
    chat_id: string
    chat_name: string
    from_me: number
    body: string
    ts: string
  }>(
    chatId
      ? 'SELECT * FROM wa_messages WHERE chat_id = ? ORDER BY id ASC'
      : 'SELECT * FROM wa_messages ORDER BY id DESC LIMIT 500',
    chatId ? [chatId] : []
  )
  return rows.map((r) => ({
    id: r.id,
    chatId: r.chat_id,
    chatName: r.chat_name,
    fromMe: r.from_me === 1,
    body: r.body,
    timestamp: r.ts
  }))
}

export function listStoredChats(): ChatInfo[] {
  const rows = db.all<{
    id: string
    name: string
    last_message: string | null
    last_ts: string | null
    unread: number
  }>('SELECT * FROM chats ORDER BY last_ts DESC')
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    lastMessage: r.last_message ?? undefined,
    timestamp: r.last_ts ?? undefined,
    unreadCount: r.unread
  }))
}
