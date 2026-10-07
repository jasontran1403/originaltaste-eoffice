import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import ConfirmModal from '../components/common/ConfirmModal'
import DarkModeToggle from '../components/common/DarkModeToggle'
import useDarkMode from '../hooks/useDarkMode'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:9009'

const STORAGE_KEY_ACCOUNT = 'mt5_selected_account'

/* ================================================================
   DATE HELPERS
   ================================================================ */
const todayLocal = () => {
  const d = new Date()
  return { y: d.getFullYear(), m: d.getMonth(), d: d.getDate() }
}
const dateKey = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return { y, m: m - 1, d } }
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate()
const dow0 = (y, m) => new Date(y, m, 1).getDay()
const keyToDate = (k) => { const { y, m, d } = parseKey(k); return new Date(y, m, d) }
const isBefore = (a, b) => keyToDate(a) < keyToDate(b)
const isAfter = (a, b) => keyToDate(a) > keyToDate(b)

/* ================================================================
   FORMAT HELPERS
   ================================================================ */
const fmtVN = (v, d = 2) => {
  if (v == null || isNaN(Number(v))) return '—'
  return new Intl.NumberFormat('vi-VN', { minimumFractionDigits: d, maximumFractionDigits: d }).format(Number(v))
}
const fmtPrice = (v) => {
  if (v == null || isNaN(Number(v))) return '—'
  const s = String(v); const dec = s.includes('.') ? s.split('.')[1].length : 2
  return fmtVN(v, Math.min(dec, 5))
}
const fmtTime = (iso) => {
  if (!iso) return '—'
  const s = String(iso).replace(' ', 'T')
  let m = s.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) m = s.match(/(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (!m) return '—'
  const hh = m[1], mm = m[2], ss = m[3] ?? '00'
  return `${hh}:${mm}:${ss}`
}
const rawDateKey = (iso) => {
  if (!iso) return null
  const s = String(iso).replace(' ', 'T')
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

const calcNet = (t) => Number(t.profit || 0) + Number(t.commission || 0) + Number(t.swap || 0) + Number(t.fee || 0)
const profitSign = (v) => v > 0.001 ? '+' : ''
const profitClass = (v) => v > 0.001 ? 'text-emerald-600 dark:text-emerald-400' : v < -0.001 ? 'text-rose-500 dark:text-rose-400' : 'text-gray-400 dark:text-gray-500'

/* ================================================================
   PULSE
   ================================================================ */
function useValuePulse(value) {
  const prev = useRef(value); const [s, setS] = useState({ key: 0, dir: null })
  useEffect(() => {
    const p = prev.current; if (p === value) return
    if (typeof value === 'number' && typeof p === 'number' && Math.abs(value - p) < 1e-9) return
    const dir = typeof value === 'number' && typeof p === 'number' ? (value > p ? 'up' : 'down') : null
    prev.current = value; setS(x => ({ key: x.key + 1, dir }))
  }, [value]); return s
}
function AnimatedValue({ value, className = '', pulseKey, direction }) {
  const [pulse, setPulse] = useState(false); const first = useRef(true)
  useEffect(() => { if (first.current) { first.current = false; return } setPulse(true); const t = setTimeout(() => setPulse(false), 700); return () => clearTimeout(t) }, [pulseKey])
  const dc = pulse ? (direction === 'up' ? 'val-up' : direction === 'down' ? 'val-down' : 'val-pulse') : ''
  return <span className={`tabular-nums font-bold ${className} ${dc}`}>{value}</span>
}

/* ================================================================
   AVOIDING NEWS — countdown badge
   ================================================================ */
// Backend trả ISO không timezone, hiểu là UTC (giống NewsPage)
const parseAsUTC = (iso) => {
  if (!iso) return null
  const s = String(iso).trim().replace(' ', 'T')
  const hasTZ = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s)
  const d = new Date(hasTZ ? s : s + 'Z')
  return isNaN(d.getTime()) ? null : d
}
const fmtCountdown = (ms) => {
  if (ms == null || ms <= 0) return '00:00'
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(ss)}` : `${pad(m)}:${pad(ss)}`
}
function AvoidingNewsBadge({ title, until }) {
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick(x => x + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const target = parseAsUTC(until)
  const remain = target ? target.getTime() - Date.now() : null
  // Nếu đã qua giờ, không hiển thị (BE auto-expire ở sync kế)
  if (remain != null && remain <= 0) return null
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-700 bg-rose-50 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 text-xs font-semibold shadow-sm">
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
      </span>
      <span>⛈ Đang tránh bão</span>
      {title && (
        <>
          <span className="text-rose-400 dark:text-rose-500">·</span>
          <span className="truncate max-w-[16rem]" title={title}>Tin: <b>{title}</b></span>
        </>
      )}
      {remain != null && (
        <>
          <span className="text-rose-400 dark:text-rose-500">·</span>
          <span>Còn <b className="tabular-nums">{fmtCountdown(remain)}</b></span>
        </>
      )}
    </div>
  )
}

/* ================================================================
   STATE BADGE
   ================================================================ */
const STATE_META = {
  RUNNING: { label: 'ĐANG CHẠY', dot: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/30', border: 'border-emerald-200 dark:border-emerald-700', pulse: true },
  PAUSED: { label: 'TẠM DỪNG', dot: 'bg-amber-400', text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30', border: 'border-amber-200 dark:border-amber-700', pulse: false },
  STOPPING: { label: 'ĐÃ TẮT', dot: 'bg-rose-500', text: 'text-rose-700 dark:text-rose-400', bg: 'bg-rose-50 dark:bg-rose-900/30', border: 'border-rose-200 dark:border-rose-700', pulse: true },
}
function StateBadge({ state }) {
  const m = STATE_META[state] || STATE_META.PAUSED
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${m.text} ${m.bg} ${m.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot} ${m.pulse ? 'animate-pulse' : ''}`} />
      {m.label}
    </span>
  )
}

/* ================================================================
   DATE RANGE PICKER
   ================================================================ */
const MONTHS_VI = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12']
const DAYS_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
function CalendarMonth({ year, month, startKey, endKey, hoverKey, onDayClick, onDayHover, todayKey }) {
  const days = daysInMonth(year, month)
  const startDow = dow0(year, month)
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(d)
  return (
    <div className="select-none">
      <div className="text-center text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">{MONTHS_VI[month]} {year}</div>
      <div className="grid grid-cols-7 mb-1">
        {DAYS_VI.map(d => <div key={d} className="text-center text-[10px] font-medium text-gray-400 dark:text-gray-500 py-0.5">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((d, i) => {
          if (!d) return <div key={`b${i}`} />
          const k = dateKey(year, month, d)
          const isToday = k === todayKey
          const isStart = k === startKey
          const isEnd = k === endKey
          const isEdge = isStart || isEnd
          const inRange = startKey && endKey && !isBefore(k, startKey) && !isAfter(k, endKey)
          const inHover = startKey && !endKey && hoverKey && !isBefore(k, startKey) && !isAfter(k, hoverKey)
          return (
            <button key={k} onClick={() => onDayClick(k)} onMouseEnter={() => onDayHover(k)}
              className={`relative h-8 w-full text-xs rounded-md font-medium transition-colors
                ${isEdge ? 'bg-violet-600 text-white z-10' : ''}
                ${!isEdge && (inRange || inHover) ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300' : ''}
                ${!isEdge && !inRange && !inHover ? 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700' : ''}
                ${isToday && !isEdge ? 'ring-1 ring-violet-400' : ''}`}>{d}</button>
          )
        })}
      </div>
    </div>
  )
}
function DateRangePicker({ startKey, endKey, onChange }) {
  const today = todayLocal()
  const todayKey = dateKey(today.y, today.m, today.d)
  const [leftYear, setLeftYear] = useState(today.y)
  const [leftMonth, setLeftMonth] = useState(today.m)
  const [hoverKey, setHoverKey] = useState(null)
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const rightYear = leftMonth === 11 ? leftYear + 1 : leftYear
  const rightMonth = leftMonth === 11 ? 0 : leftMonth + 1
  const prevMonth = () => { if (leftMonth === 0) { setLeftYear(y => y - 1); setLeftMonth(11) } else setLeftMonth(m => m - 1) }
  const nextMonth = () => { if (leftMonth === 11) { setLeftYear(y => y + 1); setLeftMonth(0) } else setLeftMonth(m => m + 1) }
  const handleDayClick = (k) => {
    if (!startKey || (startKey && endKey)) onChange(k, null)
    else { if (isBefore(k, startKey)) onChange(k, startKey); else onChange(startKey, k); setOpen(false) }
  }
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler); return () => document.removeEventListener('mousedown', handler)
  }, [open])
  const fmtDisplay = (k) => { if (!k) return ''; const { y, m, d } = parseKey(k); return `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}` }
  const label = startKey && endKey ? (startKey === endKey ? fmtDisplay(startKey) : `${fmtDisplay(startKey)} – ${fmtDisplay(endKey)}`) : startKey ? `${fmtDisplay(startKey)} – ...` : 'Chọn ngày'
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 text-xs font-medium text-gray-700 dark:text-gray-200 shadow-sm transition-colors whitespace-nowrap">
        <svg className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span>{label}</span>
      </button>
      {open && (
        <>
          {/* Backdrop mờ chỉ hiện trên mobile để nhấn ngoài đóng picker */}
          <div className="fixed inset-0 z-40 bg-black/30 md:hidden" onClick={() => setOpen(false)} />
        <div
          className="
            fixed left-1/2 -translate-x-1/2 top-20 w-[calc(100vw-2rem)] max-w-sm
            md:absolute md:left-auto md:translate-x-0 md:right-0 md:top-full md:mt-2 md:w-auto md:max-w-none md:min-w-[560px]
            z-50 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-4
          "
        >
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400">◀</button>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400">▶</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <CalendarMonth year={leftYear} month={leftMonth} startKey={startKey} endKey={endKey} hoverKey={hoverKey} todayKey={todayKey} onDayClick={handleDayClick} onDayHover={setHoverKey} />
            <div className="hidden md:block">
              <CalendarMonth year={rightYear} month={rightMonth} startKey={startKey} endKey={endKey} hoverKey={hoverKey} todayKey={todayKey} onDayClick={handleDayClick} onDayHover={setHoverKey} />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
            {[
              { label: 'Hôm nay', fn: () => { const k = dateKey(today.y, today.m, today.d); onChange(k, k); setOpen(false) } },
              { label: '7 ngày', fn: () => { const from = new Date(Date.now() - 6 * 86400000); onChange(dateKey(from.getFullYear(), from.getMonth(), from.getDate()), dateKey(today.y, today.m, today.d)); setOpen(false) } },
              { label: '30 ngày', fn: () => { const from = new Date(Date.now() - 29 * 86400000); onChange(dateKey(from.getFullYear(), from.getMonth(), from.getDate()), dateKey(today.y, today.m, today.d)); setOpen(false) } },
              { label: 'Tháng này', fn: () => { onChange(dateKey(today.y, today.m, 1), dateKey(today.y, today.m, today.d)); setOpen(false) } },
            ].map(({ label, fn }) => (
              <button key={label} onClick={fn} className="px-2.5 py-1 text-[11px] rounded-md bg-gray-100 dark:bg-gray-700 hover:bg-violet-100 dark:hover:bg-violet-900/50 hover:text-violet-700 dark:hover:text-violet-300 text-gray-600 dark:text-gray-300 font-medium">{label}</button>
            ))}
          </div>
        </div>
        </>
      )}
    </div>
  )
}

/* ================================================================
   LOT MODAL
   ================================================================ */
const LOT_MIN = 0.01

function normalizeLotInput(raw) {
  if (raw == null) return { text: '', number: null }
  let s = String(raw).trim()
  s = s.replace(/[^\d.,]/g, '')
  const firstSep = s.search(/[.,]/)
  if (firstSep >= 0) {
    const sep = s[firstSep]
    const head = s.slice(0, firstSep)
    const tail = s.slice(firstSep + 1).replace(/[.,]/g, '')
    s = head + sep + tail.slice(0, 2)
  }
  const forParse = s.replace(',', '.')
  const num = s === '' || s === '.' || s === ',' ? null : Number(forParse)
  return { text: s, number: isNaN(num) ? null : num }
}

function LotEditModal({ open, current, canEdit, saving, error, onClose, onSave }) {
  const [text, setText] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const init = current && current > 0 ? Number(current).toFixed(2).replace(/\.?0+$/, '') : ''
    setText(init || String(current ?? ''))
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus()
        inputRef.current.select()
      }
    }, 50)
  }, [open, current])

  if (!open) return null

  const { text: shownText, number } = normalizeLotInput(text)
  const invalid = number == null || number < LOT_MIN
  const belowMin = number != null && number < LOT_MIN
  const errMsg = error || (text && belowMin ? `Lot tối thiểu là ${LOT_MIN}` : null)

  const handleChange = (e) => {
    const { text: cleaned } = normalizeLotInput(e.target.value)
    setText(cleaned)
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" onClick={saving ? undefined : onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-5">
          <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Sửa lot</h3>
          {!canEdit ? (
            <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">Bot đang <b>CHẠY</b> — hãy ngưng hoặc tắt bot trước khi sửa lot.</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Nhập lot mới. Tối thiểu <code>{LOT_MIN}</code>, tối đa 2 số sau dấu thập phân. Dùng dấu <code>.</code> hoặc <code>,</code> đều được.
              </p>
              <input
                ref={inputRef}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={shownText}
                onChange={handleChange}
                onFocus={e => e.target.select()}
                onClick={e => e.target.select()}
                placeholder="0.01"
                className={`mt-3 w-full h-11 px-3 rounded-lg border text-base tabular-nums bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2
                  ${invalid && text ? 'border-rose-300 dark:border-rose-500 focus:ring-rose-200' : 'border-gray-300 dark:border-gray-600 focus:ring-violet-200'}`}
              />
              {errMsg && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{errMsg}</p>}
            </>
          )}
        </div>
        <div className="flex gap-2 p-4 pt-0">
          <button onClick={onClose} disabled={saving} className="flex-1 h-11 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-semibold text-gray-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50">Hủy</button>
          <button onClick={() => onSave(number)} disabled={saving || invalid || !canEdit}
            className="flex-1 h-11 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold disabled:opacity-50">
            {saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ================================================================
   STOP MODAL
   ================================================================ */
function StopPasscodeModal({ open, saving, error, onClose, onConfirm }) {
  const [pass, setPass] = useState('')
  useEffect(() => { if (open) setPass('') }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" onClick={saving ? undefined : onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-white dark:bg-gray-800 rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-lg bg-rose-100 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400">⚠</div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">Tắt bot</h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Bot sẽ chuyển sang trạng thái TẮT, không mở lệnh mới và sẽ <b>đóng hết lệnh đang mở</b>. Nhập passcode để xác nhận.</p>
            </div>
          </div>
          <input type="password" value={pass} autoFocus
            onChange={e => setPass(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && pass) onConfirm(pass) }}
            placeholder="Passcode"
            className="mt-4 w-full h-11 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-base tracking-widest focus:outline-none focus:ring-2 focus:ring-rose-200" />
          {error && <p className="mt-2 text-sm text-rose-600 dark:text-rose-400">{error}</p>}
        </div>
        <div className="flex gap-2 p-4 pt-0">
          <button onClick={onClose} disabled={saving} className="flex-1 h-11 rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm font-semibold text-gray-600 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50">Hủy</button>
          <button onClick={() => onConfirm(pass)} disabled={saving || !pass}
            className="flex-1 h-11 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-sm font-semibold disabled:opacity-50">
            {saving ? 'Đang tắt...' : 'Xác nhận tắt'}
          </button>
        </div>
      </div>
    </div>
  )
}

/* ================================================================
   ROW COMPONENTS
   ================================================================ */
function TableHead({ cols }) {
  return (
    <thead className="sticky top-0 z-10 bg-white dark:bg-gray-800">
      <tr className="border-b border-gray-100 dark:border-gray-700">
        {cols.map((c, i) => {
          const label = typeof c === 'string' ? c : c.label
          const hideM = typeof c === 'object' && c.hideOnMobile
          return (
            <th key={label}
              className={`px-3 py-2 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider whitespace-nowrap
                ${i >= 3 ? 'text-right' : 'text-left'} ${hideM ? 'hidden md:table-cell' : ''}`}>{label}</th>
          )
        })}
      </tr>
    </thead>
  )
}

function OpenRow({ pos, isNew }) {
  const pl = Number(pos.profit || 0)
  return (
    <tr className={`border-b border-gray-100 dark:border-gray-700 ${isNew ? 'row-enter' : 'hover:bg-blue-50/40 dark:hover:bg-blue-900/20'}`}>
      <td className="px-3 py-2.5 text-[11px] text-gray-400 dark:text-gray-500 tabular-nums font-mono">#{pos.ticket}</td>
      <td className="px-3 py-2.5 hidden md:table-cell">
        <span className={`text-xs font-bold ${pos.direction === 'BUY' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>{pos.direction}</span>
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-700 dark:text-gray-200 font-medium">{pos.symbol || '—'}</td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-gray-700 dark:text-gray-200">{fmtVN(pos.volume, 2)}</td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-gray-600 dark:text-gray-300">{fmtPrice(pos.openPrice)}</td>
      <td className={`px-3 py-2.5 text-right text-xs tabular-nums font-semibold ${profitClass(pl)}`}>{`${profitSign(pl)}${fmtVN(pl)}`}</td>
      <td className="px-3 py-2.5 text-right text-xs text-gray-400 dark:text-gray-500 tabular-nums hidden md:table-cell">{fmtTime(pos.openTime)}</td>
    </tr>
  )
}

function ClosedRow({ trade: t }) {
  const dir = t.direction === 'BUY'
  const net = calcNet(t)
  return (
    <tr className="border-b border-gray-100 dark:border-gray-700 hover:bg-amber-50/40 dark:hover:bg-amber-900/20">
      <td className="px-3 py-2.5 text-[11px] text-gray-400 dark:text-gray-500 tabular-nums font-mono">#{t.ticket}</td>
      <td className="px-3 py-2.5 hidden md:table-cell">
        <span className={`text-xs font-bold ${dir ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>{t.direction}</span>
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-700 dark:text-gray-200 font-medium">{t.symbol || '—'}</td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-gray-700 dark:text-gray-200">{fmtVN(t.volume, 2)}</td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-gray-500 dark:text-gray-400 hidden md:table-cell">{fmtPrice(t.openPrice)}</td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-gray-500 dark:text-gray-400">{fmtPrice(t.closePrice)}</td>
      <td className={`px-3 py-2.5 text-right text-xs tabular-nums font-semibold ${profitClass(net)}`}>{`${profitSign(net)}${fmtVN(net)}`}</td>
      <td className="px-3 py-2.5 text-right text-xs text-gray-400 dark:text-gray-500 tabular-nums hidden md:table-cell">{fmtTime(t.closeTime)}</td>
    </tr>
  )
}

/* ================================================================
   MAIN
   ================================================================ */
export default function ExnessPage() {
  const [dark, toggleDark] = useDarkMode()

  const [accounts, setAccounts] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [account, setAccount] = useState(null)
  const [closedList, setClosedList] = useState([])
  const [closedTotals, setClosedTotals] = useState({ lot: 0, profit: 0 })
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [connected, setConnected] = useState(false)
  const [toast, setToast] = useState(null)

  const [confirmAction, setConfirmAction] = useState(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [lotOpen, setLotOpen] = useState(false)
  const [lotSaving, setLotSaving] = useState(false)
  const [lotError, setLotError] = useState(null)
  const [stopOpen, setStopOpen] = useState(false)
  const [stopSaving, setStopSaving] = useState(false)
  const [stopError, setStopError] = useState(null)

  const [booting, setBooting] = useState(true)

  const initToday = () => { const t = todayLocal(); return dateKey(t.y, t.m, t.d) }
  const [dateStart, setDateStart] = useState(initToday)
  const [dateEnd, setDateEnd] = useState(initToday)

  const clientRef = useRef(null)

  const showToast = useCallback((msg, ms = 3500) => {
    setToast(msg); setTimeout(() => setToast(null), ms)
  }, [])

  const pickAccountId = useCallback((items, prev) => {
    if (!items || items.length === 0) return null
    if (prev && items.some(a => a.id === prev)) return prev
    if (!prev) {
      const saved = Number(localStorage.getItem(STORAGE_KEY_ACCOUNT))
      if (saved && items.some(a => a.id === saved)) return saved
    }
    const gold1 = items.find(a => (a.name || '').trim().toLowerCase() === 'gold 1')
    if (gold1) return gold1.id
    return items[0].id
  }, [])

  const refreshAccounts = useCallback(() => {
    return fetch(`${BASE}/api/public/mt5-bot/accounts`)
      .then(r => r.json())
      .then(d => {
        const items = d.items || []
        setAccounts(items)
        setSelectedId(prev => pickAccountId(items, prev))
      })
      .catch(console.error)
      .finally(() => setBooting(false))
  }, [pickAccountId])

  useEffect(() => {
    refreshAccounts()
    const t = setInterval(refreshAccounts, 30_000)
    return () => clearInterval(t)
  }, [refreshAccounts])

  useEffect(() => {
    if (selectedId != null) {
      localStorage.setItem(STORAGE_KEY_ACCOUNT, String(selectedId))
    }
  }, [selectedId])

  const refreshAccount = useCallback(async (id) => {
    if (!id) return
    try {
      const r = await fetch(`${BASE}/api/public/mt5-bot/accounts/${id}`)
      const d = await r.json()
      if (d.success) setAccount(d.account)
    } catch (e) { console.error(e) }
  }, [])
  useEffect(() => { if (selectedId) refreshAccount(selectedId) }, [selectedId, refreshAccount])

  const refreshHistory = useCallback(async (id, from, to) => {
    if (!id || !from || !to) return
    setLoadingHistory(true)
    try {
      const url = `${BASE}/api/public/mt5-bot/accounts/${id}/history?from=${from}&to=${to}`
      const r = await fetch(url); const d = await r.json()
      if (d.success) {
        setClosedList(d.items || [])
        setClosedTotals({ lot: d.totalLot || 0, profit: d.totalProfit || 0 })
      }
    } catch (e) { console.error(e) }
    finally { setLoadingHistory(false) }
  }, [])
  useEffect(() => {
    if (selectedId && dateStart && dateEnd) refreshHistory(selectedId, dateStart, dateEnd)
  }, [selectedId, dateStart, dateEnd, refreshHistory])

  useEffect(() => {
    if (!selectedId) return
    const client = new Client({
      webSocketFactory: () => new SockJS(BASE + '/ws'),
      reconnectDelay: 3000, heartbeatIncoming: 10000, heartbeatOutgoing: 10000,
      onConnect: () => {
        setConnected(true)
        client.subscribe('/topic/mt5-bot/accounts', () => refreshAccounts())
        client.subscribe(`/topic/mt5-bot/${selectedId}`, (msg) => {
          try {
            const acc = JSON.parse(msg.body)
            setAccount(acc)
            setAccounts(prev => prev.map(a => a.id === acc.id ? { ...a, ...acc } : a))
          } catch (e) { console.error(e) }
        })
      },
      onDisconnect: () => setConnected(false),
      onStompError: () => setConnected(false),
    })
    client.activate(); clientRef.current = client
    return () => client.deactivate()
  }, [selectedId, refreshAccounts])

  const lastTicketRef = useRef(0)
  useEffect(() => {
    if (!account) return
    if (account.latestClosedTicket > lastTicketRef.current) {
      lastTicketRef.current = account.latestClosedTicket
      refreshHistory(selectedId, dateStart, dateEnd)
    }
  }, [account, selectedId, dateStart, dateEnd, refreshHistory])

  const openPositions = account?.openPositions || []
  const openLot = useMemo(() => openPositions.reduce((s, p) => s + Number(p.volume || 0), 0), [openPositions])
  const openPnL = useMemo(() => openPositions.reduce((s, p) => s + Number(p.profit || 0), 0), [openPositions])
  const openPulse = useValuePulse(openPnL)
  const closedPulse = useValuePulse(closedTotals.profit)
  const equity = account?.equity ?? null
  const equityPulse = useValuePulse(equity)
  const state = account?.state || 'PAUSED'

  const doSetState = useCallback(async (next) => {
    setActionBusy(true)
    try {
      const r = await fetch(`${BASE}/api/public/mt5-bot/accounts/${selectedId}/state`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: next })
      })
      const d = await r.json()
      if (!r.ok || d.success === false) { showToast(d.message || `Lỗi ${r.status}`) }
      else { if (d.account) setAccount(a => ({ ...(a || {}), ...d.account })) }
    } catch (e) { showToast(String(e.message || e)) }
    finally { setActionBusy(false); setConfirmAction(null) }
  }, [selectedId, showToast])

  const doSaveLot = useCallback(async (lot) => {
    setLotSaving(true); setLotError(null)
    try {
      const r = await fetch(`${BASE}/api/public/mt5-bot/accounts/${selectedId}/lot`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lot })
      })
      const d = await r.json()
      if (!r.ok || d.success === false) { setLotError(d.message || `Lỗi ${r.status}`) }
      else { if (d.account) setAccount(a => ({ ...(a || {}), ...d.account })); setLotOpen(false); showToast('Đã cập nhật lot.') }
    } catch (e) { setLotError(String(e.message || e)) }
    finally { setLotSaving(false) }
  }, [selectedId, showToast])

  const doStop = useCallback(async (passcode) => {
    setStopSaving(true); setStopError(null)
    try {
      const r = await fetch(`${BASE}/api/public/mt5-bot/accounts/${selectedId}/stop`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode })
      })
      const d = await r.json()
      if (!r.ok || d.success === false) { setStopError(d.message || `Lỗi ${r.status}`) }
      else { if (d.account) setAccount(a => ({ ...(a || {}), ...d.account })); setStopOpen(false); showToast('Đã gửi lệnh tắt bot.') }
    } catch (e) { setStopError(String(e.message || e)) }
    finally { setStopSaving(false) }
  }, [selectedId, showToast])

  const requestRun = () => {
    if (!currentLot || currentLot <= 0) {
      showToast('Chưa cấu hình lot — hãy nhấn "⚙ Sửa lot" để cấu hình trước khi khởi động bot.')
      return
    }
    setConfirmAction({ type: 'RUN' })
  }
  const requestPause = () => setConfirmAction({ type: 'PAUSE' })
  const requestStop = () => setStopOpen(true)
  const requestEditLot = () => { setLotError(null); setLotOpen(true) }

  const canEditLot = state !== 'RUNNING'
  const currentLot = account?.lot ?? 0

  const OPEN_COLS = [
    { label: 'Ticket' }, { label: 'Side', hideOnMobile: true }, { label: 'Symbol' },
    { label: 'Lot' }, { label: 'Open' }, { label: 'P/L' }, { label: 'Giờ mở', hideOnMobile: true },
  ]
  const CLOSED_COLS = [
    { label: 'Ticket' }, { label: 'Side', hideOnMobile: true }, { label: 'Symbol' },
    { label: 'Lot' }, { label: 'Open', hideOnMobile: true }, { label: 'Close' },
    { label: 'P/L' }, { label: 'Giờ đóng', hideOnMobile: true },
  ]

  return (
    <div className="min-h-[100dvh] md:h-[100dvh] bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col md:overflow-hidden">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap z-30 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l4-8 4 4 4-7 4 8" />
            </svg>
          </div>
          <span className="text-base font-bold tracking-tight">MT5 Bot Monitor</span>
          <a href="/news" className="text-xs text-rose-600 dark:text-rose-400 hover:underline font-medium">📰 Tin</a>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${connected ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-600'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300 dark:bg-gray-600'}`} />
            {connected ? 'Live' : 'Offline'}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {accounts.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 dark:text-gray-400 hidden sm:inline">Tài khoản</span>
              <select value={selectedId || ''} onChange={e => setSelectedId(Number(e.target.value))}
                className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 pr-8 text-sm text-gray-700 dark:text-gray-200 focus:outline-none focus:border-violet-500 cursor-pointer shadow-sm">
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name ? `${a.name} · ${a.login}` : a.login} ({a.server})
                  </option>
                ))}
              </select>
            </div>
          )}
          <DarkModeToggle dark={dark} onToggle={toggleDark} />
        </div>
      </header>

      {account && (
        <section className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <StateBadge state={state} />
            {account.avoidingNews && (
              <AvoidingNewsBadge title={account.avoidingNewsTitle} until={account.avoidingNewsUntil} />
            )}
            <div className="text-sm">
              <span className="text-gray-500 dark:text-gray-400 mr-1">Login:</span><b className="tabular-nums">{account.login}</b>
              {account.name && <span className="ml-2 text-gray-500 dark:text-gray-400">· {account.name}</span>}
              <span className="ml-2 text-gray-400 dark:text-gray-500 text-xs">· {account.server}</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 flex-wrap tabular-nums">
            <span>Lot cấu hình: <b className="text-gray-800 dark:text-gray-100">{fmtVN(currentLot, 2)}</b></span>
            {account.balance != null && <span>Balance: <b className="text-gray-800 dark:text-gray-100">{fmtVN(account.balance)}</b></span>}
            {equity != null && (
              <span>Equity:{' '}
                <AnimatedValue value={fmtVN(equity)} className={`${equity >= (account.balance || equity) ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}
                  pulseKey={equityPulse.key} direction={equityPulse.dir} />
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={requestEditLot} disabled={actionBusy}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50">
              ⚙ Sửa lot
            </button>
            {state === 'RUNNING' ? (
              <button onClick={requestPause} disabled={actionBusy}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-amber-500 hover:bg-amber-400 text-white border-amber-500 disabled:opacity-40">
                ⏸ Tạm dừng
              </button>
            ) : (
              <button onClick={requestRun} disabled={actionBusy}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600 disabled:opacity-40">
                ▶ Tiếp tục
              </button>
            )}

            {state === 'STOPPING' ? (
              <button onClick={requestRun} disabled={actionBusy}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-600 disabled:opacity-40">
                ⏻ Khởi động
              </button>
            ) : (
              <button onClick={requestStop} disabled={actionBusy}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border bg-rose-600 hover:bg-rose-500 text-white border-rose-600 disabled:opacity-40">
                ■ Tắt
              </button>
            )}
          </div>
        </section>
      )}

      <main className="flex-1 md:min-h-0 flex flex-col p-4 sm:p-5 gap-4">
        {booting ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-400 dark:text-gray-500 text-sm">Đang tải tài khoản...</p>
          </div>
        ) : !selectedId ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-400 dark:text-gray-500 text-sm">Chưa có tài khoản nào kết nối.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:flex-1 md:min-h-0">
            {/* LEFT: Open */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden shadow-sm md:min-h-0">
              <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-2 bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Lệnh đang mở</span>
                </div>
                <div className="flex items-center gap-3 text-xs tabular-nums flex-wrap">
                  <span className="text-gray-500 dark:text-gray-400">{openPositions.length} lệnh</span>
                  <span className="text-gray-500 dark:text-gray-400">Lot: <b className="text-gray-700 dark:text-gray-200">{fmtVN(openLot, 2)}</b></span>
                  <span className="text-gray-500 dark:text-gray-400">P/L:{' '}
                    <AnimatedValue value={`${profitSign(openPnL)}${fmtVN(openPnL)}`} className={profitClass(openPnL)} pulseKey={openPulse.key} direction={openPulse.dir} />
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-auto min-h-0">
                {openPositions.length === 0 ? (
                  <div className="py-16 text-center text-gray-300 dark:text-gray-600 text-sm">Không có lệnh nào đang mở</div>
                ) : (
                  <table className="w-full text-sm min-w-[380px]">
                    <TableHead cols={OPEN_COLS} />
                    <tbody>{openPositions.map(p => <OpenRow key={p.ticket} pos={p} />)}</tbody>
                  </table>
                )}
              </div>
            </div>

            {/* RIGHT: History */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden shadow-sm md:min-h-0">
              <div className="px-4 py-2.5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-wrap gap-2 bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">Lịch sử</span>
                </div>
                <div className="flex items-center gap-3 text-xs tabular-nums flex-wrap">
                  <span className="text-gray-500 dark:text-gray-400">{closedList.length} lệnh</span>
                  <span className="text-gray-500 dark:text-gray-400">Lot: <b className="text-gray-700 dark:text-gray-200">{fmtVN(closedTotals.lot, 2)}</b></span>
                  <span className="text-gray-500 dark:text-gray-400">P/L:{' '}
                    <AnimatedValue value={`${profitSign(closedTotals.profit)}${fmtVN(closedTotals.profit)}`} className={profitClass(closedTotals.profit)} pulseKey={closedPulse.key} direction={closedPulse.dir} />
                  </span>
                  <DateRangePicker startKey={dateStart} endKey={dateEnd} onChange={(s, e) => { setDateStart(s); setDateEnd(e) }} />
                </div>
              </div>
              <div className="overflow-auto md:flex-1 md:min-h-0 h-[500px] md:h-auto">
                {loadingHistory ? (
                  <div className="py-16 text-center text-gray-400 dark:text-gray-500 text-sm">Đang tải...</div>
                ) : closedList.length === 0 ? (
                  <div className="py-16 text-center text-gray-300 dark:text-gray-600 text-sm">Không có lệnh nào trong khoảng này</div>
                ) : (
                  <table className="w-full text-sm min-w-[380px]">
                    <TableHead cols={CLOSED_COLS} />
                    <tbody>{closedList.map(t => <ClosedRow key={t.ticket} trade={t} />)}</tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      <ConfirmModal
        open={!!confirmAction && confirmAction.type === 'RUN'}
        title={state === 'STOPPING' ? 'Khởi động bot?' : 'Tiếp tục bot?'}
        message={`Bot sẽ bắt đầu mở/đóng lệnh theo logic. Lot hiện tại: ${fmtVN(currentLot, 2)}.`}
        confirmLabel={state === 'STOPPING' ? 'Khởi động' : 'Tiếp tục'}
        busy={actionBusy}
        onConfirm={() => doSetState('RUNNING')}
        onCancel={() => setConfirmAction(null)}
      />
      <ConfirmModal
        open={!!confirmAction && confirmAction.type === 'PAUSE'}
        title="Tạm dừng bot?"
        message="Bot sẽ tạm dừng mở lệnh mới, KHÔNG đóng các lệnh đang mở."
        confirmLabel="Tạm dừng"
        busy={actionBusy}
        onConfirm={() => doSetState('PAUSED')}
        onCancel={() => setConfirmAction(null)}
      />

      <LotEditModal
        open={lotOpen}
        current={currentLot}
        canEdit={canEditLot}
        saving={lotSaving}
        error={lotError}
        onClose={() => setLotOpen(false)}
        onSave={doSaveLot}
      />

      <StopPasscodeModal
        open={stopOpen}
        saving={stopSaving}
        error={stopError}
        onClose={() => setStopOpen(false)}
        onConfirm={doStop}
      />

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[130] bg-gray-900 dark:bg-gray-700 text-white text-sm px-4 py-2 rounded-lg shadow-lg max-w-sm text-center animate-fade-in">{toast}</div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity:0; transform: translate(-50%, 8px) } to { opacity:1; transform: translate(-50%, 0) } }
        .animate-fade-in { animation: fadeIn .2s ease both }
        @keyframes rowEnter { 0% {opacity:0; transform:translateX(-12px); background: rgba(99,102,241,.08)} 100%{opacity:1; transform:translateX(0); background:transparent} }
        .row-enter { animation: rowEnter .5s cubic-bezier(.16,1,.3,1) both }
        @keyframes valUp   { 0%,100%{color:inherit} 35%{color:#16a34a} }
        @keyframes valDown { 0%,100%{color:inherit} 35%{color:#dc2626} }
        .val-up   { animation: valUp   .7s ease both }
        .val-down { animation: valDown .7s ease both }
        .val-pulse{ animation: valUp   .7s ease both }
      `}</style>
    </div>
  )
}