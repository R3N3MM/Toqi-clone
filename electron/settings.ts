import type { AiSettings } from './types'
import { db } from './db'

const DEFAULT_SETTINGS: AiSettings = {
  model: '',
  temperature: 0.6,
  language: 'English'
}

export function getAiSettings(): AiSettings {
  const row = db.get<{ value: string }>(`SELECT value FROM settings WHERE key = 'ai'`)
  if (!row) return { ...DEFAULT_SETTINGS }
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(row.value) as Partial<AiSettings>) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function saveAiSettings(settings: AiSettings): Promise<void> {
  await db.run(`INSERT INTO settings (key, value) VALUES ('ai', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [JSON.stringify(settings)])
  await db.save()
}

export function getUiLanguage(): string {
  const row = db.get<{ value: string }>(`SELECT value FROM settings WHERE key = 'uiLang'`)
  return row?.value ?? 'en'
}

export async function saveUiLanguage(lang: string): Promise<void> {
  await db.run(`INSERT INTO settings (key, value) VALUES ('uiLang', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [lang])
  await db.save()
}

export function getThemeMode(): 'light' | 'dark' {
  const row = db.get<{ value: string }>(`SELECT value FROM settings WHERE key = 'uiMode'`)
  return row?.value === 'dark' ? 'dark' : 'light'
}

export async function saveThemeMode(mode: 'light' | 'dark'): Promise<void> {
  await db.run(`INSERT INTO settings (key, value) VALUES ('uiMode', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [mode])
  await db.save()
}

export function getThemeAccent(): string {
  const row = db.get<{ value: string }>(`SELECT value FROM settings WHERE key = 'uiAccent'`)
  return row?.value ?? 'purple'
}

export async function saveThemeAccent(accent: string): Promise<void> {
  await db.run(`INSERT INTO settings (key, value) VALUES ('uiAccent', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [accent])
  await db.save()
}

export function getPrefs(): { location: string; notifications: boolean } {
  const row = db.get<{ value: string }>(`SELECT value FROM settings WHERE key = 'prefs'`)
  if (!row) return { location: '', notifications: true }
  try {
    return { location: '', notifications: true, ...(JSON.parse(row.value) as object) }
  } catch {
    return { location: '', notifications: true }
  }
}

export async function savePrefs(prefs: { location: string; notifications: boolean }): Promise<void> {
  await db.run(`INSERT INTO settings (key, value) VALUES ('prefs', ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [JSON.stringify(prefs)])
  await db.save()
}
