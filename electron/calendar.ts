import { Notification } from 'electron'
import { db } from './db'
import { getCurrentUser } from './auth'

export interface Reminder {
  id: number
  user_id: number | null
  title: string
  due_at: string
  type: 'reminder' | 'alarm' | 'event'
  note: string
  done: boolean
  created_at: string
}

export async function addReminder(
  userId: number,
  title: string,
  dueAt: string,
  type: Reminder['type'] = 'reminder',
  note = ''
): Promise<Reminder> {
  const now = new Date().toISOString()
  const id = await db.run(
    `INSERT INTO reminders (user_id, title, due_at, type, note, done, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)`,
    [userId, title, dueAt, type, note, now]
  )
  await db.save()
  return { id: Number(id), user_id: userId, title, due_at: dueAt, type, note, done: false, created_at: now }
}

export function listReminders(userId: number): Reminder[] {
  const rows = db.all<{ id: number; user_id: number | null; title: string; due_at: string; type: string; note: string; done: number; created_at: string }>(
    `SELECT * FROM reminders WHERE user_id = ? ORDER BY due_at ASC`, [userId]
  )
  return rows.map((r) => ({ ...r, type: r.type as Reminder['type'], done: r.done === 1 }))
}

export function getDueReminders(userId: number): Reminder[] {
  const now = new Date().toISOString()
  const rows = db.all<{ id: number; user_id: number | null; title: string; due_at: string; type: string; note: string; done: number; created_at: string }>(
    `SELECT * FROM reminders WHERE user_id = ? AND done = 0 AND due_at <= ? ORDER BY due_at ASC`, [userId, now]
  )
  return rows.map((r) => ({ ...r, type: r.type as Reminder['type'], done: r.done === 1 }))
}

export async function markReminderDone(userId: number, id: number): Promise<void> {
  await db.run(`UPDATE reminders SET done = 1 WHERE id = ? AND user_id = ?`, [id, userId])
  await db.save()
}

export async function deleteReminder(userId: number, id: number): Promise<void> {
  await db.run(`DELETE FROM reminders WHERE id = ? AND user_id = ?`, [id, userId])
  await db.save()
}

let scheduler: NodeJS.Timeout | null = null

export function startReminderScheduler(): void {
  if (scheduler) return
  const tick = async (): Promise<void> => {
    const user = await getCurrentUser()
    if (!user) return
    const due = getDueReminders(user.id)
    for (const r of due) {
      if (Notification.isSupported()) {
        const label = r.type === 'alarm' ? 'Alarm' : r.type === 'event' ? 'Event' : 'Reminder'
        new Notification({
          title: `${label}: ${r.title}`,
          body: r.note || new Date(r.due_at).toLocaleString()
        }).show()
      }
      await markReminderDone(user.id, r.id)
    }
  }
  void tick()
  scheduler = setInterval(() => void tick(), 30_000)
}

export function stopReminderScheduler(): void {
  if (scheduler) {
    clearInterval(scheduler)
    scheduler = null
  }
}