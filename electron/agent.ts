import { existsSync } from 'fs'
import type { WhatsAppManager } from './whatsapp'
import { TOOLS, chatStreaming, getVisionModel, isVisionModel, type ChatMsg } from './ollama'
import { getSmtpConfig, sendEmail } from './mail'
import { generateNotes } from './notes'
import { addReminder, listReminders } from './calendar'

export interface AgentCallbacks {
  onChunk: (chunk: string) => void
  onTool: (tool: { name: string; running: boolean; result?: string }) => void
}

export interface RunConversationOpts {
  model: string
  history: ChatMsg[]
  userText: string
  images?: string[]
  userId: number
  callbacks: AgentCallbacks
  getWa: () => WhatsAppManager
}

const MAX_ITERATIONS = 5

export function formatWhatsAppNumber(to: string): string {
  const digits = to.replace(/[^\d]/g, '')
  if (!digits) throw new Error('Invalid WhatsApp number')
  return `${digits}@c.us`
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  model: string,
  userId: number,
  getWa: () => WhatsAppManager
): Promise<string> {
  switch (name) {
    case 'send_email': {
      const config = await getSmtpConfig()
      if (!config) return 'Error: No SMTP account is configured yet. The user must set up SMTP in Settings first.'
      const to = String(args.to ?? '').trim()
      if (!to) return 'Error: missing recipient (to).'
      const record = await sendEmail(config, {
        to,
        subject: String(args.subject ?? ''),
        body: String(args.body ?? '')
      })
      return record.status === 'sent'
        ? `Email sent successfully to ${record.to} with subject "${record.subject}".`
        : `Email failed to send: ${record.error ?? 'unknown error'}`
    }
    case 'send_whatsapp': {
      const wa = getWa()
      if (wa.getState() !== 'ready') {
        return 'Error: WhatsApp is not connected. The user must scan the QR code in the app first.'
      }
      const chatId = formatWhatsAppNumber(String(args.to ?? ''))
      const text = String(args.text ?? '').trim()
      if (!text) return 'Error: message text is empty.'
      await wa.sendMessage(chatId, text)
      return `WhatsApp message sent to ${chatId.replace('@c.us', '')}.`
    }
    case 'make_study_notes': {
      const filePath = String(args.filePath ?? '')
      if (!existsSync(filePath)) return `Error: file not found at ${filePath}`
      const language = String(args.language ?? 'en')
      const result = await generateNotes({ filePath, model, language })
      return `Study notes generated successfully. Written to ${result.path} (${result.chunks} chunks, ${result.mode} extraction).`
    }
    case 'create_reminder': {
      const title = String(args.title ?? '').trim()
      if (!title) return 'Error: missing reminder title.'
      const dueAt = String(args.dueAt ?? '')
      if (!dueAt || Number.isNaN(Date.parse(dueAt))) return 'Error: dueAt must be a valid ISO datetime.'
      const type = (String(args.type ?? 'reminder') as 'reminder' | 'alarm' | 'event')
      const reminder = await addReminder(userId, title, new Date(dueAt).toISOString(), type, String(args.note ?? ''))
      return `Reminder created: "${reminder.title}" at ${new Date(reminder.due_at).toLocaleString()}.`
    }
    case 'list_reminders': {
      const all = listReminders(userId)
      if (all.length === 0) return 'No reminders currently.'
      return all
        .map((r) => `${r.done ? '[done]' : '[pending]'} ${r.title} at ${new Date(r.due_at).toLocaleString()}${r.note ? ` — ${r.note}` : ''}`)
        .join('\n')
    }
    default:
      return `Error: unknown tool "${name}".`
  }
}

export async function runConversation(opts: RunConversationOpts): Promise<{ text: string }> {
  const { model, history, userText, images, userId, callbacks, getWa } = opts
  let activeModel = model

  if (images && images.length > 0 && !isVisionModel(activeModel)) {
    const visionModel = await getVisionModel()
    if (visionModel) activeModel = visionModel
  }

  const historyForChat: ChatMsg[] = history.map((m) => ({ ...m }))
  if (images && images.length > 0) {
    historyForChat.push({ role: 'user', content: userText, images })
  } else {
    historyForChat.push({ role: 'user', content: userText })
  }

  let finalText = ''

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    const result = await chatStreaming(activeModel, historyForChat, TOOLS, (chunk) => callbacks.onChunk(chunk))

    if (result.toolCalls.length > 0) {
      for (const tc of result.toolCalls) {
        callbacks.onTool({ name: tc.name, running: true })
        let outcome: string
        try {
          outcome = await executeTool(tc.name, tc.arguments, activeModel, userId, getWa)
        } catch (err) {
          outcome = `Error: ${err instanceof Error ? err.message : String(err)}`
        }
        callbacks.onTool({ name: tc.name, running: false, result: outcome })
        const callId = tc.id ?? `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        historyForChat.push({
          role: 'assistant',
          content: result.text,
          tool_calls: [
            {
              id: callId,
              type: 'function',
              function: { name: tc.name, arguments: tc.arguments }
            }
          ]
        })
        historyForChat.push({ role: 'tool', content: outcome, tool_call_id: callId })
      }
      continue
    }

    finalText = result.text
    break
  }

  return { text: finalText }
}