import { useState, useEffect, useCallback, createContext, useContext, useRef } from 'react'

/**
 * Custom toast system — stacked, auto-dismiss, top-right.
 *
 * Usage:
 *   import { ToastProvider, useToast } from './components/ui/Toast'
 *
 *   // Wrap app:
 *   <ToastProvider><App /></ToastProvider>
 *
 *   // In component:
 *   const toast = useToast()
 *   toast.success('Saved!')
 *   toast.error('Failed')
 *   toast.info('Note...')
 */

const ToastContext = createContext(null)
let idCounter = 0

const ICONS = {
  success: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="#10b981" />
      <path d="M6 10.5l2.5 2.5 5.5-5.5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  error: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="#ef4444" />
      <path d="M7 7l6 6M13 7l-6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  info: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="#3b82f6" />
      <path d="M10 9v5M10 6.5v.01" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  warning: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="10" fill="#f59e0b" />
      <path d="M10 6v5M10 13.5v.01" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
}

const COLORS = {
  success: 'border-emerald-200 bg-emerald-50',
  error:   'border-red-200 bg-red-50',
  info:    'border-blue-200 bg-blue-50',
  warning: 'border-amber-200 bg-amber-50',
}

function ToastItem({ toast: t, onDismiss }) {
  const [exiting, setExiting] = useState(false)
  const timerRef = useRef(null)

  const dismiss = useCallback(() => {
    setExiting(true)
    setTimeout(() => onDismiss(t.id), 300)
  }, [t.id, onDismiss])

  useEffect(() => {
    if (t.duration > 0) {
      timerRef.current = setTimeout(dismiss, t.duration)
    }
    return () => clearTimeout(timerRef.current)
  }, [t.duration, dismiss])

  return (
    <div
      className={`
        flex items-start gap-3 w-80 max-w-[calc(100vw-2rem)] px-4 py-3 rounded-xl border shadow-lg
        transition-all duration-300 cursor-pointer select-none
        ${COLORS[t.type] || COLORS.info}
        ${exiting ? 'opacity-0 translate-x-8' : 'opacity-100 translate-x-0'}
      `}
      onClick={dismiss}
      role="alert"
    >
      <span className="shrink-0 mt-0.5">{ICONS[t.type] || ICONS.info}</span>
      <p className="text-sm text-gray-800 leading-snug flex-1 break-words">{t.message}</p>
      <button
        onClick={e => { e.stopPropagation(); dismiss() }}
        className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
        aria-label="Đóng"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((type, message, duration = 4000) => {
    const id = ++idCounter
    setToasts(prev => [{ id, type, message, duration }, ...prev].slice(0, 6))
    return id
  }, [])

  const removeToast = useCallback(id => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const api = {
    success: (msg, dur) => addToast('success', msg, dur),
    error:   (msg, dur) => addToast('error', msg, dur ?? 6000),
    info:    (msg, dur) => addToast('info', msg, dur),
    warning: (msg, dur) => addToast('warning', msg, dur),
  }

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* Toast container — top-right, stacked */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto animate-slide-in-right">
            <ToastItem toast={t} onDismiss={removeToast} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}
