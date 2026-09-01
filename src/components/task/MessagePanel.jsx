import { useState, useEffect, useRef, useCallback } from 'react'
import { getMessages, getUnreadCount, markRead, markAllRead } from '../../services/taskApi'

const fmtAgo = ts => {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60000) return 'Vừa xong'
  if (diff < 3600000) return `${Math.floor(diff / 60000)} phút trước`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} giờ trước`
  if (diff < 604800000) return `${Math.floor(diff / 86400000)} ngày trước`
  const d = new Date(ts)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
}

const TYPE_ICONS = {
  ASSIGNED: '📋',
  PROGRESS_UPDATE: '📊',
  EXTENSION_REQUEST: '⏳',
  EXTENSION_APPROVED: '✅',
  EXTENSION_REJECTED: '❌',
  TASK_COMPLETED: '🎉',
  GENERAL: '💬',
}

export default function MessagePanel({ onNavigateTask }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [unread, setUnread] = useState(0)
  const [loading, setLoading] = useState(false)
  const ref = useRef(null)

  const fetchUnread = useCallback(async () => {
    try {
      const res = await getUnreadCount()
      if (res.data?.code === 900) setUnread(res.data.data || 0)
    } catch {}
  }, [])

  const fetchMessages = useCallback(async () => {
    try {
      setLoading(true)
      const res = await getMessages(0, 30)
      if (res.data?.code === 900) setMessages(res.data.data?.content || [])
    } catch {}
    finally { setLoading(false) }
  }, [])

  // Poll unread count
  useEffect(() => {
    fetchUnread()
    const interval = setInterval(fetchUnread, 30000)
    return () => clearInterval(interval)
  }, [fetchUnread])

  // Load messages when opened
  useEffect(() => { if (open) fetchMessages() }, [open, fetchMessages])

  // Click outside
  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleClick = async msg => {
    if (!msg.isRead) {
      await markRead(msg.id)
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, isRead: true } : m))
      setUnread(u => Math.max(0, u - 1))
    }
    if (msg.taskId && onNavigateTask) {
      onNavigateTask(msg.taskId)
      setOpen(false)
    }
  }

  const handleMarkAll = async () => {
    await markAllRead()
    setMessages(prev => prev.map(m => ({ ...m, isRead: true })))
    setUnread(0)
  }

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-9 h-9 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
        aria-label="Thông báo"
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M10 2a5 5 0 0 0-5 5v3l-1.5 2.5a.5.5 0 0 0 .43.75h12.14a.5.5 0 0 0 .43-.75L15 10V7a5 5 0 0 0-5-5Z" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 14a2 2 0 1 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden animate-fade-in z-50">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-900">Thông báo</h3>
            {unread > 0 && (
              <button onClick={handleMarkAll} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                Đánh dấu tất cả đã đọc
              </button>
            )}
          </div>

          {/* Messages */}
          <div className="max-h-[400px] overflow-y-auto">
            {loading && messages.length === 0 ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : messages.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-gray-400 text-sm">Chưa có thông báo</p>
              </div>
            ) : (
              messages.map(msg => (
                <button
                  key={msg.id}
                  onClick={() => handleClick(msg)}
                  className={`
                    w-full flex items-start gap-3 px-4 py-3 text-left transition-colors
                    ${msg.isRead ? 'hover:bg-gray-50' : 'bg-blue-50/60 hover:bg-blue-50'}
                    border-b border-gray-50 last:border-b-0
                  `}
                >
                  <span className="text-lg shrink-0 mt-0.5">{TYPE_ICONS[msg.type] || '💬'}</span>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm leading-snug ${msg.isRead ? 'text-gray-600' : 'text-gray-900 font-medium'}`}>
                      {msg.content}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1">{fmtAgo(msg.createdAt)}</p>
                  </div>
                  {!msg.isRead && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0 mt-2" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
