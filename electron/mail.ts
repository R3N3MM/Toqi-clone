import nodemailer, { type Transporter } from 'nodemailer'
import type { EmailDraft, EmailRecord, SmtpConfig } from './types'
import { db } from './db'

function nowIso(): string {
  return new Date().toISOString()
}

function makeTransporter(config: SmtpConfig): Transporter {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass }
  })
}

export async function sendEmail(config: SmtpConfig, draft: EmailDraft): Promise<EmailRecord> {
  const transporter = makeTransporter(config)
  const from = `"${config.fromName || config.fromEmail}" <${config.fromEmail}>`
  try {
    await transporter.sendMail({
      from,
      to: draft.to,
      subject: draft.subject,
      text: draft.body
    })
    const record: EmailRecord = {
      to: draft.to,
      subject: draft.subject,
      body: draft.body,
      sentAt: nowIso(),
      status: 'sent'
    }
    const id = insertEmail(record)
    return { ...record, id }
  } catch (err) {
    const record: EmailRecord = {
      to: draft.to,
      subject: draft.subject,
      body: draft.body,
      sentAt: nowIso(),
      status: 'failed',
      error: err instanceof Error ? err.message : String(err)
    }
    const id = insertEmail(record)
    return { ...record, id }
  }
}

export function saveEmailDraft(draft: EmailDraft): EmailRecord {
  const record: EmailRecord = {
    to: draft.to,
    subject: draft.subject,
    body: draft.body,
    sentAt: nowIso(),
    status: 'draft'
  }
  const id = insertEmail(record)
  return { ...record, id }
}

function insertEmail(record: EmailRecord): number {
  db.run(
    `INSERT INTO emails (to_addr, subject, body, sent_at, status, error) VALUES (?, ?, ?, ?, ?, ?)`,
    [record.to, record.subject, record.body, record.sentAt, record.status, record.error ?? null]
  )
  const row = db.get<{ id: number }>('SELECT last_insert_rowid() AS id')
  return row?.id ?? 0
}

export function listEmails(): EmailRecord[] {
  const rows = db.all<{
    id: number
    to_addr: string
    subject: string
    body: string
    sent_at: string
    status: string
    error: string | null
  }>('SELECT * FROM emails ORDER BY id DESC LIMIT 500')
  return rows.map((r) => ({
    id: r.id,
    to: r.to_addr,
    subject: r.subject,
    body: r.body,
    sentAt: r.sent_at,
    status: r.status as EmailRecord['status'],
    error: r.error ?? undefined
  }))
}

export async function saveSmtpConfig(config: SmtpConfig): Promise<void> {
  await db.run(`INSERT INTO settings (key, value) VALUES ('smtp', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [JSON.stringify(config)])
  await db.save()
}

export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const row = db.get<{ value: string }>(`SELECT value FROM settings WHERE key = 'smtp'`)
  if (!row) return null
  try {
    return JSON.parse(row.value) as SmtpConfig
  } catch {
    return null
  }
}

export async function testSmtp(config: SmtpConfig): Promise<boolean> {
  try {
    const transporter = makeTransporter(config)
    await transporter.verify()
    return true
  } catch {
    return false
  }
}
