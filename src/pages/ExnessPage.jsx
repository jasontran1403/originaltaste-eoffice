import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:9009'

/* ================================================================
   HELPERS
   ================================================================ */

const todayStr = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Vietnamese number: 548799.62 → "548.799,62" */
const fmtVN = (v, d = 2) => {
  if (v == null || isNaN(Number(v))) return '—'
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(Number(v))
}

const fmtPrice = (v) => {
  if (v == null || isNaN(Number(v))) return '—'
  const s = String(v)
  const dec = s.includes('.') ? s.split('.')[1].length : 2
  return fmtVN(v, Math.min(dec, 5))
}

/** Raw cent value, format with VN number style + ¢ suffix */
const fmtCent = (v, d = 2) => {
  if (v == null || isNaN(Number(v))) return '—'
  return `${fmtVN(v, d)}¢`
}

/** Treat ISO string as UTC if no timezone info, then format in GMT+7 */
const fmtTime = (iso) => {
  if (!iso) return '—'
  try {
    const m = String(iso).match(/(\d{2}):(\d{2}):(\d{2})/)
    return m ? `${m[1]}:${m[2]}:${m[3]}` : String(iso)
  } catch { return String(iso) }
}

const fmtDateShort = (str) => {
  if (!str) return ''
  const [y, m, d] = str.split('-')
  return `${d}/${m}/${y}`
}

/* ── event styling ─────────────────────────────────────────────── */

const EVENT_STYLE = {
  OPEN: { badge: 'bg-sky-100 text-sky-700', dot: 'bg-sky-500' },
  CLOSE_ALL: { badge: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  CLOSE_PARTIAL: { badge: 'bg-orange-100 text-orange-700', dot: 'bg-orange-500' },
  DEPOSIT: { badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  WITHDRAWAL: { badge: 'bg-rose-100 text-rose-700', dot: 'bg-rose-500' },
  BALANCE_ADJUSTMENT: { badge: 'bg-violet-100 text-violet-700', dot: 'bg-violet-500' },
}
const fallbackStyle = { badge: 'bg-gray-100 text-gray-600', dot: 'bg-gray-400' }
const evStyle = (e) => EVENT_STYLE[e] || fallbackStyle

/* ── drawdown calc ─────────────────────────────────────────────── */

function calcMaxDrawdown(signals) {
  if (!signals || signals.length === 0) return 0
  const sorted = [...signals].sort((a, b) =>
    new Date(a.eventTime) - new Date(b.eventTime)
  )
  let peak = -Infinity
  let maxDD = 0
  for (const s of sorted) {
    const realEq = (s.equity || 0) - (s.credit || 0)
    if (realEq > peak) peak = realEq
    if (peak > 0) {
      const dd = ((realEq - peak) / peak) * 100   // âm khi realEq < peak
      if (dd < maxDD) maxDD = dd                  // giữ giá trị âm sâu nhất
    }
  }
  return maxDD
}

/* ================================================================
   VALUE PULSE HOOK
   ================================================================ */

/**
 * Phát hiện value thay đổi, trả về { key, dir }.
 * key tăng mỗi lần value đổi → dùng làm pulseKey để trigger animation.
 * dir = 'up' | 'down' | null
 */
function useValuePulse(value) {
  const prevRef = useRef(value)
  const [state, setState] = useState({ key: 0, dir: null })

  useEffect(() => {
    const prev = prevRef.current
    if (prev === value) return
    if (typeof value === 'number' && typeof prev === 'number') {
      if (Math.abs(value - prev) < 1e-9) return
    }
    const dir =
      typeof value === 'number' && typeof prev === 'number'
        ? (value > prev ? 'up' : 'down')
        : null
    prevRef.current = value
    setState(s => ({ key: s.key + 1, dir }))
  }, [value])

  return state
}


/* ================================================================
   ANIMATED VALUE
   ================================================================ */

function AnimatedValue({ value, className = '', pulseKey, direction, as: Tag = 'b' }) {
  const [pulse, setPulse] = useState(false)
  const firstRef = useRef(true)

  useEffect(() => {
    if (firstRef.current) { firstRef.current = false; return }
    setPulse(true)
    const t = setTimeout(() => setPulse(false), 700)
    return () => clearTimeout(t)
  }, [pulseKey])

  const dirClass = pulse
    ? direction === 'up' ? 'value-pulse-up'
      : direction === 'down' ? 'value-pulse-down'
        : 'value-pulse'
    : ''

  return <Tag className={`tabular-nums ${className} ${dirClass}`}>{value}</Tag>
}


/* ================================================================
   DUAL-MONTH DATE RANGE PICKER
   ================================================================ */

const MONTHS_VI = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
  'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12',
]
const DAYS_VI = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

function DateRangePicker({ fromDate, toDate, onChange }) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(null)
  const [selecting, setSelecting] = useState(null)
  const [viewYear, setViewYear] = useState(() => {
    const d = fromDate ? new Date(fromDate + 'T00:00:00') : new Date()
    return d.getFullYear()
  })
  const [viewMonth, setViewMonth] = useState(() => {
    const d = fromDate ? new Date(fromDate + 'T00:00:00') : new Date()
    return d.getMonth()
  })
  const ref = useRef()

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSelecting(null) } }
    document.addEventListener('mousedown', h)
    document.addEventListener('touchstart', h)
    return () => { document.removeEventListener('mousedown', h); document.removeEventListener('touchstart', h) }
  }, [])

  const toStr = d => {
    if (!d) return ''
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const parseD = s => s ? new Date(s + 'T00:00:00') : null
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate()
  const firstDOW = (y, m) => new Date(y, m, 1).getDay()

  const m2Month = viewMonth === 11 ? 0 : viewMonth + 1
  const m2Year = viewMonth === 11 ? viewYear + 1 : viewYear

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const clickDay = (d) => {
    const ds = toStr(d)
    if (!selecting) {
      setSelecting(ds)
    } else {
      const [lo, hi] = selecting <= ds ? [selecting, ds] : [ds, selecting]
      onChange(lo, hi)
      setSelecting(null)
      setOpen(false)
    }
  }

  const quickSelect = (from, to) => {
    onChange(from, to)
    setSelecting(null)
    setOpen(false)
  }

  const from = parseD(selecting || fromDate)
  const to = selecting ? parseD(hovered) : parseD(toDate)

  const isInRange = (d) => {
    if (!from || !to) return false
    const [lo, hi] = from <= to ? [from, to] : [to, from]
    return d > lo && d < hi
  }

  const renderMonth = (year, month) => {
    const total = daysInMonth(year, month)
    const start = firstDOW(year, month)
    const cells = []
    for (let i = 0; i < start; i++) cells.push(null)
    for (let d = 1; d <= total; d++) cells.push(new Date(year, month, d))

    return (
      <div className="flex-1 min-w-[240px]">
        <div className="text-center text-sm font-semibold text-gray-800 mb-2">
          {MONTHS_VI[month]} {year}
        </div>
        <div className="grid grid-cols-7 mb-1">
          {DAYS_VI.map(d => (
            <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-0.5">
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="w-full aspect-square" />
            const ds = toStr(d)
            const isFrom = (selecting || fromDate) === ds
            const isTo = (!selecting && toDate === ds) || (selecting && hovered === ds)
            const isToday = ds === todayStr()
            const inRange = isInRange(d)

            let cls = 'w-full aspect-square flex items-center justify-center text-xs rounded-full cursor-pointer select-none transition-all duration-150 '
            if (isFrom || isTo) cls += 'bg-blue-600 text-white font-bold scale-110 '
            else if (inRange) cls += 'bg-blue-50 text-blue-700 rounded-none '
            else if (isToday) cls += 'ring-1 ring-blue-400 text-blue-600 font-semibold hover:bg-blue-50 '
            else cls += 'text-gray-700 hover:bg-gray-100 '

            return (
              <div key={i} className="flex items-center justify-center">
                <div
                  className={cls}
                  onClick={() => clickDay(d)}
                  onMouseEnter={() => setHovered(ds)}
                  onMouseLeave={() => setHovered(null)}
                >
                  {d.getDate()}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  const isSameDay = fromDate === toDate
  const label = isSameDay
    ? fmtDateShort(fromDate)
    : `${fmtDateShort(fromDate)} → ${fmtDateShort(toDate)}`

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-blue-400 transition-colors shadow-sm"
      >
        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="font-medium whitespace-nowrap">{label}</span>
        <svg className={`w-3 h-3 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 z-50 bg-white rounded-2xl shadow-2xl border border-gray-100 p-5 animate-fade-in"
          style={{ width: 'min(580px, calc(100vw - 32px))' }}
        >
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-lg transition-colors">
              ‹
            </button>
            <div className="flex-1" />
            <button onClick={nextMonth}
              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 text-lg transition-colors">
              ›
            </button>
          </div>

          <div className="flex gap-6 flex-wrap sm:flex-nowrap">
            {renderMonth(viewYear, viewMonth)}
            {renderMonth(m2Year, m2Month)}
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-1.5">
            {[
              { l: 'Hôm nay', fn: () => { const t = todayStr(); quickSelect(t, t) } },
              { l: '7 ngày', fn: () => { const t = new Date(); const f = new Date(t); f.setDate(f.getDate() - 6); quickSelect(toStr(f), toStr(t)) } },
              { l: '30 ngày', fn: () => { const t = new Date(); const f = new Date(t); f.setDate(f.getDate() - 29); quickSelect(toStr(f), toStr(t)) } },
              { l: 'Tháng này', fn: () => { const t = new Date(); const f = new Date(t.getFullYear(), t.getMonth(), 1); quickSelect(toStr(f), toStr(t)) } },
              {
                l: 'Tháng trước', fn: () => {
                  const t = new Date(); const f = new Date(t.getFullYear(), t.getMonth() - 1, 1)
                  const e = new Date(t.getFullYear(), t.getMonth(), 0)
                  quickSelect(toStr(f), toStr(e))
                }
              },
            ].map(({ l, fn }) => (
              <button key={l} onClick={fn}
                className="px-2.5 py-1 text-xs rounded-md bg-gray-50 text-gray-600 hover:bg-blue-50 hover:text-blue-700 transition-colors font-medium">
                {l}
              </button>
            ))}
          </div>

          {selecting && (
            <p className="mt-2 text-xs text-blue-600 text-center font-medium">Chọn ngày kết thúc...</p>
          )}
        </div>
      )}
    </div>
  )
}


/* ================================================================
   SUMMARY CARD
   ================================================================ */

function SummaryCard({
  label, value, sub,
  valueClass = 'text-gray-900',
  pulseKey, direction,
}) {
  const [pulse, setPulse] = useState(false)
  const firstRef = useRef(true)

  useEffect(() => {
    if (firstRef.current) { firstRef.current = false; return }
    setPulse(true)
    const t = setTimeout(() => setPulse(false), 700)
    return () => clearTimeout(t)
  }, [pulseKey])

  const dirClass = pulse
    ? direction === 'up' ? 'value-pulse-up'
      : direction === 'down' ? 'value-pulse-down'
        : 'value-pulse'
    : ''

  return (
    <div className="bg-white rounded-xl border border-gray-200/80 px-4 py-3 shadow-sm hover:shadow-md transition-shadow">
      <p className="text-[11px] text-gray-500 font-medium mb-0.5 truncate">{label}</p>
      <p className={`text-base sm:text-lg font-bold tabular-nums leading-tight ${valueClass} ${dirClass}`}>{value}</p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{sub}</p>}
    </div>
  )
}


/* ================================================================
   SIGNAL CARD (mobile)
   ================================================================ */

function SignalCard({ signal: s, isNew }) {
  const [touched, setTouched] = useState(false)
  const ev = evStyle(s.eventType)
  const isBalance = ['DEPOSIT', 'WITHDRAWAL', 'BALANCE_ADJUSTMENT'].includes(s.eventType)
  const isClose = ['CLOSE_ALL', 'CLOSE_PARTIAL'].includes(s.eventType)
  const netProfit = isClose
    ? (s.dealProfit || 0) + (s.commission || 0) + (s.swap || 0) + (s.fee || 0)
    : null

  return (
    <div
      className={`bg-white rounded-xl border border-gray-200/80 p-3.5 shadow-sm transition-all duration-200 ${touched ? 'bg-blue-50/40 scale-[0.99]' : ''} ${isNew ? 'signal-enter' : ''}`}
      onTouchStart={() => setTouched(true)}
      onTouchEnd={() => setTimeout(() => setTouched(false), 200)}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${ev.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${ev.dot}`} />
            {s.eventType}
          </span>
          {s.direction && (
            <span className={`text-xs font-bold ${s.direction === 'BUY' ? 'text-emerald-600' : 'text-rose-500'}`}>
              {s.direction}
            </span>
          )}
        </div>
        <span className="text-[11px] text-gray-400 tabular-nums">{fmtTime(s.createdAt)}</span>
      </div>

      {isBalance ? (
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-gray-600">{s.comment || s.eventType}</span>
          <span className={`text-base font-bold tabular-nums ${(s.amount || 0) >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
            {fmtCent(s.amount)}
          </span>
        </div>
      ) : (
        <>
          <div className="flex items-baseline justify-between mb-1.5">
            <span className="text-sm font-semibold text-gray-900">{s.symbol || '—'}</span>
            {s.volume != null && (
              <span className="text-xs text-gray-500 tabular-nums">{fmtVN(s.volume, 2)} lot</span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            {s.openPrice != null && (
              <div className="flex justify-between">
                <span className="text-gray-400">Mở</span>
                <span className="tabular-nums text-gray-700">{fmtPrice(s.openPrice)}</span>
              </div>
            )}
            {s.closePrice != null && (
              <div className="flex justify-between">
                <span className="text-gray-400">Đóng</span>
                <span className="tabular-nums text-gray-700">{fmtPrice(s.closePrice)}</span>
              </div>
            )}
          </div>
          {netProfit != null && (
            <div className="mt-2 pt-2 border-t border-gray-100 flex justify-between items-baseline">
              <span className="text-xs text-gray-400">Profit</span>
              <span className={`text-sm font-bold tabular-nums ${netProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                {fmtCent(netProfit)}
              </span>
            </div>
          )}
        </>
      )}

      <div className="mt-2 pt-2 border-t border-gray-100 flex gap-3 text-[10px] text-gray-400 tabular-nums">
        {s.balance != null && <span>Bal: {fmtCent(s.balance)}</span>}
        {s.equity != null && <span>Eq: {fmtCent(s.equity)}</span>}
        {s.credit > 0 && <span>Cr: {fmtCent(s.credit)}</span>}
      </div>
    </div>
  )
}


/* ================================================================
   SIGNAL ROW (desktop)
   ================================================================ */

function SignalRow({ signal: s, isNew }) {
  const ev = evStyle(s.eventType)
  const isBalance = ['DEPOSIT', 'WITHDRAWAL', 'BALANCE_ADJUSTMENT'].includes(s.eventType)
  const isClose = ['CLOSE_ALL', 'CLOSE_PARTIAL'].includes(s.eventType)
  const netProfit = isClose
    ? (s.dealProfit || 0) + (s.commission || 0) + (s.swap || 0) + (s.fee || 0)
    : null

  return (
    <tr className={`border-b border-gray-100 transition-colors duration-150 hover:bg-blue-50/40 active:bg-blue-100/40 cursor-default ${isNew ? 'signal-enter' : ''}`}>
      <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap tabular-nums text-xs">
        {fmtTime(s.createdAt)}
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${ev.badge}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${ev.dot}`} />
          {s.eventType}
        </span>
      </td>
      <td className="px-3 py-2.5 whitespace-nowrap">
        {s.direction ? (
          <span className={`text-xs font-bold ${s.direction === 'BUY' ? 'text-emerald-600' : 'text-rose-500'}`}>
            {s.direction}
          </span>
        ) : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-gray-700 whitespace-nowrap">
        {s.volume != null ? fmtVN(s.volume, 2) : '—'}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-gray-700 whitespace-nowrap">
        {s.openPrice != null ? fmtPrice(s.openPrice) : '—'}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-gray-700 whitespace-nowrap">
        {s.closePrice != null ? fmtPrice(s.closePrice) : '—'}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap font-semibold">
        {isBalance ? (
          <span className={(s.amount || 0) >= 0 ? 'text-emerald-600' : 'text-rose-500'}>
            {fmtCent(s.amount)}
          </span>
        ) : netProfit != null ? (
          <span className={netProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'}>
            {fmtCent(netProfit)}
          </span>
        ) : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-3 py-2.5 text-right tabular-nums text-gray-600 whitespace-nowrap">
        {s.balance != null ? fmtCent(s.balance) : '—'}
      </td>
    </tr>
  )
}


/* ================================================================
   MAIN PAGE
   ================================================================ */

export default function ExnessPage() {
  const [fromDate, setFromDate] = useState(todayStr())
  const [toDate, setToDate] = useState(todayStr())
  const [signals, setSignals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [connected, setConnected] = useState(false)
  const [newIds, setNewIds] = useState(new Set())
  const clientRef = useRef(null)

  const isToday = fromDate === todayStr() && toDate === todayStr()
  const isSingleDay = fromDate === toDate

  /* ── fetch ────────────────────────────────────────────────────── */

  const fetchSignals = useCallback(async (from, to) => {
    setLoading(true)
    setError(null)
    try {
      const url = from === to
        ? `${BASE}/api/public/mt5/signals?date=${from}`
        : `${BASE}/api/public/mt5/signals?from=${from}&to=${to}`
      const res = await fetch(url)
      const data = await res.json()
      if (data.success) {
        setSignals(data.signals || [])
      } else {
        setError(data.message || 'Không tải được dữ liệu')
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSignals(fromDate, toDate)
  }, [fromDate, toDate, fetchSignals])

  const handleDateChange = useCallback((from, to) => {
    setFromDate(from)
    setToDate(to)
  }, [])

  /* ── WebSocket ────────────────────────────────────────────────── */

  useEffect(() => {
    const wsUrl = BASE.replace(/^http/, 'http') + '/ws'

    const client = new Client({
      webSocketFactory: () => new SockJS(wsUrl),
      reconnectDelay: 3000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      onConnect: () => {
        setConnected(true)
        client.subscribe('/topic/mt5-signals', (msg) => {
          try {
            const signal = JSON.parse(msg.body)
            const today = todayStr()
            if (fromDate !== today || toDate !== today) return

            setSignals(prev => {
              const idx = prev.findIndex(s => s.id === signal.id)
              if (idx === -1) {
                // brand new signal → prepend
                return [signal, ...prev]
              }
              // same id → update in place (balance/equity có thể đã đổi)
              const next = prev.slice()
              next[idx] = { ...next[idx], ...signal }
              return next
            })

            setNewIds(prev => new Set(prev).add(signal.id))
            setTimeout(() => {
              setNewIds(prev => {
                const next = new Set(prev)
                next.delete(signal.id)
                return next
              })
            }, 900)
          } catch (e) {
            console.error('WS parse error', e)
          }
        })
      },
      onDisconnect: () => setConnected(false),
      onStompError: () => setConnected(false),
    })

    client.activate()
    clientRef.current = client
    return () => { client.deactivate() }
  }, [fromDate, toDate])

  /* ── computed summary ─────────────────────────────────────────── */

  const summary = useMemo(() => {
    const trades = signals.filter(s => ['OPEN', 'CLOSE_ALL', 'CLOSE_PARTIAL'].includes(s.eventType))
    const closes = signals.filter(s => ['CLOSE_ALL', 'CLOSE_PARTIAL'].includes(s.eventType))
    const totalTrades = trades.length
    const totalLot = closes.reduce((sum, s) => sum + (s.volume || 0), 0)

    const totalProfit = closes.reduce((sum, s) =>
      sum + (s.dealProfit || 0) + (s.commission || 0) + (s.swap || 0) + (s.fee || 0), 0)

    const totalDeposit = signals
      .filter(s => s.eventType === 'DEPOSIT')
      .reduce((sum, s) => sum + (s.amount || 0), 0)
    const totalWithdrawal = signals
      .filter(s => s.eventType === 'WITHDRAWAL')
      .reduce((sum, s) => sum + Math.abs(s.amount || 0), 0)

    const latest = signals.length > 0 ? signals[0] : null
    const floatingPL = latest
      ? (latest.equity || 0) - (latest.balance || 0) - (latest.credit || 0)
      : null

    const maxDrawdown = calcMaxDrawdown(signals)

    return {
      totalTrades, totalLot, totalProfit,
      totalDeposit, totalWithdrawal,
      floatingPL, maxDrawdown, latest,
    }
  }, [signals])

  /* ── per-metric pulses ────────────────────────────────────────── */

  const pTrades = useValuePulse(summary.totalTrades)
  const pLot = useValuePulse(summary.totalLot)
  const pProfit = useValuePulse(summary.totalProfit)
  const pFloat = useValuePulse(summary.floatingPL)
  const pDD = useValuePulse(summary.maxDrawdown)
  const pDeposit = useValuePulse(summary.totalDeposit)
  const pWithdraw = useValuePulse(summary.totalWithdrawal)

  const pBal = useValuePulse(summary.latest?.balance)
  const pEq = useValuePulse(summary.latest?.equity)
  const pCr = useValuePulse(summary.latest?.credit)
  const pReal = useValuePulse(summary.floatingPL)

  /* ── render ──────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gray-50/80">

      <header className="bg-white/95 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-30">
        <div className="w-full px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-sm">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <h1 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight">Trade Signals</h1>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${connected ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
              {connected ? 'Live' : 'Offline'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <DateRangePicker fromDate={fromDate} toDate={toDate} onChange={handleDateChange} />
            <button
              onClick={() => { setFromDate(todayStr()); setToDate(todayStr()) }}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${isToday
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
            >
              Hôm nay
            </button>
          </div>
        </div>
      </header>

      <main className="w-full px-4 sm:px-6 py-4">

        {/* ── summary cards ────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 mb-4">
          <SummaryCard
            label="Số lệnh"
            value={summary.totalTrades}
            pulseKey={pTrades.key} direction={pTrades.dir}
          />
          <SummaryCard
            label="Tổng lot"
            value={fmtVN(summary.totalLot, 2)}
            pulseKey={pLot.key} direction={pLot.dir}
          />
          <SummaryCard
            label="P/L"
            value={fmtCent(summary.totalProfit)}
            valueClass={summary.totalProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'}
            pulseKey={pProfit.key} direction={pProfit.dir}
          />
          <SummaryCard
            label="Floating P/L"
            value={summary.floatingPL != null ? fmtCent(summary.floatingPL) : '—'}
            valueClass={summary.floatingPL != null
              ? (summary.floatingPL >= 0 ? 'text-emerald-600' : 'text-rose-500')
              : 'text-gray-400'}
            sub=""
            pulseKey={pFloat.key} direction={pFloat.dir}
          />
          <SummaryCard
            label="Max Drawdown"
            value={summary.maxDrawdown < 0 ? `${fmtVN(summary.maxDrawdown)}%` : '—'}
            valueClass="text-rose-500"
            sub={``}
            pulseKey={pDD.key}
            direction={pDD.dir}
          />
          <SummaryCard
            label="Tổng Nạp"
            value={fmtCent(summary.totalDeposit)}
            valueClass="text-emerald-600"
            pulseKey={pDeposit.key} direction={pDeposit.dir}
          />
          <SummaryCard
            label="Tổng Rút"
            value={fmtCent(summary.totalWithdrawal)}
            valueClass="text-rose-500"
            pulseKey={pWithdraw.key} direction={pWithdraw.dir}
          />
        </div>

        {/* ── account info bar ─────────────────────────────────── */}
        {summary.latest && (
          <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm px-4 py-2.5 mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <span className="text-gray-500">Balance:{' '}
              <AnimatedValue
                value={fmtCent(summary.latest.balance)}
                className="text-gray-900"
                pulseKey={pBal.key} direction={pBal.dir}
              />
            </span>
            <span className="text-gray-500">Equity:{' '}
              <AnimatedValue
                value={fmtCent(summary.latest.equity)}
                className="text-gray-900"
                pulseKey={pEq.key} direction={pEq.dir}
              />
            </span>
            {summary.latest.credit > 0 && (
              <span className="text-gray-500">Credit:{' '}
                <AnimatedValue
                  value={fmtCent(summary.latest.credit)}
                  className="text-gray-900"
                  pulseKey={pCr.key} direction={pCr.dir}
                />
              </span>
            )}
            <span className="text-gray-500">Real P/L:{' '}
              <AnimatedValue
                value={fmtCent(summary.floatingPL)}
                className={summary.floatingPL >= 0 ? 'text-emerald-600' : 'text-rose-500'}
                pulseKey={pReal.key} direction={pReal.dir}
              />
            </span>
          </div>
        )}

        {/* ── content ──────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-24 text-rose-500 text-sm">{error}</div>
        ) : signals.length === 0 ? (
          <div className="text-center py-24">
            <div className="text-gray-300 text-4xl mb-3">📭</div>
            <p className="text-gray-400 text-sm">Không có tín hiệu nào trong khoảng thời gian đã chọn</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/80 border-b border-gray-200">
                      {['Thời gian', 'Sự kiện', 'Side', 'Lot', 'Giá mở', 'Giá đóng', 'Profit', 'Balance'].map((h, i) => (
                        <th key={h} className={`px-3 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap ${i >= 3 ? 'text-right' : 'text-left'}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {signals.map((s, i) => (
                      <SignalRow key={s.id || i} signal={s} isNew={newIds.has(s.id)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden flex flex-col gap-2.5">
              {signals.map((s, i) => (
                <SignalCard key={s.id || i} signal={s} isNew={newIds.has(s.id)} />
              ))}
            </div>
          </>
        )}

        {isToday && !loading && (
          <p className="text-center text-[11px] text-gray-400 mt-4">
            Dữ liệu realtime qua WebSocket — tín hiệu mới tự cập nhật đầu bảng
          </p>
        )}
      </main>

      {/* ── animations ─────────────────────────────────────────── */}
      <style>{`
        @keyframes signalFadeIn {
          0%   { opacity: 0; transform: translateY(-16px) scale(0.97); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .signal-enter {
          animation: signalFadeIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        @keyframes valuePulse {
          0%   { transform: scale(1);    filter: brightness(1); }
          30%  { transform: scale(1.08); filter: brightness(1.15); }
          100% { transform: scale(1);    filter: brightness(1); }
        }
        .value-pulse {
          animation: valuePulse 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
        }

        @keyframes valuePulseUp {
          0%   { transform: scale(1);    background: transparent; }
          30%  { transform: scale(1.10); background: rgba(16, 185, 129, 0.18); }
          100% { transform: scale(1);    background: transparent; }
        }
        @keyframes valuePulseDown {
          0%   { transform: scale(1);    background: transparent; }
          30%  { transform: scale(1.10); background: rgba(244, 63, 94, 0.18); }
          100% { transform: scale(1);    background: transparent; }
        }
        .value-pulse-up {
          animation: valuePulseUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
          border-radius: 4px;
        }
        .value-pulse-down {
          animation: valuePulseDown 0.7s cubic-bezier(0.16, 1, 0.3, 1) both;
          border-radius: 4px;
        }
      `}</style>
    </div>
  )
}