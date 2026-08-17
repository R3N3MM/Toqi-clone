import type { GenerateRequest, GenerateResult, OllamaModel } from './types'

export const OLLAMA_BASE = 'http://localhost:11434'

export const HUMAN_SYSTEM = `You are a natural, skilled writer embedded in a personal assistant app. Rules you must always follow:
1. Write exactly like a real, thoughtful human being. Never sound like an AI.
2. Absolutely no AI fluff: never start with "Certainly!", "Sure!", "Here is", "As an AI", "I hope this helps", or any filler. Get straight to the point.
3. Do not use emojis unless the user explicitly asks for them.
4. Mirror the user's tone (formal, friendly, urgent, casual) and their language.
5. Respect the user's explicit instructions and decisions completely. Never rewrite, soften, or override what the user decided. You only improve wording and structure.
6. When asked to write or reply, produce the finished text only — no commentary, no meta talk, no explanation of what you did.`

const TASKS: Record<string, string> = {
  compose: `The user is composing an email or message. Use the given details (recipient, subject, tone, and the user's instructions) to write a complete, ready-to-send message. Match the user's language. Respect every instruction they gave.`,
  reply: `The user wants a reply. Below is the conversation context and the user's instruction. Write a natural reply that respects the user's decisions, matches their tone and language, and sounds human.`,
  notes: `You are a brilliant student preparing world-class study notes to score 100%. Convert the given raw material into structured Markdown notes that include:
- A clear heading hierarchy (title, sections, subsections)
- Key concepts explained in plain, accurate language
- Definitions highlighted
- Worked examples and formulas where relevant
- Tips / memory hooks / exam pointers
- A "Review questions" section at the end to self-test
Keep it dense with signal, zero filler, no AI-fluff intro. Write entirely in the user's requested language.`
}

export function humanSystem(task: keyof typeof TASKS): string {
  return `${HUMAN_SYSTEM}\n\n${TASKS[task] ?? ''}`
}

export async function isOllamaRunning(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) })
    return res.ok
  } catch {
    return false
  }
}

export async function listModels(): Promise<OllamaModel[]> {
  const res = await fetch(`${OLLAMA_BASE}/api/tags`)
  if (!res.ok) throw new Error(`Ollama returned ${res.status}`)
  const data = (await res.json()) as { models: OllamaModel[] }
  return data.models ?? []
}

export async function generateStreaming(
  req: GenerateRequest,
  onChunk: (chunk: string) => void
): Promise<GenerateResult> {
  const messages: Array<{ role: 'system' | 'user'; content: string }> = []
  if (req.system) messages.push({ role: 'system', content: req.system })
  let content = req.prompt
  if (req.context) content = `${req.context}\n\n---\n\n${content}`
  messages.push({ role: 'user', content })

  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: req.model,
      messages,
      stream: true,
      options: {
        temperature: req.temperature ?? 0.6
      }
    })
  })

  if (!res.ok || !res.body) throw new Error(`Ollama returned ${res.status}`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let full = ''
  let done = false
  let totalDuration: number | undefined

  try {
    while (true) {
      const { value, done: readerDone } = await reader.read()
      if (readerDone) break
      const text = decoder.decode(value, { stream: true })
      for (const line of text.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const json = JSON.parse(trimmed) as {
            message?: { content?: string }
            done?: boolean
            total_duration?: number
          }
          if (json.message?.content) {
            full += json.message.content
            onChunk(json.message.content)
          }
          if (json.done) {
            done = true
            totalDuration = json.total_duration
          }
        } catch {
          // skip partial lines
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  return { text: full.trim(), model: req.model, done, totalDuration }
}

export async function getDefaultModel(): Promise<string | null> {
  const models = await listModels()
  if (models.length === 0) return null
  const preferred = ['qwen2.5', 'llama3.1', 'llama3', 'mistral', 'gemma2', 'phi3']
  for (const p of preferred) {
    const hit = models.find((m) => m.name.toLowerCase().startsWith(p))
    if (hit) return hit.name
  }
  return models[0].name
}

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  images?: string[]
  tool_calls?: Array<{ id?: string; type?: string; function: { name: string; arguments: string | Record<string, unknown> } }>
  tool_call_id?: string
}

export interface ToolDef {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: {
      type: 'object'
      properties: Record<string, { type: string; description: string }>
      required?: string[]
    }
  }
}

export const TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'send_email',
      description:
        'Send an email through the user\'s configured SMTP account. Use ONLY when the user explicitly asks to send an email. Returns success or a clear error.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient email address' },
          subject: { type: 'string', description: 'Email subject line' },
          body: { type: 'string', description: 'Full email body text' }
        },
        required: ['to', 'subject', 'body']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'send_whatsapp',
      description:
        'Send a WhatsApp message to a phone number or contact. Use ONLY when the user explicitly asks to send a WhatsApp message. Requires an active WhatsApp session in the app.',
      parameters: {
        type: 'object',
        properties: {
          to: { type: 'string', description: 'Recipient phone number with country code, e.g. 27123456789' },
          text: { type: 'string', description: 'Message text to send' }
        },
        required: ['to', 'text']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'make_study_notes',
      description:
        'Convert a PDF file on the user\'s computer into high-quality structured study notes. Use when the user asks to create notes from a file, module, or PDF.',
      parameters: {
        type: 'object',
        properties: {
          filePath: { type: 'string', description: 'Absolute path to the PDF file' },
          language: { type: 'string', description: 'Language code for the notes, e.g. en, fr, ar' }
        },
        required: ['filePath']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_reminder',
      description:
        'Create a reminder or alarm for the user (date/time based). Use when the user asks to remind them of something at a specific time.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Short title of the reminder' },
          dueAt: { type: 'string', description: 'ISO 8601 datetime, e.g. 2026-08-18T14:30:00' },
          note: { type: 'string', description: 'Optional extra detail' },
          type: { type: 'string', description: 'reminder | alarm | event' }
        },
        required: ['title', 'dueAt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_reminders',
      description: 'List the user\'s current reminders and alarms.',
      parameters: {
        type: 'object',
        properties: {}
      }
    }
  }
]

export interface ChatStreamResult {
  text: string
  model: string
  done: boolean
  toolCalls: Array<{ id?: string; name: string; arguments: Record<string, unknown> }>
}

export async function chatStreaming(
  model: string,
  messages: ChatMsg[],
  tools: ToolDef[] | undefined,
  onChunk: (chunk: string) => void
): Promise<ChatStreamResult> {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      tools: tools ?? [],
      stream: true,
      options: { temperature: 0.6 }
    }),
    signal: AbortSignal.timeout(300_000)
  })

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => '')
    throw new Error(`Ollama returned ${res.status}: ${errText.slice(0, 300)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let full = ''
  let done = false
  const toolCalls: Array<{ id?: string; name: string; arguments: Record<string, unknown> }> = []

  try {
    while (true) {
      const { value, done: readerDone } = await reader.read()
      if (readerDone) break
      const text = decoder.decode(value, { stream: true })
      for (const line of text.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed) continue
        try {
          const json = JSON.parse(trimmed) as {
            message?: {
              content?: string
              tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }>
            }
            done?: boolean
          }
          if (json.message?.content) {
            full += json.message.content
            onChunk(json.message.content)
          }
          if (json.message?.tool_calls) {
            for (const tc of json.message.tool_calls) {
              if (tc.function?.name) {
                let args: Record<string, unknown> = {}
                if (typeof tc.function.arguments === 'string') {
                  try {
                    args = JSON.parse(tc.function.arguments)
                  } catch {
                    args = {}
                  }
                } else if (tc.function.arguments && typeof tc.function.arguments === 'object') {
                  args = tc.function.arguments as Record<string, unknown>
                }
                toolCalls.push({ id: tc.id, name: tc.function.name, arguments: args })
              }
            }
          }
          if (json.done) done = true
        } catch {
          // skip partial lines
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  return { text: full.trim(), model, done, toolCalls }
}

const VISION_HINTS = ['llava', 'minicpm', 'qwen2-vl', 'qwen2.5-vl', 'gemma3', 'gemma4', 'vision', 'bakllava', 'ocr', 'vl']

export function isVisionModel(model: string): boolean {
  const m = model.toLowerCase()
  return VISION_HINTS.some((h) => m.includes(h))
}

export async function getChatModel(): Promise<string | null> {
  const models = await listModels()
  if (models.length === 0) return null
  const tierOrder = { fast: 0, balanced: 1, smart: 2 }
  const sorted = [...models].sort((a, b) => {
    const ta = tierOrder[modelTier(a.name)]
    const tb = tierOrder[modelTier(b.name)]
    if (ta !== tb) return ta - tb
    return a.size - b.size
  })
  return sorted[0].name
}

export async function getVisionModel(): Promise<string | null> {
  const models = await listModels()
  const vision = models.find((m) => isVisionModel(m.name))
  return vision?.name ?? (await getChatModel())
}

export type ModelTier = 'fast' | 'balanced' | 'smart'

export function modelTier(model: string): ModelTier {
  const name = model.toLowerCase()
  const sizeMatch = name.match(/:(\d+(?:\.\d+)?)b/)
  if (sizeMatch) {
    const size = parseFloat(sizeMatch[1])
    if (size <= 4) return 'fast'
    if (size <= 11) return 'balanced'
    return 'smart'
  }
  if (name.includes('llama3.3') || name.includes('70b') || name.includes('32b')) return 'smart'
  if (name.includes('13b') || name.includes('14b') || name.includes('30b')) return 'smart'
  return 'balanced'
}

export function friendlyModelLabel(model: string): string {
  return modelTier(model)
}
