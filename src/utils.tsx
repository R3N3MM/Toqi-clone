import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

const ToastContext = createContext<(msg: string) => void>(() => undefined)

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toast, setToast] = useState<string | null>(null)

  const show = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => setToast(null), 2600)
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && <div className="toast">{toast}</div>}
    </ToastContext.Provider>
  )
}

export function useToast(): (msg: string) => void {
  return useContext(ToastContext)
}

export function useClipboard(): { copy: (text: string) => void; copied: boolean } {
  const [copied, setCopied] = useState(false)
  const copy = useCallback((text: string) => {
    void navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }, [])
  return { copy, copied }
}

// Minimal Markdown renderer (headings, bold, italic, code, lists, blockquote, hr)
export function renderMarkdown(md: string): string {
  let html = md
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const esc = html

  let out = esc
    .replace(/```(\w+)?\n([\s\S]*?)```/g, (_m, _lang, code) => `<pre><code>${code.replace(/\n/g, '<br>')}</code></pre>`)
    .replace(/^###### (.*)$/gm, '<h6>$1</h6>')
    .replace(/^##### (.*)$/gm, '<h5>$1</h5>')
    .replace(/^#### (.*)$/gm, '<h4>$1</h4>')
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/^\s*[-*] (.*)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/^\s*(\d+)\. (.*)$/gm, '<li>$2</li>')
    .replace(/^\s*&gt; (.*)$/gm, '<blockquote>$1</blockquote>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/---/g, '<hr>')
    .replace(/\n\n/g, '<br>')

  return out
}

export function useEffectOnce(effect: () => void | (() => void)): void {
  useEffect(() => {
    const cleanup = effect()
    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
