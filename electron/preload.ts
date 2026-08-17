import { contextBridge, ipcRenderer } from 'electron'
import type {
  AiSettings,
  ChatInfo,
  ChatMessage,
  Conversation,
  EmailDraft,
  EmailRecord,
  GenerateResult,
  NoteRecord,
  OllamaModel,
  PublicUser,
  Reminder,
  SmtpConfig,
  WaMessage
} from './types'

const api = {
  ollama: {
    status: () => ipcRenderer.invoke('ollama:status') as Promise<{ running: boolean; base: string }>,
    models: () => ipcRenderer.invoke('ollama:models') as Promise<OllamaModel[]>,
    defaultModel: () => ipcRenderer.invoke('ollama:defaultModel') as Promise<string | null>,
    generate: (payload: { task: string; prompt: string; context?: string }) =>
      ipcRenderer.invoke('ollama:generate', payload) as Promise<GenerateResult>,
    onChunk: (cb: (chunk: string) => void) => {
      const listener = (_e: unknown, chunk: string) => cb(chunk)
      ipcRenderer.on('ollama:chunk', listener)
      return () => ipcRenderer.removeListener('ollama:chunk', listener)
    }
  },
  settings: {
    get: () => ipcRenderer.invoke('settings:get') as Promise<AiSettings>,
    save: (s: AiSettings) => ipcRenderer.invoke('settings:save', s),
    getLang: () => ipcRenderer.invoke('settings:getLang') as Promise<string>,
    setLang: (lang: string) => ipcRenderer.invoke('settings:setLang', lang),
    getMode: () => ipcRenderer.invoke('settings:getMode') as Promise<'light' | 'dark'>,
    setMode: (mode: 'light' | 'dark') => ipcRenderer.invoke('settings:setMode', mode),
    getAccent: () => ipcRenderer.invoke('settings:getAccent') as Promise<string>,
    setAccent: (accent: string) => ipcRenderer.invoke('settings:setAccent', accent),
    getPrefs: () => ipcRenderer.invoke('settings:getPrefs') as Promise<{ location: string; notifications: boolean }>,
    setPrefs: (prefs: { location: string; notifications: boolean }) => ipcRenderer.invoke('settings:setPrefs', prefs)
  },
  auth: {
    current: () => ipcRenderer.invoke('auth:current') as Promise<PublicUser | null>,
    signup: (email: string, password: string, name: string) => ipcRenderer.invoke('auth:signup', email, password, name) as Promise<PublicUser>,
    signin: (email: string, password: string) => ipcRenderer.invoke('auth:signin', email, password) as Promise<PublicUser>,
    signout: () => ipcRenderer.invoke('auth:signout'),
    updateName: (id: number, name: string) => ipcRenderer.invoke('auth:updateName', id, name) as Promise<PublicUser>,
    changePassword: (id: number, current: string, next: string) => ipcRenderer.invoke('auth:changePassword', id, current, next),
    deleteAccount: (id: number) => ipcRenderer.invoke('auth:deleteAccount', id),
    google: () => ipcRenderer.invoke('auth:google') as Promise<PublicUser>,
    microsoft: () => ipcRenderer.invoke('auth:microsoft') as Promise<PublicUser>,
    oauthConfig: (provider: 'google' | 'microsoft') => ipcRenderer.invoke('auth:oauthConfig', provider) as Promise<{ clientId: string; clientSecret: string }>,
    saveOauthConfig: (provider: 'google' | 'microsoft', clientId: string, clientSecret: string) =>
      ipcRenderer.invoke('auth:saveOauthConfig', provider, clientId, clientSecret)
  },
  conversations: {
    create: (title?: string) => ipcRenderer.invoke('conversations:create', title) as Promise<Conversation>,
    list: () => ipcRenderer.invoke('conversations:list') as Promise<Conversation[]>,
    get: (id: number) => ipcRenderer.invoke('conversations:get', id) as Promise<Conversation | null>,
    messages: (id: number) => ipcRenderer.invoke('conversations:messages', id) as Promise<ChatMessage[]>,
    rename: (id: number, title: string) => ipcRenderer.invoke('conversations:rename', id, title),
    delete: (id: number) => ipcRenderer.invoke('conversations:delete', id)
  },
  reminders: {
    add: (r: { title: string; dueAt: string; type: Reminder['type']; note?: string }) =>
      ipcRenderer.invoke('reminders:add', r) as Promise<Reminder>,
    list: () => ipcRenderer.invoke('reminders:list') as Promise<Reminder[]>,
    done: (id: number) => ipcRenderer.invoke('reminders:done', id),
    delete: (id: number) => ipcRenderer.invoke('reminders:delete', id)
  },
  chat: {
    send: (payload: { conversationId?: number; userText: string; images?: string[] }) =>
      ipcRenderer.invoke('chat:send', payload) as Promise<{ conversationId: number; assistant: ChatMessage }>,
    onChunk: (cb: (chunk: string) => void) => {
      const listener = (_e: unknown, chunk: string) => cb(chunk)
      ipcRenderer.on('chat:chunk', listener)
      return () => ipcRenderer.removeListener('chat:chunk', listener)
    },
    onTool: (cb: (tool: { name: string; running: boolean; result?: string }) => void) => {
      const listener = (_e: unknown, tool: { name: string; running: boolean; result?: string }) => cb(tool)
      ipcRenderer.on('chat:tool', listener)
      return () => ipcRenderer.removeListener('chat:tool', listener)
    }
  },
  mail: {
    smtp: () => ipcRenderer.invoke('mail:smtp') as Promise<SmtpConfig | null>,
    saveSmtp: (c: SmtpConfig) => ipcRenderer.invoke('mail:saveSmtp', c),
    testSmtp: (c: SmtpConfig) => ipcRenderer.invoke('mail:testSmtp', c) as Promise<boolean>,
    send: (c: SmtpConfig, d: EmailDraft) => ipcRenderer.invoke('mail:send', c, d) as Promise<EmailRecord>,
    saveDraft: (d: EmailDraft) => ipcRenderer.invoke('mail:saveDraft', d) as Promise<EmailRecord>,
    history: () => ipcRenderer.invoke('mail:history') as Promise<EmailRecord[]>
  },
  wa: {
    init: () => ipcRenderer.invoke('wa:init') as Promise<string>,
    state: () => ipcRenderer.invoke('wa:state') as Promise<string>,
    qr: () => ipcRenderer.invoke('wa:qr') as Promise<string | null>,
    chats: () => ipcRenderer.invoke('wa:chats') as Promise<ChatInfo[]>,
    localChats: () => ipcRenderer.invoke('wa:localChats') as Promise<ChatInfo[]>,
    messages: (chatId: string, limit?: number) => ipcRenderer.invoke('wa:messages', chatId, limit) as Promise<WaMessage[]>,
    localMessages: (chatId?: string) => ipcRenderer.invoke('wa:localMessages', chatId) as Promise<WaMessage[]>,
    send: (chatId: string, text: string) => ipcRenderer.invoke('wa:send', chatId, text) as Promise<boolean>,
    logout: () => ipcRenderer.invoke('wa:logout'),
    onState: (cb: (state: string, qr?: string) => void) => {
      const listener = (_e: unknown, state: string, qr?: string) => cb(state, qr)
      ipcRenderer.on('wa:state', listener)
      return () => ipcRenderer.removeListener('wa:state', listener)
    },
    onMessage: (cb: (msg: WaMessage) => void) => {
      const listener = (_e: unknown, msg: WaMessage) => cb(msg)
      ipcRenderer.on('wa:message', listener)
      return () => ipcRenderer.removeListener('wa:message', listener)
    },
    onError: (cb: (err: string) => void) => {
      const listener = (_e: unknown, err: string) => cb(err)
      ipcRenderer.on('wa:error', listener)
      return () => ipcRenderer.removeListener('wa:error', listener)
    }
  },
  notes: {
    pick: () => ipcRenderer.invoke('notes:pick') as Promise<{ filePath: string; name: string; size: number } | null>,
    extract: (filePath: string) =>
      ipcRenderer.invoke('notes:extract', filePath) as Promise<{ mode: string; totalChars: number; pages: number; preview: string }>,
    generate: (opts: { filePath: string; language: string }) =>
      ipcRenderer.invoke('notes:generate', opts) as Promise<{ markdown: string; path: string; chunks: number; mode: string }>,
    list: () => ipcRenderer.invoke('notes:list') as Promise<NoteRecord[]>,
    read: (filePath: string) => ipcRenderer.invoke('notes:read', filePath) as Promise<string>,
    openFolder: () => ipcRenderer.invoke('notes:openFolder'),
    delete: (n: NoteRecord) => ipcRenderer.invoke('notes:delete', n),
    onProgress: (cb: (p: { chunk: number; total: number; text: string }) => void) => {
      const listener = (_e: unknown, p: { chunk: number; total: number; text: string }) => cb(p)
      ipcRenderer.on('notes:progress', listener)
      return () => ipcRenderer.removeListener('notes:progress', listener)
    }
  },
  app: {
    version: () => ipcRenderer.invoke('app:version') as Promise<string>
  }
}

export type ToqiApi = typeof api

contextBridge.exposeInMainWorld('toqi', api)
