import { BrowserWindow, app, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import type { AiSettings, EmailDraft, NoteRecord, SmtpConfig } from './types'
import { db } from './db'
import {
  generateStreaming,
  getChatModel,
  getDefaultModel,
  getVisionModel,
  humanSystem,
  isOllamaRunning,
  listModels,
  OLLAMA_BASE,
  HUMAN_SYSTEM,
  type ChatMsg
} from './ollama'
import {
  getSmtpConfig,
  listEmails,
  saveEmailDraft,
  saveSmtpConfig,
  sendEmail,
  testSmtp
} from './mail'
import {
  confineToNotesDir,
  extractPdf,
  generateNotes,
  listNotes,
  notesDir,
  readNoteFile,
  deleteNote
} from './notes'
import {
  getAiSettings,
  getPrefs,
  getThemeAccent,
  getThemeMode,
  getUiLanguage,
  saveAiSettings,
  savePrefs,
  saveThemeAccent,
  saveThemeMode,
  saveUiLanguage
} from './settings'
import {
  listStoredChats,
  listStoredMessages,
  WhatsAppManager
} from './whatsapp'
import {
  changePassword,
  deleteAccount,
  getCurrentUser,
  getOAuthConfig,
  saveOAuthConfig,
  signInLocal,
  signInProvider,
  signOut,
  signUpLocal,
  updateUserName
} from './auth'
import { loginWithGoogle, loginWithMicrosoft } from './oauth'
import {
  addMessage,
  createConversation,
  deleteConversation,
  getConversation,
  getMessages,
  listConversations,
  setConversationTitle,
  type ChatMessage
} from './conversations'
import {
  addReminder,
  deleteReminder,
  listReminders,
  markReminderDone,
  type Reminder
} from './calendar'
import { runConversation } from './agent'

export function registerIpc(getMainWindow: () => BrowserWindow | null, getWa: () => WhatsAppManager): void {
  // Reject any IPC call that does not originate from the main frame of the main
  // window. A compromised or injected renderer in another window/frame cannot
  // invoke handlers this way.
  function trustedSender(e: IpcMainInvokeEvent): boolean {
    const win = getMainWindow()
    if (!win || win.isDestroyed() || e.sender !== win.webContents) return false
    const frame = e.senderFrame
    return frame === win.webContents.mainFrame
  }

  function safeHandle(channel: string, listener: (e: IpcMainInvokeEvent, ...args: any[]) => unknown): void {
    ipcMain.handle(channel, (e, ...args) => {
      if (!trustedSender(e)) throw new Error('Unauthorized IPC call.')
      return listener(e, ...args)
    })
  }

  // --- AI / Ollama ---
  safeHandle('ollama:status', async () => {
    return { running: await isOllamaRunning(), base: OLLAMA_BASE }
  })
  safeHandle('ollama:models', async () => {
    return listModels()
  })
  safeHandle('ollama:defaultModel', async () => {
    return getDefaultModel()
  })
  safeHandle('ollama:generate', async (_e, payload: { task: string; prompt: string; context?: string }) => {
    const settings = getAiSettings()
    const model = settings.model || (await getDefaultModel())
    if (!model) throw new Error('No Ollama model selected.')
    return generateStreaming(
      {
        model,
        system: humanSystem(payload.task as 'compose' | 'reply' | 'notes'),
        prompt: payload.prompt,
        context: payload.context,
        temperature: settings.temperature
      },
      (chunk) => {
        getMainWindow()?.webContents.send('ollama:chunk', chunk)
      }
    )
  })

  // --- Settings ---
  safeHandle('settings:get', async () => getAiSettings())
  safeHandle('settings:save', async (_e, s: AiSettings) => {
    await saveAiSettings(s)
  })
  safeHandle('settings:getLang', async () => getUiLanguage())
  safeHandle('settings:setLang', async (_e, lang: string) => {
    await saveUiLanguage(lang)
  })
  safeHandle('settings:getMode', async () => getThemeMode())
  safeHandle('settings:setMode', async (_e, mode: 'light' | 'dark') => {
    await saveThemeMode(mode)
  })
  safeHandle('settings:getAccent', async () => getThemeAccent())
  safeHandle('settings:setAccent', async (_e, accent: string) => {
    await saveThemeAccent(accent)
  })
  safeHandle('settings:getPrefs', async () => getPrefs())
  safeHandle('settings:setPrefs', async (_e, prefs: { location: string; notifications: boolean }) => {
    await savePrefs(prefs)
  })

  // --- Auth ---
  safeHandle('auth:current', async () => getCurrentUser())
  safeHandle('auth:signup', async (_e, email: string, password: string, name: string) => signUpLocal(email, password, name))
  safeHandle('auth:signin', async (_e, email: string, password: string) => signInLocal(email, password))
  safeHandle('auth:signout', async () => signOut())
  safeHandle('auth:updateName', async (_e, id: number, name: string) => updateUserName(id, name))
  safeHandle('auth:changePassword', async (_e, id: number, current: string, next: string) => changePassword(id, current, next))
  safeHandle('auth:deleteAccount', async (_e, id: number) => deleteAccount(id))
  safeHandle('auth:google', async () => {
    const profile = await loginWithGoogle()
    return signInProvider(profile.provider, profile.email, profile.name, profile.avatar)
  })
  safeHandle('auth:microsoft', async () => {
    const profile = await loginWithMicrosoft()
    return signInProvider(profile.provider, profile.email, profile.name, profile.avatar)
  })
  safeHandle('auth:oauthConfig', async (_e, provider: 'google' | 'microsoft') => getOAuthConfig(provider))
  safeHandle('auth:saveOauthConfig', async (_e, provider: 'google' | 'microsoft', clientId: string, clientSecret: string) =>
    saveOAuthConfig(provider, clientId, clientSecret)
  )

  // --- Conversations / History ---
  const requireUser = async (): Promise<{ id: number }> => {
    const user = await getCurrentUser()
    if (!user) throw new Error('Not signed in.')
    return user
  }
  safeHandle('conversations:create', async (_e, title?: string) => createConversation((await requireUser()).id, title))
  safeHandle('conversations:list', async () => listConversations((await requireUser()).id))
  safeHandle('conversations:get', async (_e, id: number) => getConversation((await requireUser()).id, id))
  safeHandle('conversations:messages', async (_e, id: number) => getMessages(id))
  safeHandle('conversations:rename', async (_e, id: number, title: string) =>
    setConversationTitle((await requireUser()).id, id, title)
  )
  safeHandle('conversations:delete', async (_e, id: number) => deleteConversation((await requireUser()).id, id))

  // --- Calendar / Reminders ---
  safeHandle('reminders:add', async (_e, r: { title: string; dueAt: string; type: Reminder['type']; note?: string }) =>
    addReminder((await requireUser()).id, r.title, r.dueAt, r.type, r.note ?? '')
  )
  safeHandle('reminders:list', async () => listReminders((await requireUser()).id))
  safeHandle('reminders:done', async (_e, id: number) => markReminderDone((await requireUser()).id, id))
  safeHandle('reminders:delete', async (_e, id: number) => deleteReminder((await requireUser()).id, id))

  // --- Chat (AI) ---
  safeHandle('chat:send', async (_e, payload: { conversationId?: number; userText: string; images?: string[] }) => {
    const user = await requireUser()
    const settings = getAiSettings()
    const model = settings.model || (await getChatModel())
    if (!model) throw new Error('No Ollama model selected.')

    let convId = payload.conversationId
    if (!convId) {
      const conv = await createConversation(user.id, payload.userText.slice(0, 40))
      convId = conv.id
    } else if (!(await getConversation(user.id, convId))) {
      throw new Error('Conversation not found.')
    }

    const stored: ChatMessage[] = getMessages(convId)
    await addMessage(convId, 'user', payload.userText, payload.images ?? [])

    const system: ChatMsg = {
      role: 'system',
      content: `${HUMAN_SYSTEM}\n\nYou are the assistant in Toqi, a personal productivity app. You have tools you can call to help the user: send emails, send WhatsApp messages, generate study notes from PDF files, and manage reminders. Only call a tool when the user actually asks for that action or the action is clearly implied and safe. Never invent file paths, email addresses, or phone numbers — if the user did not provide a required value, ask them for it instead of calling the tool. After running a tool, briefly tell the user what happened in a natural, human way. Be conversational, concise, and never mention model names or tool internals. Never write raw JSON, code blocks, or tool-call syntax in your replies — always answer in plain conversational text.`
    }
    const history: ChatMsg[] = [
      system,
      ...stored.map((m): ChatMsg => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
        images: m.images && m.images.length > 0 ? m.images : undefined
      }))
    ]

    const win = getMainWindow()
    const result = await runConversation({
      model,
      history,
      userText: payload.userText,
      images: payload.images,
      userId: user.id,
      callbacks: {
        onChunk: (chunk) => win?.webContents.send('chat:chunk', chunk),
        onTool: (tool) => win?.webContents.send('chat:tool', tool)
      },
      getWa
    })

    const assistant = await addMessage(convId, 'assistant', result.text)
    return { conversationId: convId, assistant }
  })

  // --- Email ---
  safeHandle('mail:smtp', async () => getSmtpConfig())
  safeHandle('mail:saveSmtp', async (_e, c: SmtpConfig) => {
    await saveSmtpConfig(c)
  })
  safeHandle('mail:testSmtp', async (_e, c: SmtpConfig) => testSmtp(c))
  safeHandle('mail:send', async (_e, c: SmtpConfig, draft: EmailDraft) => sendEmail(c, draft))
  safeHandle('mail:saveDraft', async (_e, draft: EmailDraft) => saveEmailDraft(draft))
  safeHandle('mail:history', async () => listEmails())

  // --- WhatsApp ---
  safeHandle('wa:init', async () => {
    const wa = getWa()
    await wa.init()
    return wa.getState()
  })
  safeHandle('wa:state', async () => getWa().getState())
  safeHandle('wa:qr', async () => getWa().getQr())
  safeHandle('wa:chats', async () => getWa().getChats())
  safeHandle('wa:localChats', async () => listStoredChats())
  safeHandle('wa:messages', async (_e, chatId: string, limit?: number) =>
    getWa().getChatMessages(chatId, limit ?? 50)
  )
  safeHandle('wa:localMessages', async (_e, chatId?: string) => listStoredMessages(chatId))
  safeHandle('wa:send', async (_e, chatId: string, text: string) => getWa().sendMessage(chatId, text))
  safeHandle('wa:logout', async () => {
    await getWa().logout()
  })

  // --- Notes ---
  safeHandle('notes:pick', async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Select a module PDF',
      filters: [{ name: 'PDF documents', extensions: ['pdf'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const picked = result.filePaths[0]
    // Stage the user-selected file inside notesDir() so that all downstream
    // reads operate on a path confined to the notes directory.
    const stageDir = path.join(notesDir(), 'imports')
    await fs.mkdir(stageDir, { recursive: true })
    const staged = path.join(stageDir, `${Date.now()}_${path.basename(picked)}`)
    await fs.copyFile(picked, staged)
    const stat = await fs.stat(staged)
    return { filePath: staged, name: path.basename(picked), size: stat.size }
  })
  safeHandle('notes:extract', async (_e, filePath: string) => {
    const result = await extractPdf(confineToNotesDir(filePath))
    return {
      mode: result.mode,
      totalChars: result.totalChars,
      pages: result.pages.length,
      preview: result.pages.slice(0, 2).map((p) => p.text).join('\n').slice(0, 2000)
    }
  })
  safeHandle('notes:generate', async (_e, opts: { filePath: string; language: string }) => {
    const settings = getAiSettings()
    const model = settings.model || (await getDefaultModel())
    if (!model) throw new Error('No Ollama model selected.')
    const result = await generateNotes({
      filePath: confineToNotesDir(opts.filePath),
      model,
      language: opts.language,
      onProgress: (p) => {
        getMainWindow()?.webContents.send('notes:progress', p)
      }
    })
    return result
  })
  safeHandle('notes:list', async () => listNotes())
  safeHandle('notes:read', async (_e, filePath: string) => readNoteFile(confineToNotesDir(filePath)))
  safeHandle('notes:openFolder', async () => {
    await shell.openPath(notesDir())
  })
  safeHandle('notes:delete', async (_e, n: NoteRecord) => deleteNote(n.id!, confineToNotesDir(n.path)))

  // --- App / misc ---
  safeHandle('app:version', async () => app.getVersion())
  safeHandle('db:path', async () => db.getDbPath())
}
