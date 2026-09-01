import { useState, useRef, useEffect } from 'react'

/**
 * Custom DatePicker — calendar popup, single date or range.
 *
 * Props:
 *   value      — epoch millis (single) or { from, to } (range)
 *   onChange   — called with epoch millis or { from, to }
 *   mode       — 'single' | 'range'  (default 'single')
 *   placeholder
 *   clearable  — show clear button
 *   minDate    — epoch millis
 */

const DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const MONTHS = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
]

const pad = n => String(n).padStart(2, '0')

function startOfDay(epoch) {
  if (!epoch) return null
  const d = new Date(epoch)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function fmtDate(epoch) {
  if (!epoch) return ''
  const d = new Date(epoch)
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`
}

function CalendarGrid({ year, month, selected, rangeFrom, rangeTo, onSelect, minDate, today }) {
  const firstDay = new Date(year, month, 1).getDay()
  const offset = firstDay === 0 ? 6 : firstDay - 1 // Monday = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells = []
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const isSelected = day => {
    if (!day) return false
    const ts = new Date(year, month, day).getTime()
    if (selected && startOfDay(selected) === ts) return true
    if (rangeFrom && startOfDay(rangeFrom) === ts) return true
    if (rangeTo && startOfDay(rangeTo) === ts) return true
    return false
  }

  const isInRange = day => {
    if (!day || !rangeFrom || !rangeTo) return false
    const ts = new Date(year, month, day).getTime()
    return ts > startOfDay(rangeFrom) && ts < startOfDay(rangeTo)
  }

  const isToday = day => {
    if (!day) return false
    return new Date(year, month, day).getTime() === today
  }

  const isDisabled = day => {
    if (!day || !minDate) return false
    return new Date(year, month, day).getTime() < startOfDay(minDate)
  }

  return (
    <div className="grid grid-cols-7 gap-0.5">
      {DAYS.map(d => (
        <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>
      ))}
      {cells.map((day, i) => (
        <button
          key={i}
          type="button"
          disabled={!day || isDisabled(day)}
          onClick={() => day && onSelect(new Date(year, month, day).getTime())}
          className={`
            w-8 h-8 text-xs rounded-lg flex items-center justify-center transition-all
            ${!day ? '' : isDisabled(day) ? 'text-gray-300 cursor-not-allowed' :
              isSelected(day)
                ? 'bg-blue-600 text-white font-bold shadow-sm'
                : isInRange(day)
                  ? 'bg-blue-100 text-blue-700'
                  : isToday(day)
                    ? 'border border-blue-400 text-blue-600 font-semibold'
                    : 'text-gray-700 hover:bg-gray-100'}
          `}
        >
          {day}
        </button>
      ))}
    </div>
  )
}

export default function DatePicker({
  value, onChange, mode = 'single', placeholder = 'Chọn ngày',
  clearable = true, minDate, className = ''
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const now = new Date()
  const todayTs = startOfDay(now.getTime())

  const initYear = value
    ? new Date(typeof value === 'object' ? (value.from || Date.now()) : value).getFullYear()
    : now.getFullYear()
  const initMonth = value
    ? new Date(typeof value === 'object' ? (value.from || Date.now()) : value).getMonth()
    : now.getMonth()

  const [viewYear, setViewYear] = useState(initYear)
  const [viewMonth, setViewMonth] = useState(initMonth)
  const [rangeStep, setRangeStep] = useState(0) // 0=pick from, 1=pick to
  const [tempFrom, setTempFrom] = useState(null)

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const handleSelect = ts => {
    if (mode === 'single') {
      onChange(ts)
      setOpen(false)
    } else {
      if (rangeStep === 0) {
        setTempFrom(ts)
        setRangeStep(1)
      } else {
        const from = Math.min(tempFrom, ts)
        const to = Math.max(tempFrom, ts)
        onChange({ from, to })
        setRangeStep(0)
        setTempFrom(null)
        setOpen(false)
      }
    }
  }

  const display = () => {
    if (mode === 'range' && value && typeof value === 'object') {
      if (value.from && value.to) return `${fmtDate(value.from)} – ${fmtDate(value.to)}`
      if (value.from) return fmtDate(value.from)
    }
    if (mode === 'single' && value) return fmtDate(value)
    return ''
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`
          w-full flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-all
          ${open ? 'border-blue-500 ring-2 ring-blue-500/10' : 'border-gray-200 hover:border-gray-300'}
          ${display() ? 'text-gray-900' : 'text-gray-400'}
          bg-white
        `}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-gray-400">
          <rect x="1" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M1 7h14M5 1v4M11 1v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className="flex-1 text-left truncate">{display() || placeholder}</span>
        {clearable && display() && (
          <span
            onClick={e => { e.stopPropagation(); onChange(mode === 'range' ? { from: null, to: null } : null); setOpen(false) }}
            className="text-gray-400 hover:text-gray-600"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-3 w-[280px] animate-fade-in">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={prevMonth} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-500">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
            <span className="text-sm font-semibold text-gray-800">{MONTHS[viewMonth]} {viewYear}</span>
            <button type="button" onClick={nextMonth} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-500">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          </div>

          {mode === 'range' && rangeStep === 1 && (
            <p className="text-[10px] text-blue-600 text-center mb-1 font-medium">Chọn ngày kết thúc</p>
          )}

          <CalendarGrid
            year={viewYear}
            month={viewMonth}
            selected={mode === 'single' ? value : null}
            rangeFrom={mode === 'range' ? (tempFrom || value?.from) : null}
            rangeTo={mode === 'range' ? (rangeStep === 0 ? value?.to : null) : null}
            onSelect={handleSelect}
            minDate={minDate}
            today={todayTs}
          />

          {/* Today shortcut */}
          <div className="mt-2 flex justify-center">
            <button
              type="button"
              onClick={() => handleSelect(todayTs)}
              className="text-xs text-blue-600 hover:text-blue-700 font-medium"
            >
              Hôm nay
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
