import { app } from 'electron'
import { promises as fs } from 'fs'
import path from 'path'
import pdfParse from 'pdf-parse'
import { createCanvas, type Canvas } from '@napi-rs/canvas'
import { createWorker } from 'tesseract.js'
import type { NoteRecord } from './types'
import { db } from './db'
import { generateStreaming, humanSystem } from './ollama'

interface PdfPage {
  pageNumber: number
  text: string
}

interface NodeCanvasFactory {
  create(width: number, height: number): { canvas: Canvas; context: CanvasRenderingContext2D }
  reset(c: { canvas: Canvas; context: CanvasRenderingContext2D }, width: number, height: number): void
  destroy(c: { canvas: Canvas; context: CanvasRenderingContext2D }): void
}

class NapiCanvasFactory implements NodeCanvasFactory {
  // pdf.js v6 instantiates this with `new CanvasFactory({ ownerDocument, enableHWA })`
  constructor(_opts?: { ownerDocument?: unknown; enableHWA?: boolean }) {}
  create(width: number, height: number) {
    const canvas = createCanvas(width, height)
    return { canvas, context: canvas.getContext('2d') as unknown as CanvasRenderingContext2D }
  }
  reset(c: { canvas: Canvas; context: CanvasRenderingContext2D }, width: number, height: number) {
    c.canvas.width = width
    c.canvas.height = height
  }
  destroy(c: { canvas: Canvas; context: CanvasRenderingContext2D }) {
    c.canvas.width = 0
    c.canvas.height = 0
    c.canvas = null as unknown as Canvas
    c.context = null as unknown as CanvasRenderingContext2D
  }
}

const TEXT_CHARS_PER_PAGE = 100

export interface ExtractionResult {
  pages: PdfPage[]
  mode: 'text' | 'ocr'
  totalChars: number
}

export interface NoteProgress {
  chunk: number
  total: number
  text: string
}

export function notesDir(): string {
  return path.join(app.getPath('userData'), 'notes')
}

// Resolve an incoming path against notesDir() and reject anything that escapes
// it. All files read from or written by the notes feature (generated .md files
// and staged PDF imports) live under this directory.
export function confineToNotesDir(filePath: string): string {
  const dir = path.resolve(notesDir())
  const resolved = path.resolve(dir, filePath)
  const rel = path.relative(dir, resolved)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('Path is outside the notes directory.')
  }
  return resolved
}

export async function extractPdf(filePath: string): Promise<ExtractionResult> {
  const confined = confineToNotesDir(filePath)
  const buffer = await fs.readFile(confined)
  const parsed = await pdfParse(buffer)

  const pages: PdfPage[] = (parsed.text || '')
    .split(/\f/)
    .map((text, i) => ({ pageNumber: i + 1, text: text.trim() }))
    .filter((p) => p.text.length > 0)

  const textChars = pages.reduce((sum, p) => sum + p.text.length, 0)
  const charsPerPage = pages.length ? textChars / pages.length : 0

  if (charsPerPage >= TEXT_CHARS_PER_PAGE) {
    return { pages, mode: 'text', totalChars: textChars }
  }

  // Scanned: render pages and OCR them
  const { getDocument } = (await import('pdfjs-dist/legacy/build/pdf.mjs')) as typeof import('pdfjs-dist/legacy/build/pdf.mjs')
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    CanvasFactory: NapiCanvasFactory,
    useSystemFonts: true,
    disableFontFace: true,
    useWorkerFetch: false
  })
  const pdf = await loadingTask.promise

  const worker = await createWorker(
    ['eng', 'ara'].filter((l) => languageAvailable(l)),
    undefined,
    { langPath: await resolveLangPath() }
  )

  const ocrPages: PdfPage[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = createCanvas(viewport.width, viewport.height)
    const context = canvas.getContext('2d') as unknown as CanvasRenderingContext2D
    await page
      .render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: context,
        viewport
      })
      .promise
    const png = canvas.toBuffer('image/png')
    const { data } = await worker.recognize(png)
    ocrPages.push({ pageNumber: i, text: (data.text || '').trim() })
  }
  await worker.terminate()
  await loadingTask.destroy()

  const totalChars = ocrPages.reduce((s, p) => s + p.text.length, 0)
  return { pages: ocrPages, mode: 'ocr', totalChars }
}

function languageAvailable(lang: string): boolean {
  return ['eng', 'ara'].includes(lang)
}

async function resolveLangPath(): Promise<string> {
  const local = path.join(app.getPath('userData'), 'tessdata')
  const bundled = path.join(app.getAppPath(), 'assets', 'tessdata')
  try {
    const bundledFiles = await fs.readdir(bundled)
    if (bundledFiles.length > 0) {
      await fs.mkdir(local, { recursive: true })
      for (const f of bundledFiles) {
        const target = path.join(local, f)
        try {
          await fs.access(target)
        } catch {
          await fs.copyFile(path.join(bundled, f), target)
        }
      }
    }
  } catch {
    // bundled tessdata not present; rely on tesseract CDN
  }
  try {
    await fs.access(path.join(local, 'eng.traineddata.gz'))
    return local
  } catch {
    return ''
  }
}

function chunkText(pages: PdfPage[], maxChars: number): string[] {
  const full = pages
    .map((p) => `[Page ${p.pageNumber}]\n${p.text}`)
    .join('\n\n')
    .trim()
  if (!full) return []
  const chunks: string[] = []
  let current = ''
  for (const line of full.split('\n')) {
    if (current.length + line.length > maxChars && current) {
      chunks.push(current)
      current = line
    } else {
      current += (current ? '\n' : '') + line
    }
  }
  if (current.trim()) chunks.push(current)
  return chunks
}

export async function generateNotes(opts: {
  filePath: string
  model: string
  language: string
  maxCharsPerChunk?: number
  onProgress?: (p: NoteProgress) => void
}): Promise<{ markdown: string; path: string; chunks: number; mode: string }> {
  const maxChars = opts.maxCharsPerChunk ?? 5000
  const base = path.basename(opts.filePath, path.extname(opts.filePath))
  const title = base.replace(/[-_]+/g, ' ')

  const extraction = await extractPdf(opts.filePath)
  const chunks = chunkText(extraction.pages, maxChars)
  if (chunks.length === 0) throw new Error('No extractable text found in the PDF.')

  const total = chunks.length
  let markdown = `# ${title}\n\n> Generated study notes · ${extraction.mode === 'ocr' ? 'OCR' : 'text'} extraction\n\n`

  for (let i = 0; i < total; i++) {
    const prompt = `This is chunk ${i + 1} of ${total} of the module "${title}". Convert this material into high-quality study notes in ${opts.language}. Focus on this chunk but make it standalone enough to be useful.`

    const result = await generateStreaming(
      {
        model: opts.model,
        prompt,
        context: chunks[i],
        system: humanSystem('notes'),
        temperature: 0.3
      },
      () => undefined
    )
    markdown += result.text + '\n\n---\n\n'
    if (opts.onProgress) opts.onProgress({ chunk: i + 1, total, text: result.text })
  }

  const outDir = notesDir()
  await fs.mkdir(outDir, { recursive: true })
  const safeBase = base.replace(/[^a-zA-Z0-9 _-]/g, '').trim().replace(/\s+/g, '_') || 'notes'
  const outPath = path.join(outDir, `${safeBase}_notes_${Date.now()}.md`)
  await fs.writeFile(outPath, markdown, 'utf-8')

  await db.run(
    `INSERT INTO notes (filename, title, created_at, size_bytes, chunk_count, path, preview)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      base,
      title,
      new Date().toISOString(),
      Buffer.byteLength(markdown, 'utf-8'),
      total,
      outPath,
      markdown.slice(0, 300)
    ]
  )
  await db.save()

  return { markdown, path: outPath, chunks: total, mode: extraction.mode }
}

export function listNotes(): NoteRecord[] {
  const rows = db.all<{
    id: number
    filename: string
    title: string
    created_at: string
    size_bytes: number
    chunk_count: number
    path: string
    preview: string
  }>('SELECT * FROM notes ORDER BY id DESC')
  return rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    title: r.title,
    createdAt: r.created_at,
    sizeBytes: r.size_bytes,
    chunkCount: r.chunk_count,
    path: r.path,
    preview: r.preview
  }))
}

export async function readNoteFile(filePath: string): Promise<string> {
  const confined = confineToNotesDir(filePath)
  return fs.readFile(confined, 'utf-8')
}

export async function deleteNote(id: number, filePath: string): Promise<void> {
  const confined = confineToNotesDir(filePath)
  await db.run('DELETE FROM notes WHERE id = ?', [id])
  await db.save()
  await fs.unlink(confined).catch(() => undefined)
}
