import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import ConfirmModal from '../components/common/ConfirmModal'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:9009'
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

const calcNet = (t) => Number(t.profit || 0) + Number(t.commission || 0) + Number(t.swap || 0) + Number(t.fee || 0)
const profitSign = (v) => v > 0.001 ? '+' : ''
const profitClass = (v) => v > 0.001 ? 'text-emerald-600' : v < -0.001 ? 'text-rose-500' : 'text-gray-400'

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
   STATE BADGE / BUTTON
   ================================================================ */
const STATE_META = {
  RUNNING:  { label: 'ĐANG CHẠY',    dot: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-50',  border: 'border-emerald-200',  pulse: true  },
  PAUSED:   { label: 'TẠM DỪNG',     dot: 'bg-amber-400',   text: 'text-amber-700',   bg: 'bg-amber-50',    border: 'border-amber-200',    pulse: false },
  STOPPING: { label: 'ĐÃ TẮT',       dot: 'bg-rose-500',    text: 'text-rose-700',    bg: 'bg-rose-50',     border: 'border-rose-200',     pulse: true  },
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
   DATE RANGE PICKER (giữ gọn — dropdown đơn giản)
   ================================================================ */
const MONTHS_VI = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12']
const DAYS_VI = ['CN','T2','T3','T4','T5','T6','T7']
function CalendarMonth({ year, month, startKey, endKey, hoverKey, onDayClick, onDayHover, todayKey }) {
  const days = daysInMonth(year, month)
  const startDow = dow0(year, month)
  const cells = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= days; d++) cells.push(d)
  return (
    <div className="select-none">
      <div className="text-center text-sm font-semibold text-gray-700 mb-2">{MONTHS_VI[month]} {year}</div>
      <div className="grid grid-cols-7 mb-1">
        {DAYS_VI.map(d => <div key={d} className="text-center text-[10px] font-medium text-gray-400 py-0.5">{d}</div>)}
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
                ${!isEdge && (inRange || inHover) ? 'bg-violet-100 text-violet-700' : ''}
                ${!isEdge && !inRange && !inHover ? 'text-gray-700 hover:bg-gray-100' : ''}
                ${isToday && !isEdge ? 'ring-1 ring-violet-400' : ''}`}>{d}</button>
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
  const ref = useRef(null)
  const rightYear = leftMonth === 11 ? leftYear + 1 : leftYear
  const rightMonth = leftMonth === 11 ? 0 : leftMonth + 1
  const prevMonth = () => { if (leftMonth === 0) { setLeftYear(y => y - 1); setLeftMonth(11) } else setLeftMonth(m => m - 1) }
  const nextMonth = () => { if (rightMonth === 11) { setLeftYear(y => y + 1); setLeftMonth(0) } else setLeftMonth(m => m + 1) }
  const handleDayClick = (k) => {
    if (!startKey || (startKey && endKey)) onChange(k, null)
    else { if (isBefore(k, startKey)) onChange(k, startKey); else onChange(startKey, k); setOpen(false) }
  }
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler); return () => document.removeEventListener('mousedown', handler)
  }, [open])
  const fmtDisplay = (k) => { if (!k) return ''; const { y, m, d } = parseKey(k); return `${String(d).padStart(2,'0')}/${String(m+1).padStart(2,'0')}/${y}` }
  const label = startKey && endKey ? (startKey === endKey ? fmtDisplay(startKey) : `${fmtDisplay(startKey)} – ${fmtDisplay(endKey)}`) : startKey ? `${fmtDisplay(startKey)} – ...` : 'Chọn ngày'
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 shadow-sm transition-colors whitespace-nowrap">
        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <span>{label}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl shadow-xl border border-gray-200 p-4" style={{ minWidth: 560 }}>
          <div className="flex items-center justify-between mb-3">
            <button onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">◀</button>
            <button onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">▶</button>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <CalendarMonth year={leftYear} month={leftMonth} startKey={startKey} endKey={endKey} hoverKey={hoverKey} todayKey={todayKey} onDayClick={handleDayClick} onDayHover={setHoverKey} />
            <CalendarMonth year={rightYear} month={rightMonth} startKey={startKey} endKey={endKey} hoverKey={hoverKey} todayKey={todayKey} onDayClick={handleDayClick} onDayHover={setHoverKey} />
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-gray-100">
            {[
              { label: 'Hôm nay', fn: () => { const k = dateKey(today.y, today.m, today.d); onChange(k, k); setOpen(false) } },
              { label: '7 ngày', fn: () => { const from = new Date(Date.now() + GMT7 - 6 * 86400000); onChange(dateKey(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()), dateKey(today.y, today.m, today.d)); setOpen(false) } },
              { label: '30 ngày', fn: () => { const from = new Date(Date.now() + GMT7 - 29 * 86400000); onChange(dateKey(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()), dateKey(today.y, today.m, today.d)); setOpen(false) } },
              { label: 'Tháng này', fn: () => { onChange(dateKey(today.y, today.m, 1), dateKey(today.y, today.m, today.d)); setOpen(false) } },
            ].map(({ label, fn }) => (
              <button key={label} onClick={fn} className="px-2.5 py-1 text-[11px] rounded-md bg-gray-100 hover:bg-violet-100 hover:text-violet-700 text-gray-600 font-medium">{label}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ================================================================
   LOT MODAL (chỉ cho sửa khi PAUSED)
   - Chấp nhận cả "." và "," làm dấu thập phân
   - Tối đa 2 số sau thập phân
   - Min 0.01
   - Bỏ spinner (type="text" + inputMode="decimal")
   - Auto-select khi click
   ================================================================ */
const LOT_MIN = 0.01

/** Chuẩn hóa string lot: trả về {text, number|null}.
 *  Accept rỗng, "0", "0.", "0.0", "0.01", "0,5", "1.23", "12".
 *  Reject: nhiều dấu thập phân, > 2 số sau thập phân, chữ cái.
 */
function normalizeLotInput(raw) {
  if (raw == null) return { text: '', number: null }
  // Thay dấu "," → "." để parse. Hiển thị giữ nguyên dấu user gõ.
  let s = String(raw).trim()
  // Chỉ cho ký tự số + 1 dấu , hoặc .
  s = s.replace(/[^\d.,]/g, '')
  // Nếu có cả "." và "," → chỉ giữ ký tự đầu tiên gặp
  const firstSep = s.search(/[.,]/)
  if (firstSep >= 0) {
    const sep = s[firstSep]
    // Chỉ 1 dấu thập phân: xóa tất cả dấu phân cách còn lại trong phần sau
    const head = s.slice(0, firstSep)
    const tail = s.slice(firstSep + 1).replace(/[.,]/g, '')
    s = head + sep + tail.slice(0, 2)   // cắt max 2 số sau thập phân
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
    // Hiển thị lot hiện tại với format đẹp (bỏ 0 thừa, giữ ít nhất 2 số thập phân nếu có)
    const init = current && current > 0 ? Number(current).toFixed(2).replace(/\.?0+$/, '') : ''
    setText(init || String(current ?? ''))
    // Auto-focus + select hết sau khi modal render
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
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-5">
          <h3 className="text-base font-bold text-gray-900">Sửa lot</h3>
          {!canEdit ? (
            <p className="mt-2 text-sm text-rose-600">Bot đang <b>CHẠY</b> — hãy ngưng hoặc tắt bot trước khi sửa lot.</p>
          ) : (
            <>
              <p className="mt-1 text-sm text-gray-500">
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
                className={`mt-3 w-full h-11 px-3 rounded-lg border text-base tabular-nums focus:outline-none focus:ring-2
                  ${invalid && text ? 'border-rose-300 focus:ring-rose-200' : 'border-gray-300 focus:ring-violet-200'}`}
              />
              {errMsg && <p className="mt-2 text-sm text-rose-600">{errMsg}</p>}
            </>
          )}
        </div>
        <div className="flex gap-2 p-4 pt-0">
          <button onClick={onClose} disabled={saving} className="flex-1 h-11 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">Hủy</button>
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
   STOP MODAL (yêu cầu passcode)
   ================================================================ */
function StopPasscodeModal({ open, saving, error, onClose, onConfirm }) {
  const [pass, setPass] = useState('')
  useEffect(() => { if (open) setPass('') }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" onClick={saving ? undefined : onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-lg bg-rose-100 text-rose-600">⚠</div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-gray-900">Tắt bot</h3>
              <p className="mt-1 text-sm text-gray-500">Bot sẽ chuyển sang trạng thái TẮT, không mở lệnh mới và sẽ <b>đóng hết lệnh đang mở</b>. Nhập passcode để xác nhận.</p>
            </div>
          </div>
          <input type="password" value={pass} autoFocus
            onChange={e => setPass(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && pass) onConfirm(pass) }}
            placeholder="Passcode"
            className="mt-4 w-full h-11 px-3 rounded-lg border border-gray-300 text-base tracking-widest focus:outline-none focus:ring-2 focus:ring-rose-200" />
          {error && <p className="mt-2 text-sm text-rose-600">{error}</p>}
        </div>
        <div className="flex gap-2 p-4 pt-0">
          <button onClick={onClose} disabled={saving} className="flex-1 h-11 rounded-xl border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50">Hủy</button>
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
    <thead className="sticky top-0 z-10 bg-white">
      <tr className="border-b border-gray-100">
        {cols.map((c, i) => {
          const label = typeof c === 'string' ? c : c.label
          const hideM = typeof c === 'object' && c.hideOnMobile
          return (
            <th key={label}
              className={`px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap
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
    <tr className={`border-b border-gray-100 ${isNew ? 'row-enter' : 'hover:bg-blue-50/40'}`}>
      <td className="px-3 py-2.5 text-[11px] text-gray-400 tabular-nums font-mono">#{pos.ticket}</td>
      <td className="px-3 py-2.5 hidden md:table-cell">
        <span className={`text-xs font-bold ${pos.direction === 'BUY' ? 'text-emerald-600' : 'text-rose-500'}`}>{pos.direction}</span>
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-700 font-medium">{pos.symbol || '—'}</td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-gray-700">{fmtVN(pos.volume, 2)}</td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-gray-600">{fmtPrice(pos.openPrice)}</td>
      <td className={`px-3 py-2.5 text-right text-xs tabular-nums font-semibold ${profitClass(pl)}`}>{`${profitSign(pl)}${fmtVN(pl)}`}</td>
      <td className="px-3 py-2.5 text-right text-xs text-gray-400 tabular-nums hidden md:table-cell">{fmtTime(pos.openTime)}</td>
    </tr>
  )
}

function ClosedRow({ trade: t }) {
  const dir = t.direction === 'BUY'
  const net = calcNet(t)
  return (
    <tr className="border-b border-gray-100 hover:bg-amber-50/40">
      <td className="px-3 py-2.5 text-[11px] text-gray-400 tabular-nums font-mono">#{t.ticket}</td>
      <td className="px-3 py-2.5 hidden md:table-cell">
        <span className={`text-xs font-bold ${dir ? 'text-emerald-600' : 'text-rose-500'}`}>{t.direction}</span>
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-700 font-medium">{t.symbol || '—'}</td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-gray-700">{fmtVN(t.volume, 2)}</td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-gray-500 hidden md:table-cell">{fmtPrice(t.openPrice)}</td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-gray-500">{fmtPrice(t.closePrice)}</td>
      <td className={`px-3 py-2.5 text-right text-xs tabular-nums font-semibold ${profitClass(net)}`}>{`${profitSign(net)}${fmtVN(net)}`}</td>
      <td className="px-3 py-2.5 text-right text-xs text-gray-400 tabular-nums hidden md:table-cell">{fmtTime(t.closeTime)}</td>
    </tr>
  )
}

/* ================================================================
   MAIN
   ================================================================ */
export default function ExnessPage() {
  const [accounts, setAccounts] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [account, setAccount] = useState(null)       // detail (có openPositions)
  const [closedList, setClosedList] = useState([])
  const [closedTotals, setClosedTotals] = useState({ lot: 0, profit: 0 })
  const [loadingHistory, setLoadingHistory] = useState(false)
  const [connected, setConnected] = useState(false)
  const [toast, setToast] = useState(null)

  // Modal states
  const [confirmAction, setConfirmAction] = useState(null) // { type: 'RUN'|'PAUSE', ... }
  const [actionBusy, setActionBusy] = useState(false)
  const [lotOpen, setLotOpen] = useState(false)
  const [lotSaving, setLotSaving] = useState(false)
  const [lotError, setLotError] = useState(null)
  const [stopOpen, setStopOpen] = useState(false)
  const [stopSaving, setStopSaving] = useState(false)
  const [stopError, setStopError] = useState(null)

  const initToday = () => { const t = todayGmt7(); return dateKey(t.y, t.m, t.d) }
  const [dateStart, setDateStart] = useState(initToday)
  const [dateEnd, setDateEnd]     = useState(initToday)

  const clientRef = useRef(null)

  const showToast = useCallback((msg, ms = 3500) => {
    setToast(msg); setTimeout(() => setToast(null), ms)
  }, [])

  // ---- Load account list ----
  const refreshAccounts = useCallback(() => {
    return fetch(`${BASE}/api/public/mt5-bot/accounts`).then(r => r.json()).then(d => {
      const items = d.items || []
      setAccounts(items)
      setSelectedId(prev => {
        if (prev && items.some(a => a.id === prev)) return prev
        return items.length > 0 ? items[0].id : null
      })
    }).catch(console.error)
  }, [])
  useEffect(() => {
    refreshAccounts()
    const t = setInterval(refreshAccounts, 30_000)
    return () => clearInterval(t)
  }, [refreshAccounts])

  // ---- Load account detail (manually, WS updates it after) ----
  const refreshAccount = useCallback(async (id) => {
    if (!id) return
    try {
      const r = await fetch(`${BASE}/api/public/mt5-bot/accounts/${id}`)
      const d = await r.json()
      if (d.success) setAccount(d.account)
    } catch (e) { console.error(e) }
  }, [])
  useEffect(() => { if (selectedId) refreshAccount(selectedId) }, [selectedId, refreshAccount])

  // ---- Load history ----
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

  // ---- WebSocket ----
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
            // Nếu có closed order mới xuất hiện trong khoảng ngày hiện tại → reload history
            // (đơn giản: nếu latestClosedTicket thay đổi so với cũ sẽ reload)
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

  // reload history khi latest ticket tăng
  const lastTicketRef = useRef(0)
  useEffect(() => {
    if (!account) return
    if (account.latestClosedTicket > lastTicketRef.current) {
      lastTicketRef.current = account.latestClosedTicket
      refreshHistory(selectedId, dateStart, dateEnd)
    }
  }, [account, selectedId, dateStart, dateEnd, refreshHistory])

  // ---- Derived ----
  const openPositions = account?.openPositions || []
  const openLot = useMemo(() => openPositions.reduce((s, p) => s + Number(p.volume || 0), 0), [openPositions])
  const openPnL = useMemo(() => openPositions.reduce((s, p) => s + Number(p.profit || 0), 0), [openPositions])
  const openPulse = useValuePulse(openPnL)
  const closedPulse = useValuePulse(closedTotals.profit)
  const equity = account?.equity ?? null
  const equityPulse = useValuePulse(equity)
  const state = account?.state || 'PAUSED'

  // ---- Actions ----
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
  const requestPause   = () => setConfirmAction({ type: 'PAUSE' })
  const requestStop    = () => setStopOpen(true)
  const requestEditLot = () => { setLotError(null); setLotOpen(true) }

  const canEditLot = state !== 'RUNNING'   // PAUSED hoặc STOPPING đều cho sửa
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
    <div className="min-h-[100dvh] md:h-[100dvh] bg-gray-50 text-gray-900 flex flex-col md:overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap z-30 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l4-8 4 4 4-7 4 8" />
            </svg>
          </div>
          <span className="text-base font-bold tracking-tight">MT5 Bot Monitor</span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${connected ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
            {connected ? 'Live' : 'Offline'}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {accounts.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 hidden sm:inline">Tài khoản</span>
              <select value={selectedId || ''} onChange={e => setSelectedId(Number(e.target.value))}
                className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 pr-8 text-sm text-gray-700 focus:outline-none focus:border-violet-500 cursor-pointer shadow-sm">
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name ? `${a.name} · ${a.login}` : a.login} ({a.server})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </header>

      {/* ===== Account summary bar ===== */}
      {account && (
        <section className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <StateBadge state={state} />
            <div className="text-sm">
              <span className="text-gray-500 mr-1">Login:</span><b className="tabular-nums">{account.login}</b>
              {account.name && <span className="ml-2 text-gray-500">· {account.name}</span>}
              <span className="ml-2 text-gray-400 text-xs">· {account.server}</span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap tabular-nums">
            <span>Lot cấu hình: <b className="text-gray-800">{fmtVN(currentLot, 2)}</b></span>
            {account.balance != null && <span>Balance: <b className="text-gray-800">{fmtVN(account.balance)}</b></span>}
            {equity != null && (
              <span>Equity:{' '}
                <AnimatedValue value={fmtVN(equity)} className={`${equity >= (account.balance || equity) ? 'text-emerald-600' : 'text-rose-500'}`}
                  pulseKey={equityPulse.key} direction={equityPulse.dir} />
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={requestEditLot} disabled={actionBusy}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50">
              ⚙ Sửa lot
            </button>
            {/* Slot 1: Tạm dừng (RUNNING) ↔ Tiếp tục (PAUSED/STOPPING) */}
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

            {/* Slot 2: Tắt (RUNNING/PAUSED) ↔ Khởi động (STOPPING) */}
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
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-gray-400 text-sm">Chưa có tài khoản nào kết nối.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:flex-1 md:min-h-0">
            {/* LEFT: Open */}
            <div className="bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden shadow-sm md:min-h-0">
              <div className="px-4 py-2.5 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2 bg-gray-50">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500" />
                  <span className="text-sm font-semibold text-gray-800">Lệnh đang mở</span>
                </div>
                <div className="flex items-center gap-3 text-xs tabular-nums flex-wrap">
                  <span className="text-gray-500">{openPositions.length} lệnh</span>
                  <span className="text-gray-500">Lot: <b className="text-gray-700">{fmtVN(openLot, 2)}</b></span>
                  <span className="text-gray-500">P/L:{' '}
                    <AnimatedValue value={`${profitSign(openPnL)}${fmtVN(openPnL)}`} className={profitClass(openPnL)} pulseKey={openPulse.key} direction={openPulse.dir} />
                  </span>
                </div>
              </div>
              <div className="flex-1 overflow-auto min-h-0">
                {openPositions.length === 0 ? (
                  <div className="py-16 text-center text-gray-300 text-sm">Không có lệnh nào đang mở</div>
                ) : (
                  <table className="w-full text-sm min-w-[380px]">
                    <TableHead cols={OPEN_COLS} />
                    <tbody>{openPositions.map(p => <OpenRow key={p.ticket} pos={p} />)}</tbody>
                  </table>
                )}
              </div>
            </div>

            {/* RIGHT: History */}
            <div className="bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden shadow-sm md:min-h-0">
              <div className="px-4 py-2.5 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2 bg-gray-50">
                <div className="flex items-center gap-2.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-sm font-semibold text-gray-800">Lịch sử</span>
                </div>
                <div className="flex items-center gap-3 text-xs tabular-nums flex-wrap">
                  <span className="text-gray-500">{closedList.length} lệnh</span>
                  <span className="text-gray-500">Lot: <b className="text-gray-700">{fmtVN(closedTotals.lot, 2)}</b></span>
                  <span className="text-gray-500">P/L:{' '}
                    <AnimatedValue value={`${profitSign(closedTotals.profit)}${fmtVN(closedTotals.profit)}`} className={profitClass(closedTotals.profit)} pulseKey={closedPulse.key} direction={closedPulse.dir} />
                  </span>
                  <DateRangePicker startKey={dateStart} endKey={dateEnd} onChange={(s, e) => { setDateStart(s); setDateEnd(e) }} />
                </div>
              </div>
              <div className="overflow-auto md:flex-1 md:min-h-0 h-[500px] md:h-auto">
                {loadingHistory ? (
                  <div className="py-16 text-center text-gray-400 text-sm">Đang tải...</div>
                ) : closedList.length === 0 ? (
                  <div className="py-16 text-center text-gray-300 text-sm">Không có lệnh nào trong khoảng này</div>
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

      {/* ===== Modals ===== */}
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[130] bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg max-w-sm text-center animate-fade-in">{toast}</div>
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