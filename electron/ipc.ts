import { BrowserWindow, app, dialog, ipcMain, shell } from 'electron'
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
  // --- AI / Ollama ---
  ipcMain.handle('ollama:status', async () => {
    return { running: await isOllamaRunning(), base: OLLAMA_BASE }
  })
  ipcMain.handle('ollama:models', async () => {
    return listModels()
  })
  ipcMain.handle('ollama:defaultModel', async () => {
    return getDefaultModel()
  })
  ipcMain.handle('ollama:generate', async (_e, payload: { task: string; prompt: string; context?: string }) => {
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
  ipcMain.handle('settings:get', async () => getAiSettings())
  ipcMain.handle('settings:save', async (_e, s: AiSettings) => {
    await saveAiSettings(s)
  })
  ipcMain.handle('settings:getLang', async () => getUiLanguage())
  ipcMain.handle('settings:setLang', async (_e, lang: string) => {
    await saveUiLanguage(lang)
  })
  ipcMain.handle('settings:getMode', async () => getThemeMode())
  ipcMain.handle('settings:setMode', async (_e, mode: 'light' | 'dark') => {
    await saveThemeMode(mode)
  })
  ipcMain.handle('settings:getAccent', async () => getThemeAccent())
  ipcMain.handle('settings:setAccent', async (_e, accent: string) => {
    await saveThemeAccent(accent)
  })
  ipcMain.handle('settings:getPrefs', async () => getPrefs())
  ipcMain.handle('settings:setPrefs', async (_e, prefs: { location: string; notifications: boolean }) => {
    await savePrefs(prefs)
  })

  // --- Auth ---
  ipcMain.handle('auth:current', async () => getCurrentUser())
  ipcMain.handle('auth:signup', async (_e, email: string, password: string, name: string) => signUpLocal(email, password, name))
  ipcMain.handle('auth:signin', async (_e, email: string, password: string) => signInLocal(email, password))
  ipcMain.handle('auth:signout', async () => signOut())
  ipcMain.handle('auth:updateName', async (_e, id: number, name: string) => updateUserName(id, name))
  ipcMain.handle('auth:changePassword', async (_e, id: number, current: string, next: string) => changePassword(id, current, next))
  ipcMain.handle('auth:deleteAccount', async (_e, id: number) => deleteAccount(id))
  ipcMain.handle('auth:google', async () => {
    const profile = await loginWithGoogle()
    return signInProvider(profile.provider, profile.email, profile.name, profile.avatar)
  })
  ipcMain.handle('auth:microsoft', async () => {
    const profile = await loginWithMicrosoft()
    return signInProvider(profile.provider, profile.email, profile.name, profile.avatar)
  })
  ipcMain.handle('auth:oauthConfig', async (_e, provider: 'google' | 'microsoft') => getOAuthConfig(provider))
  ipcMain.handle('auth:saveOauthConfig', async (_e, provider: 'google' | 'microsoft', clientId: string, clientSecret: string) =>
    saveOAuthConfig(provider, clientId, clientSecret)
  )

  // --- Conversations / History ---
  const requireUser = async (): Promise<{ id: number }> => {
    const user = await getCurrentUser()
    if (!user) throw new Error('Not signed in.')
    return user
  }
  ipcMain.handle('conversations:create', async (_e, title?: string) => createConversation((await requireUser()).id, title))
  ipcMain.handle('conversations:list', async () => listConversations((await requireUser()).id))
  ipcMain.handle('conversations:get', async (_e, id: number) => getConversation((await requireUser()).id, id))
  ipcMain.handle('conversations:messages', async (_e, id: number) => getMessages(id))
  ipcMain.handle('conversations:rename', async (_e, id: number, title: string) =>
    setConversationTitle((await requireUser()).id, id, title)
  )
  ipcMain.handle('conversations:delete', async (_e, id: number) => deleteConversation((await requireUser()).id, id))

  // --- Calendar / Reminders ---
  ipcMain.handle('reminders:add', async (_e, r: { title: string; dueAt: string; type: Reminder['type']; note?: string }) =>
    addReminder((await requireUser()).id, r.title, r.dueAt, r.type, r.note ?? '')
  )
  ipcMain.handle('reminders:list', async () => listReminders((await requireUser()).id))
  ipcMain.handle('reminders:done', async (_e, id: number) => markReminderDone((await requireUser()).id, id))
  ipcMain.handle('reminders:delete', async (_e, id: number) => deleteReminder((await requireUser()).id, id))

  // --- Chat (AI) ---
  ipcMain.handle('chat:send', async (_e, payload: { conversationId?: number; userText: string; images?: string[] }) => {
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
  ipcMain.handle('mail:smtp', async () => getSmtpConfig())
  ipcMain.handle('mail:saveSmtp', async (_e, c: SmtpConfig) => {
    await saveSmtpConfig(c)
  })
  ipcMain.handle('mail:testSmtp', async (_e, c: SmtpConfig) => testSmtp(c))
  ipcMain.handle('mail:send', async (_e, c: SmtpConfig, draft: EmailDraft) => sendEmail(c, draft))
  ipcMain.handle('mail:saveDraft', async (_e, draft: EmailDraft) => saveEmailDraft(draft))
  ipcMain.handle('mail:history', async () => listEmails())

  // --- WhatsApp ---
  ipcMain.handle('wa:init', async () => {
    const wa = getWa()
    await wa.init()
    return wa.getState()
  })
  ipcMain.handle('wa:state', async () => getWa().getState())
  ipcMain.handle('wa:qr', async () => getWa().getQr())
  ipcMain.handle('wa:chats', async () => getWa().getChats())
  ipcMain.handle('wa:localChats', async () => listStoredChats())
  ipcMain.handle('wa:messages', async (_e, chatId: string, limit?: number) =>
    getWa().getChatMessages(chatId, limit ?? 50)
  )
  ipcMain.handle('wa:localMessages', async (_e, chatId?: string) => listStoredMessages(chatId))
  ipcMain.handle('wa:send', async (_e, chatId: string, text: string) => getWa().sendMessage(chatId, text))
  ipcMain.handle('wa:logout', async () => {
    await getWa().logout()
  })

  // --- Notes ---
  ipcMain.handle('notes:pick', async () => {
    const win = getMainWindow()
    if (!win) return null
    const result = await dialog.showOpenDialog(win, {
      title: 'Select a module PDF',
      filters: [{ name: 'PDF documents', extensions: ['pdf'] }],
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    const stat = await fs.stat(filePath)
    return { filePath, name: path.basename(filePath), size: stat.size }
  })
  ipcMain.handle('notes:extract', async (_e, filePath: string) => {
    const result = await extractPdf(filePath)
    return {
      mode: result.mode,
      totalChars: result.totalChars,
      pages: result.pages.length,
      preview: result.pages.slice(0, 2).map((p) => p.text).join('\n').slice(0, 2000)
    }
  })
  ipcMain.handle('notes:generate', async (_e, opts: { filePath: string; language: string }) => {
    const settings = getAiSettings()
    const model = settings.model || (await getDefaultModel())
    if (!model) throw new Error('No Ollama model selected.')
    const result = await generateNotes({
      filePath: opts.filePath,
      model,
      language: opts.language,
      onProgress: (p) => {
        getMainWindow()?.webContents.send('notes:progress', p)
      }
    })
    return result
  })
  ipcMain.handle('notes:list', async () => listNotes())
  ipcMain.handle('notes:read', async (_e, filePath: string) => readNoteFile(filePath))
  ipcMain.handle('notes:openFolder', async () => {
    await shell.openPath(notesDir())
  })
  ipcMain.handle('notes:delete', async (_e, n: NoteRecord) => deleteNote(n.id!, n.path))

  // --- App / misc ---
  ipcMain.handle('app:version', async () => app.getVersion())
  ipcMain.handle('db:path', async () => db.getDbPath())
}
