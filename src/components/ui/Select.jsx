import { useState, useRef, useEffect } from 'react'

/**
 * Custom Select dropdown.
 * Props:
 *   value, onChange, options: [{ value, label, icon? }],
 *   placeholder, clearable, searchable, multiple
 */
export default function Select({
  value, onChange, options = [], placeholder = 'Chọn...',
  clearable = false, searchable = false, multiple = false,
  className = '', size = 'md'
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const filtered = options.filter(o =>
    !search || o.label.toLowerCase().includes(search.toLowerCase())
  )

  const selected = multiple
    ? options.filter(o => (value || []).includes(o.value))
    : options.find(o => o.value === value)

  const displayText = multiple
    ? (selected.length ? selected.map(s => s.label).join(', ') : '')
    : (selected ? selected.label : '')

  const handleSelect = opt => {
    if (multiple) {
      const arr = value || []
      const next = arr.includes(opt.value) ? arr.filter(v => v !== opt.value) : [...arr, opt.value]
      onChange(next)
    } else {
      onChange(opt.value)
      setOpen(false)
    }
    setSearch('')
  }

  const py = size === 'sm' ? 'py-1.5' : 'py-2'

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`
          w-full flex items-center gap-2 px-3 ${py} text-sm border rounded-lg transition-all text-left
          ${open ? 'border-blue-500 ring-2 ring-blue-500/10' : 'border-gray-200 hover:border-gray-300'}
          ${displayText ? 'text-gray-900' : 'text-gray-400'}
          bg-white
        `}
      >
        <span className="flex-1 truncate">{displayText || placeholder}</span>
        {clearable && displayText && (
          <span
            onClick={e => { e.stopPropagation(); onChange(multiple ? [] : null); setOpen(false) }}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
        )}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M3 4.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden animate-fade-in">
          {searchable && (
            <div className="p-2 border-b border-gray-100">
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Tìm kiếm..."
                className="w-full px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-400"
                autoFocus
              />
            </div>
          )}
          <div className="max-h-52 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-3 py-2 text-xs text-gray-400">Không tìm thấy</p>
            )}
            {filtered.map(opt => {
              const isActive = multiple
                ? (value || []).includes(opt.value)
                : value === opt.value
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt)}
                  className={`
                    w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors
                    ${isActive ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700 hover:bg-gray-50'}
                  `}
                >
                  {multiple && (
                    <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${isActive ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`}>
                      {isActive && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5l2 2 4-4" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </span>
                  )}
                  {opt.icon && <span>{opt.icon}</span>}
                  <span className="truncate">{opt.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
