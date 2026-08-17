export interface OllamaModel {
  name: string
  size: number
  modified_at: string
  details?: { parameter_size?: string; family?: string }
}

export interface GenerateRequest {
  model: string
  prompt: string
  system?: string
  context?: string
  temperature?: number
}

export interface GenerateResult {
  text: string
  model: string
  done: boolean
  totalDuration?: number
}

export interface SmtpConfig {
  host: string
  port: number
  secure: boolean
  user: string
  pass: string
  fromName: string
  fromEmail: string
}

export interface EmailDraft {
  to: string
  subject: string
  body: string
}

export interface EmailRecord {
  id?: number
  to: string
  subject: string
  body: string
  sentAt: string
  status: 'sent' | 'draft' | 'failed'
  error?: string
}

export interface WaMessage {
  id?: number
  chatId: string
  chatName: string
  fromMe: boolean
  body: string
  timestamp: string
}

export interface NoteRecord {
  id?: number
  filename: string
  title: string
  createdAt: string
  sizeBytes: number
  chunkCount: number
  path: string
  preview: string
}

export interface ChatInfo {
  id: string
  name: string
  lastMessage?: string
  timestamp?: string
  unreadCount: number
}

export interface WaContact {
  id: string
  name: string
}

export interface AiSettings {
  model: string
  temperature: number
  language: string
}

export interface PublicUser {
  id: number
  email: string
  name: string
  provider: 'local' | 'google' | 'microsoft'
  avatar: string
}

export interface Conversation {
  id: number
  title: string
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: number
  conversation_id: number
  role: 'user' | 'assistant' | 'tool'
  content: string
  images: string[]
  created_at: string
}

export interface Reminder {
  id: number
  title: string
  due_at: string
  type: 'reminder' | 'alarm' | 'event'
  note: string
  done: boolean
  created_at: string
}
