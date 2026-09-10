import { useState, useRef, useEffect, useMemo } from 'react'
import { createPortal } from 'react-dom'

const DAYS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const MONTHS = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6',
  'Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12']
const pad = n => String(n).padStart(2, '0')

function startOfDay(epoch) {
  if (!epoch) return null
  const d = new Date(epoch); d.setHours(0,0,0,0); return d.getTime()
}

function fmtDate(epoch, showTime) {
  if (!epoch) return ''
  const d = new Date(epoch)
  const date = `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`
  if (!showTime) return date
  return `${date} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function CalendarGrid({ year, month, selected, rangeFrom, rangeTo, onSelect, minDate, today }) {
  const firstDay = new Date(year, month, 1).getDay()
  const offset = firstDay === 0 ? 6 : firstDay - 1
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells = []
  for (let i = 0; i < offset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const isSel = day => {
    if (!day) return false
    const ts = new Date(year, month, day).getTime()
    if (selected && startOfDay(selected) === ts) return true
    if (rangeFrom && startOfDay(rangeFrom) === ts) return true
    if (rangeTo && startOfDay(rangeTo) === ts) return true
    return false
  }
  const inRange = day => {
    if (!day || !rangeFrom || !rangeTo) return false
    const ts = new Date(year, month, day).getTime()
    return ts > startOfDay(rangeFrom) && ts < startOfDay(rangeTo)
  }
  const isToday = day => day && new Date(year, month, day).getTime() === today
  const isDisabled = day => day && minDate && new Date(year, month, day).getTime() < startOfDay(minDate)

  return (
    <div className="grid grid-cols-7 gap-0.5">
      {DAYS.map(d => <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>)}
      {cells.map((day, i) => (
        <button key={i} type="button" disabled={!day || isDisabled(day)}
          onClick={() => day && onSelect(new Date(year, month, day))}
          className={`w-8 h-8 text-xs rounded-lg flex items-center justify-center transition-all
            ${!day ? '' : isDisabled(day) ? 'text-gray-300 cursor-not-allowed'
              : isSel(day) ? 'bg-blue-600 text-white font-bold shadow-sm'
              : inRange(day) ? 'bg-blue-100 text-blue-700'
              : isToday(day) ? 'border border-blue-400 text-blue-600 font-semibold'
              : 'text-gray-700 hover:bg-gray-100'}`}
        >{day}</button>
      ))}
    </div>
  )
}

function TimePicker({ hour, minute, onChange }) {
  return (
    <div className="flex items-center gap-1.5 justify-center">
      <select value={hour} onChange={e => onChange(+e.target.value, minute)}
        className="w-14 py-1.5 text-center text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-500 bg-white appearance-none">
        {Array.from({length:24},(_,i)=>i).map(h => <option key={h} value={h}>{pad(h)}</option>)}
      </select>
      <span className="text-sm font-bold text-gray-400">:</span>
      <select value={minute} onChange={e => onChange(hour, +e.target.value)}
        className="w-14 py-1.5 text-center text-sm border border-gray-200 rounded-lg outline-none focus:border-blue-500 bg-white appearance-none">
        {[0,5,10,15,20,25,30,35,40,45,50,55].map(m => <option key={m} value={m}>{pad(m)}</option>)}
      </select>
    </div>
  )
}

/**
 * Custom DatePicker with optional time.
 *
 * Props:
 *   value       — epoch millis
 *   onChange     — (epoch) => void
 *   showTime    — include hour:minute (default false)
 *   mode        — 'single' | 'range'
 *   align       — 'left' | 'right' (calendar popup alignment, default 'left')
 *   portal      — render calendar as portal (escapes modal overflow, default false)
 *   placeholder, clearable, minDate, className
 */
export default function DatePicker({
  value, onChange, mode = 'single', showTime = false,
  placeholder = 'Chọn ngày', clearable = true, minDate,
  align = 'left', portal = false, className = ''
}) {
  const [open, setOpen] = useState(false)
  const btnRef = useRef(null)
  const popRef = useRef(null)
  const now = new Date()
  const todayTs = startOfDay(now.getTime())

  const initDate = value ? new Date(typeof value === 'object' ? (value.from || Date.now()) : value) : now
  const [viewYear, setViewYear] = useState(initDate.getFullYear())
  const [viewMonth, setViewMonth] = useState(initDate.getMonth())
  const [hour, setHour] = useState(value ? new Date(value).getHours() : 23)
  const [minute, setMinute] = useState(value ? new Date(value).getMinutes() : 59)
  const [rangeStep, setRangeStep] = useState(0)
  const [tempFrom, setTempFrom] = useState(null)

  // Close on outside click
  useEffect(() => {
    const handler = e => {
      if (btnRef.current?.contains(e.target)) return
      if (popRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Position for portal
  const [pos, setPos] = useState({ top: 0, left: 0 })
  useEffect(() => {
    if (open && portal && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const popW = 296
      let left = align === 'right' ? r.right - popW : r.left
      if (left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8
      if (left < 8) left = 8
      let top = r.bottom + 4
      if (top + 400 > window.innerHeight) top = r.top - 400
      setPos({ top, left })
    }
  }, [open, portal, align])

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y=>y-1) } else setViewMonth(m=>m-1) }
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y=>y+1) } else setViewMonth(m=>m+1) }

  const handleSelect = dateObj => {
    if (mode === 'single') {
      if (showTime) {
        dateObj.setHours(hour, minute, 0, 0)
      } else {
        dateObj.setHours(23, 59, 59, 0)
      }
      onChange(dateObj.getTime())
      if (!showTime) setOpen(false)
    } else {
      if (rangeStep === 0) { setTempFrom(dateObj.getTime()); setRangeStep(1) }
      else {
        const from = Math.min(tempFrom, dateObj.getTime())
        const to = Math.max(tempFrom, dateObj.getTime())
        onChange({ from, to })
        setRangeStep(0); setTempFrom(null); setOpen(false)
      }
    }
  }

  const handleTimeChange = (h, m) => {
    setHour(h); setMinute(m)
    if (value && mode === 'single') {
      const d = new Date(value)
      d.setHours(h, m, 0, 0)
      onChange(d.getTime())
    }
  }

  const display = () => {
    if (mode === 'range' && value && typeof value === 'object') {
      if (value.from && value.to) return `${fmtDate(value.from, false)} – ${fmtDate(value.to, false)}`
      if (value.from) return fmtDate(value.from, false)
    }
    if (mode === 'single' && value) return fmtDate(value, showTime)
    return ''
  }

  const calendarContent = (
    <div ref={popRef}
      className="bg-white border border-gray-200 rounded-2xl shadow-2xl p-3.5 animate-fade-in"
      style={portal ? { position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, width: 296 }
                     : { position: 'absolute', top: '100%', zIndex: 50, width: 296,
                         ...(align === 'right' ? { right: 0 } : { left: 0 }), marginTop: 4 }}
      onClick={e => e.stopPropagation()}
    >
      {/* Month nav */}
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={prevMonth} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-500">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 3L5 7l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
        <span className="text-sm font-semibold text-gray-800">{MONTHS[viewMonth]} {viewYear}</span>
        <button type="button" onClick={nextMonth} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-500">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </button>
      </div>

      {mode === 'range' && rangeStep === 1 && (
        <p className="text-[10px] text-blue-600 text-center mb-1 font-medium">Chọn ngày kết thúc</p>
      )}

      <CalendarGrid year={viewYear} month={viewMonth}
        selected={mode === 'single' ? value : null}
        rangeFrom={mode === 'range' ? (tempFrom || value?.from) : null}
        rangeTo={mode === 'range' ? (rangeStep === 0 ? value?.to : null) : null}
        onSelect={handleSelect} minDate={minDate} today={todayTs} />

      {/* Time picker */}
      {showTime && mode === 'single' && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-[10px] font-semibold text-gray-400 text-center mb-1.5">GIỜ</p>
          <TimePicker hour={hour} minute={minute} onChange={handleTimeChange} />
        </div>
      )}

      {/* Today + confirm */}
      <div className="mt-2.5 flex items-center justify-between">
        <button type="button" onClick={() => handleSelect(new Date())}
          className="text-xs text-blue-600 hover:text-blue-700 font-medium">Hôm nay</button>
        {showTime && (
          <button type="button" onClick={() => setOpen(false)}
            className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg font-medium hover:bg-blue-700">Xong</button>
        )}
      </div>
    </div>
  )

  return (
    <div className={`relative ${className}`}>
      <button ref={btnRef} type="button" onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-sm border rounded-lg transition-all
          ${open ? 'border-blue-500 ring-2 ring-blue-500/10' : 'border-gray-200 hover:border-gray-300'}
          ${display() ? 'text-gray-900' : 'text-gray-400'} bg-white`}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="shrink-0 text-gray-400">
          <rect x="1" y="3" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M1 7h14M5 1v4M11 1v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        <span className="flex-1 text-left truncate">{display() || placeholder}</span>
        {clearable && display() && (
          <span onClick={e => { e.stopPropagation(); onChange(mode === 'range' ? { from: null, to: null } : null); setOpen(false) }}
            className="text-gray-400 hover:text-gray-600">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </span>
        )}
      </button>

      {open && (portal ? createPortal(calendarContent, document.body) : calendarContent)}
    </div>
  )
}