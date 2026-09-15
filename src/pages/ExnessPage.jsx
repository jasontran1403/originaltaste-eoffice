import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import ConfirmModal from "../components/common/ConfirmModal"
const BASE = import.meta.env.VITE_API_URL || 'http://localhost:9009'

// Map copierId → tên hiển thị
const COPIER_NAMES = {
  'COPIER_1': 'test',
  'COPIER_2': 'Standard',
  'COPIER_3': 'Gold 1',
}
const copierLabel = (id) => COPIER_NAMES[id] ? `${COPIER_NAMES[id]}` : id
const GMT7 = 7 * 60 * 60 * 1000

/* ================================================================
   DATE HELPERS
   ================================================================ */
const todayGmt7 = () => {
  const d = new Date(Date.now() + GMT7)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate() }
}
const dateKey = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return { y, m: m - 1, d } }
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate()
const dow0 = (y, m) => new Date(y, m, 1).getDay()
const keyToDate = (k) => { const { y, m, d } = parseKey(k); return new Date(y, m, d) }
const isBefore = (a, b) => keyToDate(a) < keyToDate(b)
const isAfter = (a, b) => keyToDate(a) > keyToDate(b)

const toApiDate = (k) => k

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
const toGmt7 = (iso) => {
  if (!iso) return null
  try { const d = new Date(String(iso).replace(' ', 'T').replace(/(\.\d+)?$/, '') + 'Z'); return isNaN(d.getTime()) ? null : new Date(d.getTime() + GMT7) }
  catch { return null }
}
const fmtTime = (iso) => { const d = toGmt7(iso); return d ? d.toISOString().substring(11, 19) : '—' }
const fmtTimeRaw = (raw) => {
  if (!raw) return '—'
  const s = String(raw)
  const mq5 = s.match(/(\d{4})\.(\d{2})\.(\d{2}) (\d{2}):(\d{2}):(\d{2})/)
  if (mq5) {
    const [, y, mo, d, h, mi, se] = mq5.map(Number)
    const dt = new Date(Date.UTC(y, mo - 1, d, h, mi, se) + GMT7)
    return dt.toISOString().substring(11, 19)
  }
  return fmtTime(s)
}

const calcNet = (t) => Number(t.profit || 0) + Number(t.commission || 0) + Number(t.swap || 0) + Number(t.fee || 0)
const profitSign = (v) => v > 0.001 ? '+' : ''
const profitClass = (v) => v > 0.001 ? 'text-emerald-600' : v < -0.001 ? 'text-rose-500' : 'text-gray-400'

/* ================================================================
   VALUE PULSE
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
   DATE RANGE PICKER
   ================================================================ */
const MONTHS_VI = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12']
const DAYS_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

function CalendarMonth({ year, month, startKey, endKey, hoverKey, onDayClick, onDayHover, todayKey }) {
  const days = daysInMonth(year, month)
  const startDow = dow0(year, month)
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(d)

  return (
    <div className="select-none">
      <div className="text-center text-sm font-semibold text-gray-700 mb-2">
        {MONTHS_VI[month]} {year}
      </div>
      <div className="grid grid-cols-7 mb-1">
        {DAYS_VI.map(d => (
          <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-0.5">{d}</div>
        ))}
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
          const inHover = startKey && !endKey && hoverKey &&
            !isBefore(k, startKey) && !isAfter(k, hoverKey)
          return (
            <button key={k} onClick={() => onDayClick(k)} onMouseEnter={() => onDayHover(k)}
              className={`
                relative h-8 w-full text-xs rounded-md font-medium transition-colors
                ${isEdge ? 'bg-violet-600 text-white z-10' : ''}
                ${!isEdge && (inRange || inHover) ? 'bg-violet-100 text-violet-700' : ''}
                ${!isEdge && !inRange && !inHover ? 'text-gray-700 hover:bg-gray-100' : ''}
                ${isToday && !isEdge ? 'ring-1 ring-violet-400' : ''}
              `}>
              {d}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DateRangePicker({ startKey, endKey, onChange }) {
  const today = todayGmt7()
  const todayKey = dateKey(today.y, today.m, today.d)

  const [leftYear, setLeftYear] = useState(today.m === 0 ? today.y - 1 : today.y)
  const [leftMonth, setLeftMonth] = useState(today.m === 0 ? 11 : today.m - 1)
  const [hoverKey, setHoverKey] = useState(null)
  const [open, setOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const ref = useRef(null)
  const panelRef = useRef(null)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  const rightYear = leftMonth === 11 ? leftYear + 1 : leftYear
  const rightMonth = leftMonth === 11 ? 0 : leftMonth + 1

  const prevMonth = () => {
    if (leftMonth === 0) { setLeftYear(y => y - 1); setLeftMonth(11) }
    else setLeftMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (rightMonth === 11) { setLeftYear(y => y + 1); setLeftMonth(0) }
    else setLeftMonth(m => m + 1)
  }

  const handleDayClick = (k) => {
    if (!startKey || (startKey && endKey)) {
      onChange(k, null)
    } else {
      if (isBefore(k, startKey)) onChange(k, startKey)
      else onChange(startKey, k)
      setOpen(false)
    }
  }

  // Close on outside click — phải kiểm tra cả panel (vì trên mobile panel
  // render ra ngoài `ref` bằng portal-like fixed nên vẫn nằm trong DOM
  // nhưng không phải con của ref)
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (ref.current && ref.current.contains(e.target)) return
      if (panelRef.current && panelRef.current.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [open])

  // Khi mở trên mobile, khoá scroll body để không bị nhảy khi chọn tháng
  useEffect(() => {
    if (!open || !isMobile) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prevOverflow }
  }, [open, isMobile])

  const fmtDisplay = (k) => {
    if (!k) return ''
    const { y, m, d } = parseKey(k)
    return `${String(d).padStart(2, '0')}/${String(m + 1).padStart(2, '0')}/${y}`
  }

  const label = startKey && endKey
    ? (startKey === endKey ? fmtDisplay(startKey) : `${fmtDisplay(startKey)} – ${fmtDisplay(endKey)}`)
    : startKey ? `${fmtDisplay(startKey)} – ...` : 'Chọn ngày'

  // Nội dung panel — dùng chung cho cả 2 layout
  const PanelContent = (
    <>
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <button onClick={nextMonth}
          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className={isMobile ? '' : 'grid grid-cols-2 gap-6'}>
        <CalendarMonth year={leftYear} month={leftMonth}
          startKey={startKey} endKey={endKey} hoverKey={hoverKey} todayKey={todayKey}
          onDayClick={handleDayClick} onDayHover={setHoverKey} />
        {!isMobile && (
          <CalendarMonth year={rightYear} month={rightMonth}
            startKey={startKey} endKey={endKey} hoverKey={hoverKey} todayKey={todayKey}
            onDayClick={handleDayClick} onDayHover={setHoverKey} />
        )}
      </div>

      <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
        {[
          { label: 'Hôm nay', fn: () => { const k = dateKey(today.y, today.m, today.d); onChange(k, k); setOpen(false) } },
          {
            label: 'Hôm qua', fn: () => {
              const y = new Date(Date.now() + GMT7 - 86400000)
              const k = dateKey(y.getUTCFullYear(), y.getUTCMonth(), y.getUTCDate())
              onChange(k, k); setOpen(false)
            }
          },
          {
            label: '7 ngày', fn: () => {
              const from = new Date(Date.now() + GMT7 - 6 * 86400000)
              onChange(dateKey(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
                dateKey(today.y, today.m, today.d)); setOpen(false)
            }
          },
          {
            label: '30 ngày', fn: () => {
              const from = new Date(Date.now() + GMT7 - 29 * 86400000)
              onChange(dateKey(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()),
                dateKey(today.y, today.m, today.d)); setOpen(false)
            }
          },
          {
            label: 'Tháng này', fn: () => {
              onChange(dateKey(today.y, today.m, 1), dateKey(today.y, today.m, today.d)); setOpen(false)
            }
          },
        ].map(({ label, fn }) => (
          <button key={label} onClick={fn}
            className="px-2.5 py-1 text-[11px] rounded-md bg-gray-100
                       hover:bg-violet-100 hover:text-violet-700 text-gray-600
                       font-medium transition-colors">
            {label}
          </button>
        ))}
      </div>

      {startKey && !endKey && (
        <p className="text-[10px] text-gray-400 mt-2 text-center">Chọn ngày kết thúc</p>
      )}
    </>
  )

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300
                   bg-white hover:bg-gray-50 text-xs font-medium text-gray-700
                   shadow-sm transition-colors whitespace-nowrap">
        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span>{label}</span>
        <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ── Mobile: bottom-sheet fixed, không bị overflow cắt ── */}
      {open && isMobile && (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
          onTouchStart={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            ref={panelRef}
            className="relative w-full max-w-md bg-white rounded-t-2xl shadow-2xl
                       p-4 pb-5 max-h-[90vh] overflow-y-auto"
            style={{ paddingBottom: 'calc(1.25rem + env(safe-area-inset-bottom))' }}
          >
            {/* Drag handle */}
            <div className="w-10 h-1 rounded-full bg-gray-300 mx-auto mb-3" />
            {PanelContent}
          </div>
        </div>
      )}

      {/* ── Desktop: dropdown absolute như cũ ── */}
      {open && !isMobile && (
        <div
          ref={panelRef}
          className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl shadow-xl
                     border border-gray-200 p-4"
          style={{ minWidth: 560 }}
        >
          {PanelContent}
        </div>
      )}
    </div>
  )
}

/* ================================================================
   COL HEADER
   ================================================================ */
function ColHeader({ title, totalLot, totalCount, totalPnL, accent, pnlPulseKey, pnlDir, children }) {
  const pc = totalPnL == null ? 'text-gray-400'
    : totalPnL > 0.001 ? 'text-emerald-600' : totalPnL < -0.001 ? 'text-rose-500' : 'text-gray-400'
  return (
    <div className="px-4 py-2.5 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2 bg-gray-50 flex-shrink-0">
      <div className="flex items-center gap-2.5">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${accent}`} />
        <span className="text-sm font-semibold text-gray-800">{title}</span>
      </div>
      <div className="flex items-center gap-3 text-xs tabular-nums flex-wrap">
        {totalCount != null && <span className="text-gray-500">{totalCount} lệnh</span>}
        <span className="text-gray-500">Lot: <b className="text-gray-700">{fmtVN(totalLot, 2)}</b></span>
        {totalPnL !== null && (
          <span className="text-gray-500">P/L:{' '}
            <AnimatedValue value={`${profitSign(totalPnL)}${fmtVN(totalPnL)}`}
              className={`text-xs ${pc}`} pulseKey={pnlPulseKey} direction={pnlDir} />
          </span>
        )}
        {children}
      </div>
    </div>
  )
}

/* ================================================================
   TABLE HEAD
   ================================================================ */
function TableHead({ cols }) {
  return (
    <thead className="sticky top-0 z-10 bg-white">
      <tr className="border-b border-gray-100">
        {cols.map((c, i) => {
          const label = typeof c === 'string' ? c : c.label
          const hideOnMobile = typeof c === 'object' && c.hideOnMobile
          const hideOnDesktop = typeof c === 'object' && c.hideOnDesktop
          return (
            <th key={label}
              className={`px-3 py-2 text-[10px] font-semibold text-gray-400
                uppercase tracking-wider whitespace-nowrap
                ${i >= 3 ? 'text-right' : 'text-left'}
                ${hideOnMobile ? 'hidden md:table-cell' : ''}
                ${hideOnDesktop ? 'md:hidden' : ''}`}>
              {label}
            </th>
          )
        })}
      </tr>
    </thead>
  )
}


/* ================================================================
   SYMBOL + SIDE (+ LOT trên mobile)
   ================================================================ */
function SymbolCell({ symbol, direction, lot, lotDigits = 2 }) {
  const isBuy = direction === 'BUY'
  return (
    <>
      {/* Desktop: chỉ symbol */}
      <div className="hidden md:block text-xs text-gray-700 font-medium">{symbol || '—'}</div>
      {/* Mobile: 2 dòng — symbol + mũi tên, dưới là lot */}
      <div className="md:hidden">
        <div className="flex items-center gap-1">
          <span className={`text-xs font-bold ${isBuy ? 'text-emerald-600' : 'text-rose-500'}`}>
            {symbol || '—'}
          </span>
          <span className={`text-[10px] font-bold ${isBuy ? 'text-emerald-500' : 'text-rose-400'}`}>
            {isBuy ? '▲' : '▼'}
          </span>
        </div>
        <div className="text-[10px] text-gray-400 tabular-nums mt-0.5">
          {fmtVN(lot, lotDigits)} lot
        </div>
      </div>
    </>
  )
}

/* ================================================================
   OPEN ROW
   ================================================================ */
function OpenRow({ pos, isNew, isLeaving }) {
  const pl = Number(pos.profit || 0)
  return (
    <tr className={`border-b border-gray-100 transition-all duration-300
      ${isNew ? 'row-enter-open' : ''} ${isLeaving ? 'row-leave' : 'hover:bg-blue-50/40'}`}>
      <td className="px-3 py-2.5 text-[11px] text-gray-400 tabular-nums font-mono align-top">
        <div>#{pos.ticket}</div>
        <div className="md:hidden text-[10px] text-gray-400 mt-0.5">{fmtTimeRaw(pos.openTime)}</div>
      </td>
      <td className="px-3 py-2.5 hidden md:table-cell">
        <span className={`text-xs font-bold ${pos.direction === 'BUY' ? 'text-emerald-600' : 'text-rose-500'}`}>
          {pos.direction}
        </span>
      </td>
      {/* Symbol (desktop) / Symbol + Lot (mobile) */}
      <td className="px-3 py-2.5">
        <SymbolCell symbol={pos.symbol} direction={pos.direction} lot={pos.volume} />
      </td>
      {/* Lot — ẩn trên mobile */}
      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-gray-700 hidden md:table-cell">
        {fmtVN(pos.volume, 2)}
      </td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-gray-600">{fmtPrice(pos.openPrice)}</td>
      <td className={`px-3 py-2.5 text-right text-xs tabular-nums font-semibold ${profitClass(pl)}`}>
        {`${profitSign(pl)}${fmtVN(pl)}`}
      </td>
      <td className="px-3 py-2.5 text-right text-xs text-gray-400 tabular-nums hidden md:table-cell">
        {fmtTimeRaw(pos.openTime)}
      </td>
    </tr>
  )
}

/* ================================================================
   CLOSED ROW
   ================================================================ */
function ClosedRow({ trade: t, isNew }) {
  const dir = t.direction === 'BUY'
  const net = calcNet(t)
  const hasNet = t.profit != null
  const closePriceClass = !hasNet
    ? 'text-gray-400'
    : net > 0.001 ? 'text-emerald-600' : net < -0.001 ? 'text-rose-500' : 'text-gray-400'

  return (
    <tr className={`border-b border-gray-100 transition-all duration-300
      ${isNew ? 'row-enter-closed' : ''} hover:bg-amber-50/40`}>
      <td className="px-3 py-2.5 text-[11px] text-gray-400 tabular-nums font-mono align-top">
        <div>#{t.positionTicket}</div>
        <div className="md:hidden text-[10px] text-gray-400 mt-0.5">{fmtTime(t.closeTime)}</div>
      </td>
      <td className="px-3 py-2.5 hidden md:table-cell">
        <span className={`text-xs font-bold ${dir ? 'text-emerald-600' : 'text-rose-500'}`}>{t.direction}</span>
      </td>
      {/* Symbol (desktop) / Symbol + Lot (mobile) */}
      <td className="px-3 py-2.5">
        <SymbolCell symbol={t.symbol} direction={t.direction} lot={t.volume} />
      </td>
      {/* Lot — ẩn trên mobile */}
      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-gray-700 hidden md:table-cell">
        {fmtVN(t.volume, 2)}
      </td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-gray-500 hidden md:table-cell">
        {fmtPrice(t.openPrice)}
      </td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-gray-500 hidden md:table-cell">
        {fmtPrice(t.closePrice)}
      </td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums md:hidden align-top">
        <div className="text-gray-500">{fmtPrice(t.openPrice)}</div>
        <div className={`${closePriceClass} font-semibold mt-0.5`}>{fmtPrice(t.closePrice)}</div>
      </td>
      <td className={`px-3 py-2.5 text-right text-xs tabular-nums font-semibold
        ${!hasNet ? 'text-gray-300' : profitClass(net)}`}>
        {!hasNet ? '—' : `${profitSign(net)}${fmtVN(net)}`}
      </td>
      <td className="px-3 py-2.5 text-right text-xs text-gray-400 tabular-nums hidden md:table-cell">
        {fmtTime(t.closeTime)}
      </td>
    </tr>
  )
}

/* ================================================================
   BOT TOGGLE
   ================================================================ */
function BotToggle({ copierId, active, onRequestToggle, toggling }) {
  return (
    <button onClick={() => onRequestToggle(copierId, !active)} disabled={toggling || !copierId}
      className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold
        transition-all duration-200 shadow-sm select-none border
        ${active ? 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-500'
          : 'bg-white hover:bg-gray-50 text-gray-600 border-gray-300'}
        ${(toggling || !copierId) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${active ? 'bg-white animate-pulse' : 'bg-gray-400'}`} />
      {toggling ? 'Đang xử lý...' : active ? 'Đang bật' : 'Đang tắt'}
    </button>
  )
}

/* ================================================================
   MAIN
   ================================================================ */
export default function ExnessPage() {
  const [copierIds, setCopierIds] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [openPositions, setOpenPositions] = useState([])
  const [syncReady, setSyncReady] = useState(false)
  const syncTimerRef = useRef(null)
  const [closedPositions, setClosedPositions] = useState([])

  const [loading, setLoading] = useState(false)
  const [stateMap, setStateMap] = useState({})
  const [connected, setConnected] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [newOpenIds, setNewOpenIds] = useState(new Set())
  const [newClosedIds, setNewClosedIds] = useState(new Set())
  const [leavingIds, setLeavingIds] = useState(new Set())

  const [confirmToggle, setConfirmToggle] = useState(null)

  const initToday = () => {
    const t = todayGmt7()
    return dateKey(t.y, t.m, t.d)
  }
  const [dateStart, setDateStart] = useState(initToday)
  const [dateEnd, setDateEnd] = useState(initToday)

  const closedScrollRef = useRef(null)
  const clientRef = useRef(null)

  const applyState = useCallback((s) => {
    if (!s || !s.copierId) return
    setStateMap(prev => ({ ...prev, [s.copierId]: { active: !!s.active, updatedAt: s.updatedAt || null, changedBy: s.changedBy || null } }))
  }, [])
  const currentActive = selectedId ? (stateMap[selectedId]?.active ?? true) : true

  useEffect(() => {
    fetch(`${BASE}/api/public/mt5/copier/ids`).then(r => r.json()).then(d => {
      const ids = d.copierIds || []; setCopierIds(ids)
      if (ids.length > 0 && !selectedId) {
        const preferred = ids.find(id => id === 'COPIER_3') || ids[0]
        setSelectedId(preferred)
      }
    }).catch(console.error)
  }, [])

  const fetchHistory = useCallback(async (copierId, from, to) => {
    if (!copierId || !from || !to) return
    setLoading(true)
    setClosedPositions([])
    try {
      const url = `${BASE}/api/public/mt5/copier/history?copierId=${encodeURIComponent(copierId)}&from=${from}&to=${to}`
      const r = await fetch(url); const d = await r.json()
      if (d.success) {
        setClosedPositions(d.closedPositions || [])
        if (d.state) applyState(d.state)
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [applyState])

  useEffect(() => {
    if (!selectedId || !dateStart || !dateEnd) return
    setOpenPositions([])
    setSyncReady(false)
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    syncTimerRef.current = setTimeout(() => setSyncReady(true), 5000)
    fetchHistory(selectedId, dateStart, dateEnd)
  }, [selectedId, dateStart, dateEnd, fetchHistory])

  const handleDateChange = useCallback((start, end) => {
    setDateStart(start); setDateEnd(end || null)
  }, [])

  useEffect(() => {
    if (!selectedId) return
    const client = new Client({
      webSocketFactory: () => new SockJS(BASE.replace(/^http/, 'http') + '/ws'),
      reconnectDelay: 3000, heartbeatIncoming: 10000, heartbeatOutgoing: 10000,
      onConnect: () => {
        setConnected(true)

        client.subscribe('/topic/mt5-monitor', (msg) => {
          try {
            const payload = JSON.parse(msg.body)
            if (payload.type !== 'ACCOUNT') return
            const acc = payload.account
            if (!acc || acc.id !== selectedId) return
            const positions = acc.positions || []
            if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
            setSyncReady(true)
            setOpenPositions(prev => {
              const prevTickets = new Set(prev.map(p => p.ticket))
              const newTickets = new Set(positions.map(p => p.ticket))
              positions.forEach(p => {
                if (!prevTickets.has(p.ticket)) {
                  setNewOpenIds(s => new Set(s).add(p.ticket))
                  setTimeout(() => setNewOpenIds(s => { const n = new Set(s); n.delete(p.ticket); return n }), 800)
                }
              })
              prev.forEach(p => {
                if (!newTickets.has(p.ticket)) {
                  setLeavingIds(s => new Set(s).add(p.ticket))
                  setTimeout(() => setLeavingIds(s => { const n = new Set(s); n.delete(p.ticket); return n }), 400)
                }
              })
              return positions
            })
          } catch (e) { console.error('Monitor WS err', e) }
        })

        client.subscribe(`/topic/mt5-exness/${selectedId}`, (msg) => {
          try {
            const payload = JSON.parse(msg.body)
            if (payload.type === 'STATE_CHANGE') {
              if (payload.copierId === selectedId) applyState(payload)
              return
            }
            if (payload.type === 'TRADE_EVENT' && payload.event !== 'OPEN') {
              const trade = payload.trade; const tk = trade.positionTicket
              setTimeout(() => {
                const closeDate = trade.closeTime
                  ? (() => { const d = toGmt7(trade.closeTime); return d ? dateKey(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) : null })()
                  : null
                const inRange = !closeDate || (
                  (!dateStart || closeDate >= dateStart) &&
                  (!dateEnd || closeDate <= dateEnd)
                )
                if (inRange) {
                  setClosedPositions(prev => prev.some(t => t.positionTicket === tk) ? prev : [trade, ...prev])
                  setNewClosedIds(s => new Set(s).add(tk))
                  setTimeout(() => setNewClosedIds(s => { const n = new Set(s); n.delete(tk); return n }), 800)
                }
              }, 450)
            }
          } catch (e) { console.error('Exness WS err', e) }
        })
      },
      onDisconnect: () => setConnected(false),
      onStompError: () => setConnected(false),
    })
    client.activate(); clientRef.current = client
    return () => {
      client.deactivate()
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current)
    }
  }, [selectedId, applyState, dateStart, dateEnd])

  const requestToggle = useCallback((copierId, nextActive) => {
    if (!copierId || toggling) return
    setConfirmToggle({ copierId, nextActive })
  }, [toggling])

  const doToggle = useCallback(async () => {
    if (!confirmToggle) return
    const { copierId, nextActive } = confirmToggle
    setConfirmToggle(null)
    setToggling(true)
    try {
      const r = await fetch(`${BASE}/api/public/mt5/copier/state`,
        {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ copierId, active: nextActive, changedBy: 'UI' })
        })
      applyState(await r.json())
    } catch (e) { console.error(e) }
    finally { setToggling(false) }
  }, [confirmToggle, applyState])

  const openLot = useMemo(() => openPositions.reduce((s, p) => s + (p.volume || 0), 0), [openPositions])
  const openPnL = useMemo(() => openPositions.reduce((s, p) => s + Number(p.profit || 0), 0), [openPositions])
  const closedLot = useMemo(() => closedPositions.reduce((s, t) => s + (t.volume || 0), 0), [closedPositions])
  const closedPnL = useMemo(() => closedPositions.reduce((s, t) => s + calcNet(t), 0), [closedPositions])

  const openPnlPulse = useValuePulse(openPnL)
  const closedPnlPulse = useValuePulse(closedPnL)

  const stateInfo = selectedId ? stateMap[selectedId] : null
  const stateAge = stateInfo?.updatedAt ? (() => {
    try {
      const diff = Math.floor((Date.now() - new Date(stateInfo.updatedAt).getTime()) / 1000)
      if (diff < 60) return `${diff}s trước`
      if (diff < 3600) return `${Math.floor(diff / 60)}m trước`
      return `${Math.floor(diff / 3600)}h trước`
    } catch { return '' }
  })() : ''

  const OPEN_COLS = [
    { label: 'Ticket' },
    { label: 'Side', hideOnMobile: true },
    { label: 'Symbol' },
    { label: 'Lot', hideOnMobile: true },
    { label: 'Open' },
    { label: 'P/L' },
    { label: 'Giờ mở', hideOnMobile: true },
  ]

  const CLOSED_COLS = [
    { label: 'Ticket' },
    { label: 'Side', hideOnMobile: true },
    { label: 'Symbol' },
    { label: 'Lot', hideOnMobile: true },
    { label: 'Open', hideOnMobile: true },
    { label: 'Close', hideOnMobile: true },
    { label: 'Price', hideOnDesktop: true },
    { label: 'P/L' },
    { label: 'Giờ đóng', hideOnMobile: true },
  ]

  return (
    <div className="min-h-[100dvh] md:h-[100dvh] bg-gray-50 text-gray-900 flex flex-col md:overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3
                         flex items-center justify-between gap-3 flex-wrap z-30 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600
                          flex items-center justify-center shadow-sm flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l4-8 4 4 4-7 4 8" />
            </svg>
          </div>
          <span className="text-base font-bold tracking-tight">Copier Trade</span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold
            ${connected ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
              : 'bg-gray-100 text-gray-400 border border-gray-200'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
            {connected ? 'Live' : 'Offline'}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {copierIds.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 hidden sm:inline">Tài khoản</span>
              <div className="relative">
                <select value={selectedId || ''} onChange={e => setSelectedId(e.target.value)}
                  className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 pr-8
                             text-sm text-gray-700 focus:outline-none focus:border-violet-500
                             cursor-pointer appearance-none shadow-sm">
                  {copierIds.map(id => <option key={id} value={id}>{copierLabel(id)}</option>)}
                </select>
                <svg className="pointer-events-none absolute right-2 top-2.5 w-3 h-3 text-gray-400"
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          )}
          {selectedId && (
            <div className="flex flex-col items-end gap-0.5">
              <BotToggle copierId={selectedId} active={currentActive}
                onRequestToggle={requestToggle} toggling={toggling} />
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 md:min-h-0 flex flex-col p-4 sm:p-5 gap-4">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-400 text-sm">
              {copierIds.length === 0 ? 'Chưa có tài khoản nào kết nối.' : 'Chọn tài khoản để xem lệnh.'}
            </p>
          </div>
        ) : loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-7 h-7 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:flex-1 md:min-h-0">
            {/* CỘT TRÁI: ĐANG MỞ */}
            <div className="bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden shadow-sm md:min-h-0">
              <ColHeader title="Open Trade" totalLot={openLot} totalCount={openPositions.length}
                totalPnL={openPnL} accent="bg-blue-500"
                pnlPulseKey={openPnlPulse.key} pnlDir={openPnlPulse.dir} />
              <div className="flex-1 overflow-auto min-h-0">
                {openPositions.length === 0 ? (
                  <div className="py-16 text-center text-sm select-none">
                    {!syncReady ? (
                      <span className="flex items-center justify-center gap-2 text-gray-400">
                        <span className="w-4 h-4 border-2 border-gray-300 border-t-violet-400 rounded-full animate-spin inline-block" />
                        Chờ đồng bộ từ MT5...
                      </span>
                    ) : (
                      <span className="text-gray-300">Không có lệnh nào đang mở</span>
                    )}
                  </div>
                ) : (
                  <table className="w-full text-sm min-w-[380px]">
                    <TableHead cols={OPEN_COLS} />
                    <tbody>
                      {openPositions.map(pos => (
                        <OpenRow key={pos.ticket} pos={pos}
                          isNew={newOpenIds.has(pos.ticket)} isLeaving={leavingIds.has(pos.ticket)} />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* CỘT PHẢI: ĐÃ ĐÓNG */}
            <div className="bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden shadow-sm md:min-h-0">
              <ColHeader title="Histories" totalLot={closedLot} totalCount={closedPositions.length}
                totalPnL={closedPnL} accent="bg-amber-500"
                pnlPulseKey={closedPnlPulse.key} pnlDir={closedPnlPulse.dir}>
                <DateRangePicker startKey={dateStart} endKey={dateEnd} onChange={handleDateChange} />
              </ColHeader>
              <div
                ref={closedScrollRef}
                className="overflow-auto md:flex-1 md:min-h-0 h-[600px] md:h-auto md:min-h-0"
              >
                {closedPositions.length === 0 ? (
                  <div className="py-16 text-center text-gray-300 text-sm select-none">
                    {loading ? 'Đang tải...' : 'Không có lệnh nào trong khoảng thời gian này'}
                  </div>
                ) : (
                  <table className="w-full text-sm min-w-[380px]">
                    <TableHead cols={CLOSED_COLS} />
                    <tbody>
                      {closedPositions.map(t => (
                        <ClosedRow key={t.positionTicket} trade={t} isNew={newClosedIds.has(t.positionTicket)} />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

          </div>
        )}
      </main>

      {/* CONFIRM TOGGLE MODAL */}
      {confirmToggle && (
        <ConfirmModal
          open
          title={confirmToggle.nextActive ? 'Bật copy-bot' : 'Tắt copy-bot'}
          message={
            confirmToggle.nextActive
              ? `Bật copy-bot cho tài khoản "${copierLabel(confirmToggle.copierId)}"? Bot sẽ bắt đầu sao chép lệnh từ tín hiệu.`
              : `Tắt copy-bot cho tài khoản "${copierLabel(confirmToggle.copierId)}"? Các lệnh đang mở sẽ bị đóng toàn bộ, và bot sẽ ngừng mở lệnh mới.`
          }
          confirmLabel={confirmToggle.nextActive ? 'Bật' : 'Tắt'}
          danger={!confirmToggle.nextActive}
          busy={toggling}
          onConfirm={doToggle}
          onCancel={() => setConfirmToggle(null)}
        />
      )}

      <style>{`
        @keyframes rowEnterOpen   { 0%{opacity:0;transform:translateX(-16px);background:rgba(99,102,241,.08)} 70%{background:rgba(99,102,241,.04)} 100%{opacity:1;transform:translateX(0);background:transparent} }
        @keyframes rowEnterClosed { 0%{opacity:0;transform:translateX(16px);background:rgba(245,158,11,.10)} 70%{background:rgba(245,158,11,.05)} 100%{opacity:1;transform:translateX(0);background:transparent} }
        @keyframes rowLeave       { 0%{opacity:1;transform:translateX(0) scale(1)} 100%{opacity:0;transform:translateX(20px) scale(.97)} }
        .row-enter-open   { animation: rowEnterOpen   .5s cubic-bezier(.16,1,.3,1) both }
        .row-enter-closed { animation: rowEnterClosed .5s cubic-bezier(.16,1,.3,1) both }
        .row-leave        { animation: rowLeave .4s ease-in both; pointer-events:none }
        @keyframes valUp   { 0%,100%{color:inherit} 35%{color:#16a34a} }
        @keyframes valDown { 0%,100%{color:inherit} 35%{color:#dc2626} }
        .val-up    { animation: valUp   .7s ease both }
        .val-down  { animation: valDown .7s ease both }
        .val-pulse { animation: valUp   .7s ease both }
      `}</style>
    </div>
  )
}