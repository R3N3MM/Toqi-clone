import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { db } from './db'

export interface PublicUser {
  id: number
  email: string
  name: string
  provider: 'local' | 'google' | 'microsoft'
  avatar: string
}

export type Provider = 'local' | 'google' | 'microsoft'

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const test = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return test.length === expected.length && timingSafeEqual(test, expected)
}

function toPublic(row: { id: number; email: string; name: string; provider: string; avatar: string }): PublicUser {
  return { id: row.id, email: row.email, name: row.name, provider: row.provider as PublicUser['provider'], avatar: row.avatar }
}

async function setSession(userId: number): Promise<void> {
  await db.run(`INSERT INTO settings (key, value) VALUES ('sessionUserId', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [String(userId)])
  await db.save()
}

export async function getCurrentUser(): Promise<PublicUser | null> {
  const row = db.get<{ value: string }>(`SELECT value FROM settings WHERE key = 'sessionUserId'`)
  if (!row) return null
  const user = db.get<{ id: number; email: string; name: string; provider: string; avatar: string }>(
    `SELECT id, email, name, provider, avatar FROM users WHERE id = ?`, [Number(row.value)]
  )
  return user ? toPublic(user) : null
}

export async function signUpLocal(email: string, password: string, name: string): Promise<PublicUser> {
  if (!email || !password) throw new Error('Email and password are required')
  if (password.length < 6) throw new Error('Password must be at least 6 characters')
  const existing = db.get<{ id: number }>(`SELECT id FROM users WHERE email = ?`, [email])
  if (existing) throw new Error('An account with this email already exists')
  const result = await db.run(
    `INSERT INTO users (email, name, password_hash, provider, created_at) VALUES (?, ?, ?, 'local', ?)`,
    [email, name, hashPassword(password), new Date().toISOString()]
  )
  const id = Number(result)
  await db.save()
  await setSession(id)
  return { id, email, name, provider: 'local', avatar: '' }
}

export async function signInLocal(email: string, password: string): Promise<PublicUser> {
  const row = db.get<{ id: number; email: string; name: string; provider: string; avatar: string; password_hash: string }>(
    `SELECT * FROM users WHERE email = ?`, [email]
  )
  if (!row || !row.password_hash || !verifyPassword(password, row.password_hash)) {
    throw new Error('Incorrect email or password')
  }
  await setSession(row.id)
  return toPublic(row)
}

export async function signInProvider(provider: Provider, email: string, name: string, avatar: string): Promise<PublicUser> {
  let row = db.get<{ id: number; email: string; name: string; provider: string; avatar: string }>(
    `SELECT id, email, name, provider, avatar FROM users WHERE email = ?`, [email]
  )
  if (!row) {
    const result = await db.run(
      `INSERT INTO users (email, name, provider, avatar, created_at) VALUES (?, ?, ?, ?, ?)`,
      [email, name, provider, avatar, new Date().toISOString()]
    )
    await db.save()
    row = { id: Number(result), email, name, provider, avatar }
  } else {
    await db.run(`UPDATE users SET name = ?, avatar = ? WHERE id = ?`, [name || row.name, avatar || row.avatar, row.id])
    await db.save()
  }
  await setSession(row.id)
  return toPublic(row)
}

export async function signOut(): Promise<void> {
  await db.run(`DELETE FROM settings WHERE key = 'sessionUserId'`)
  await db.save()
}

export async function updateUserName(id: number, name: string): Promise<PublicUser> {
  await db.run(`UPDATE users SET name = ? WHERE id = ?`, [name, id])
  await db.save()
  const row = db.get<{ id: number; email: string; name: string; provider: string; avatar: string }>(
    `SELECT id, email, name, provider, avatar FROM users WHERE id = ?`, [id]
  )
  if (!row) throw new Error('User not found')
  return toPublic(row)
}

export async function changePassword(id: number, current: string, next: string): Promise<void> {
  const row = db.get<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = ?`, [id])
  if (!row) throw new Error('User not found')
  if (!row.password_hash) throw new Error('This account uses provider login')
  if (!verifyPassword(current, row.password_hash)) throw new Error('Current password is incorrect')
  if (!next || next.length < 6) throw new Error('Password must be at least 6 characters')
  await db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [hashPassword(next), id])
  await db.save()
}

export async function deleteAccount(id: number): Promise<void> {
  await db.run(`DELETE FROM users WHERE id = ?`, [id])
  await db.run(`DELETE FROM settings WHERE key = 'sessionUserId'`)
  await db.save()
}

export async function getOAuthConfig(provider: 'google' | 'microsoft'): Promise<{ clientId: string; clientSecret: string }> {
  const row = db.get<{ client_id: string; client_secret: string }>(`SELECT client_id, client_secret FROM oauth WHERE provider = ?`, [provider])
  return { clientId: row?.client_id ?? '', clientSecret: row?.client_secret ?? '' }
}

export async function saveOAuthConfig(provider: 'google' | 'microsoft', clientId: string, clientSecret: string): Promise<void> {
  await db.run(`INSERT INTO oauth (provider, client_id, client_secret) VALUES (?, ?, ?)
    ON CONFLICT(provider) DO UPDATE SET client_id = excluded.client_id, client_secret = excluded.client_secret`,
    [provider, clientId, clientSecret])
  await db.save()
}