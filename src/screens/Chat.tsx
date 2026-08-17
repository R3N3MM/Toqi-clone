import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ChatMessage } from '../../electron/types'
import { Icon } from '../components/icons'
import { renderMarkdown } from '../utils'

interface ChatProps {
  initialConversationId?: number | null
}

export default function Chat({ initialConversationId = null }: ChatProps): JSX.Element {
  const { t } = useTranslation()
  const [conversationId, setConversationId] = useState<number | null>(initialConversationId)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingText, setStreamingText] = useState('')
  const [toolStatus, setToolStatus] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const streamingRef = useRef('')
  const toolStatusRef = useRef<string | null>(null)

  const loadConversation = useCallback(async (id: number) => {
    const msgs = await window.toqi.conversations.messages(id)
    setMessages(msgs)
    setConversationId(id)
  }, [])

  useEffect(() => {
    if (initialConversationId) void loadConversation(initialConversationId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const offChunk = window.toqi.chat.onChunk((chunk) => {
      streamingRef.current += chunk
      setStreamingText(streamingRef.current)
    })
    const offTool = window.toqi.chat.onTool((tool) => {
      const key = t(`chat.tool.${tool.name}`, { defaultValue: tool.name })
      if (tool.running) {
        toolStatusRef.current = key
        setToolStatus(key)
      } else {
        toolStatusRef.current = null
        setToolStatus(null)
      }
    })
    return () => {
      offChunk()
      offTool()
    }
  }, [t])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [messages, streamingText, isStreaming])

  function newChat(): void {
    setConversationId(null)
    setMessages([])
    setInput('')
    setAttachments([])
    setStreamingText('')
    setError(null)
  }

  function readFiles(files: FileList | File[]): void {
    const imageFiles = Array.from(files).filter((f) => f.type.startsWith('image/'))
    for (const f of imageFiles) {
      const reader = new FileReader()
      reader.onload = () => setAttachments((prev) => [...prev, String(reader.result)])
      reader.readAsDataURL(f)
    }
  }

  async function startCamera(): Promise<void> {
    setCameraError(null)
    setShowCamera(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        void videoRef.current.play()
      }
    } catch {
      setCameraError(t('chat.camera'))
      setShowCamera(false)
    }
  }

  function stopCamera(): void {
    streamRef.current?.getTracks().forEach((tr) => tr.stop())
    streamRef.current = null
    setShowCamera(false)
  }

  function capturePhoto(): void {
    const video = videoRef.current
    if (!video) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(video, 0, 0)
    setAttachments((prev) => [...prev, canvas.toDataURL('image/jpeg', 0.85)])
    stopCamera()
  }

  async function toggleVoice(): Promise<void> {
    interface SpeechRec {
      lang: string
      interimResults: boolean
      onresult: ((e: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
      onend: (() => void) | null
      onerror: (() => void) | null
      start: () => void
      stop: () => void
    }
    type SpeechRecCtor = new () => SpeechRec
    const w = window as unknown as { SpeechRecognition?: SpeechRecCtor; webkitSpeechRecognition?: SpeechRecCtor }
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!Ctor) {
      setError(t('chat.voice'))
      return
    }
    if (listening) {
      setListening(false)
      return
    }
    const rec = new Ctor()
    rec.lang = 'en-US'
    rec.interimResults = true
    setListening(true)
    rec.onresult = (e) => {
      let transcript = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript
      }
      setInput((prev) => prev + transcript)
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => {
      setListening(false)
      setError(t('chat.voice'))
    }
    rec.start()
  }

  async function send(): Promise<void> {
    const text = input.trim()
    if (isStreaming) return
    if (!text && attachments.length === 0) return
    const images = [...attachments]
    setError(null)

    const optimistic: ChatMessage = {
      id: Date.now(),
      conversation_id: conversationId ?? 0,
      role: 'user',
      content: text,
      images,
      created_at: new Date().toISOString()
    }
    setMessages((prev) => [...prev, optimistic])
    setInput('')
    setAttachments([])

    setIsStreaming(true)
    streamingRef.current = ''
    setStreamingText('')
    setToolStatus(null)
    toolStatusRef.current = null

    try {
      const result = await window.toqi.chat.send({ conversationId: conversationId ?? undefined, userText: text, images })
      setConversationId(result.conversationId)
      if (initialConversationId !== result.conversationId) {
        const msgs = await window.toqi.conversations.messages(result.conversationId)
        setMessages(msgs)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : ''
      if (msg.includes('No Ollama model') || msg.includes('model selected') || msg.includes('Ollama')) {
        setError(t('chat.modelError'))
      } else {
        setError(t('chat.streamError'))
      }
    } finally {
      streamingRef.current = ''
      setIsStreaming(false)
      setStreamingText('')
      setToolStatus(null)
      toolStatusRef.current = null
    }
  }

  return (
    <div className="chat-screen">
      <div className="chat-topbar">
        <button className="btn btn-ghost" onClick={newChat}>
          <Icon name="plus" size={16} /> {t('chat.newChat')}
        </button>
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 && !isStreaming && (
          <div className="chat-empty">
            <div className="auth-eyes" aria-hidden="true">
              <span className="eye-arch" />
              <span className="eye-arch" />
            </div>
            <p>{t('chat.empty')}</p>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`bubble ${m.role === 'user' ? 'user' : 'assistant'}`}>
            {m.images && m.images.length > 0 && (
              <div className="bubble-images">
                {m.images.map((src, i) => (
                  <img key={i} src={src} alt="" className="bubble-img" />
                ))}
              </div>
            )}
            {m.content && <div className="bubble-text">{renderMarkdown(m.content)}</div>}
          </div>
        ))}

        {isStreaming && (
          <div className="bubble assistant">
            {streamingText ? (
              <div className="bubble-text">{renderMarkdown(streamingText)}</div>
            ) : (
              <div className="typing-dots">
                <span />
                <span />
                <span />
              </div>
            )}
          </div>
        )}

        {toolStatus && (
          <div className="tool-chip">
            <Icon name="sparkles" size={14} /> {toolStatus}…
          </div>
        )}

        {error && <div className="chat-error">{error}</div>}
      </div>

      {showCamera && (
        <div className="camera-modal">
          <div className="camera-box">
            <video ref={videoRef} className="camera-video" autoPlay muted playsInline />
            <div className="camera-actions">
              <button className="btn btn-primary" onClick={capturePhoto}>
                <Icon name="camera" size={18} />
              </button>
              <button className="btn btn-ghost" onClick={stopCamera}>
                <Icon name="x" size={16} />
              </button>
            </div>
            {cameraError && <p className="auth-error">{cameraError}</p>}
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files) readFiles(e.target.files)
          e.target.value = ''
        }}
      />

      {attachments.length > 0 && (
        <div className="attach-row">
          {attachments.map((src, i) => (
            <div key={i} className="attach-thumb">
              <img src={src} alt="" />
              <button className="attach-remove" onClick={() => setAttachments((prev) => prev.filter((_, j) => j !== i))}>
                <Icon name="x" size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="composer">
        <button className="icon-btn" title={t('chat.camera')} onClick={() => void startCamera()}>
          <Icon name="camera" size={20} />
        </button>
        <button className="icon-btn" title={t('chat.gallery')} onClick={() => fileInputRef.current?.click()}>
          <Icon name="image" size={20} />
        </button>
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('chat.placeholder')}
          rows={1}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
        />
        <button
          className={`icon-btn ${listening ? 'recording' : ''}`}
          title={t('chat.voice')}
          onClick={() => void toggleVoice()}
        >
          <Icon name="mic" size={20} />
        </button>
        <button className="btn btn-primary send-btn" onClick={() => void send()} disabled={isStreaming}>
          <Icon name="send" size={18} />
        </button>
      </div>
      {listening && <div className="listening-hint">{t('chat.listening')}</div>}
    </div>
  )
}