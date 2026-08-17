import { db } from './db'

export interface Conversation {
  id: number
  user_id: number | null
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

export async function createConversation(userId: number, title?: string): Promise<Conversation> {
  const now = new Date().toISOString()
  const id = await db.run(
    `INSERT INTO conversations (user_id, title, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    [userId, title ?? 'New conversation', now, now]
  )
  await db.save()
  return { id: Number(id), user_id: userId, title: title ?? 'New conversation', created_at: now, updated_at: now }
}

export function listConversations(userId: number): Conversation[] {
  return db.all<Conversation>(`SELECT * FROM conversations WHERE user_id = ? ORDER BY updated_at DESC`, [userId])
}

export async function getConversation(userId: number, id: number): Promise<Conversation | null> {
  const row = db.get<Conversation>(`SELECT * FROM conversations WHERE id = ? AND user_id = ?`, [id, userId])
  if (!row) return null
  return { ...row }
}

export function getMessages(conversationId: number): ChatMessage[] {
  const rows = db.all<{ id: number; conversation_id: number; role: string; content: string; images: string; created_at: string }>(
    `SELECT * FROM messages WHERE conversation_id = ? ORDER BY id ASC`, [conversationId]
  )
  return rows.map((r) => ({
    ...r,
    role: r.role as ChatMessage['role'],
    images: (() => {
      try {
        const parsed = JSON.parse(r.images)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    })()
  }))
}

export async function addMessage(
  conversationId: number,
  role: ChatMessage['role'],
  content: string,
  images: string[] = []
): Promise<ChatMessage> {
  const now = new Date().toISOString()
  const id = await db.run(
    `INSERT INTO messages (conversation_id, role, content, images, created_at) VALUES (?, ?, ?, ?, ?)`,
    [conversationId, role, content, JSON.stringify(images), now]
  )
  await db.run(`UPDATE conversations SET updated_at = ? WHERE id = ?`, [now, conversationId])
  await db.save()
  return { id: Number(id), conversation_id: conversationId, role, content, images, created_at: now }
}

export async function setConversationTitle(userId: number, id: number, title: string): Promise<void> {
  await db.run(`UPDATE conversations SET title = ? WHERE id = ? AND user_id = ?`, [title, id, userId])
  await db.save()
}

export async function deleteConversation(userId: number, id: number): Promise<void> {
  await db.run(`DELETE FROM conversations WHERE id = ? AND user_id = ?`, [id, userId])
  await db.save()
}

export async function renameConversation(userId: number, id: number, title: string): Promise<void> {
  await setConversationTitle(userId, id, title)
}