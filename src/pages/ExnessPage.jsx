import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:9009'

/* ================================================================
   HELPERS
   ================================================================ */

const fmtVN = (v, d = 2) => {
  if (v == null || isNaN(Number(v))) return '—'
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: d, maximumFractionDigits: d,
  }).format(Number(v))
}
const fmtPrice = (v) => {
  if (v == null || isNaN(Number(v))) return '—'
  const s = String(v)
  const dec = s.includes('.') ? s.split('.')[1].length : 2
  return fmtVN(v, Math.min(dec, 5))
}
const profitClass = (v) =>
  v > 0 ? 'text-emerald-400' : v < 0 ? 'text-rose-400' : 'text-slate-500'

const fmtTime = (iso) => {
  if (!iso) return '—'
  try {
    const m = String(iso).match(/(\d{2}):(\d{2}):(\d{2})/)
    return m ? `${m[1]}:${m[2]}:${m[3]}` : String(iso).substring(11, 19)
  } catch { return '—' }
}

/* ================================================================
   VALUE PULSE HOOK
   ================================================================ */
function useValuePulse(value) {
  const prevRef = useRef(value)
  const [state, setState] = useState({ key: 0, dir: null })
  useEffect(() => {
    const prev = prevRef.current
    if (prev === value) return
    if (typeof value === 'number' && typeof prev === 'number' && Math.abs(value - prev) < 1e-9) return
    const dir = typeof value === 'number' && typeof prev === 'number'
      ? (value > prev ? 'up' : 'down') : null
    prevRef.current = value
    setState(s => ({ key: s.key + 1, dir }))
  }, [value])
  return state
}

/* ================================================================
   ANIMATED VALUE
   ================================================================ */
function AnimatedValue({ value, className = '', pulseKey, direction }) {
  const [pulse, setPulse] = useState(false)
  const firstRef = useRef(true)
  useEffect(() => {
    if (firstRef.current) { firstRef.current = false; return }
    setPulse(true)
    const t = setTimeout(() => setPulse(false), 700)
    return () => clearTimeout(t)
  }, [pulseKey])
  const dc = pulse
    ? direction === 'up' ? 'val-up' : direction === 'down' ? 'val-down' : 'val-pulse'
    : ''
  return <span className={`tabular-nums font-bold ${className} ${dc}`}>{value}</span>
}

/* ================================================================
   COLUMN HEADER
   ================================================================ */
function ColHeader({ title, count, totalLot, totalPnL, accent }) {
  const pc = totalPnL > 0 ? 'text-emerald-400' : totalPnL < 0 ? 'text-rose-400' : 'text-slate-500'
  return (
    <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${accent}`} />
        <span className="text-sm font-semibold text-slate-200">{title}</span>
        <span className="text-xs text-slate-500 tabular-nums">({count})</span>
      </div>
      <div className="flex items-center gap-4 text-xs tabular-nums">
        <span className="text-slate-500">Lot: <b className="text-slate-300">{fmtVN(totalLot, 2)}</b></span>
        {totalPnL !== null && (
          <span className="text-slate-500">P/L: <b className={pc}>
            {totalPnL >= 0 ? '+' : ''}{fmtVN(totalPnL)}
          </b></span>
        )}
      </div>
    </div>
  )
}

/* ================================================================
   OPEN ROW
   ================================================================ */
function OpenRow({ trade: t, isNew, isLeaving }) {
  const dir = t.direction === 'BUY'
  return (
    <tr className={`border-b border-slate-800/60 transition-all duration-300
      ${isNew     ? 'row-enter-open' : ''}
      ${isLeaving ? 'row-leave'      : 'hover:bg-slate-800/40'}`}>
      <td className="px-3 py-2 text-[11px] text-slate-500 tabular-nums"># {t.positionTicket}</td>
      <td className="px-3 py-2">
        <span className={`text-xs font-bold ${dir ? 'text-emerald-400' : 'text-rose-400'}`}>
          {t.direction}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-slate-300 font-medium">{t.symbol || '—'}</td>
      <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-300">{fmtVN(t.volume, 2)}</td>
      <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-400">{fmtPrice(t.openPrice)}</td>
      <td className="px-3 py-2 text-xs text-slate-600 tabular-nums text-right">{fmtTime(t.openTime)}</td>
    </tr>
  )
}

/* ================================================================
   CLOSED ROW
   ================================================================ */
function ClosedRow({ trade: t, isNew }) {
  const dir = t.direction === 'BUY'
  const net = (t.profit || 0) + (t.commission || 0) + (t.swap || 0) + (t.fee || 0)
  return (
    <tr className={`border-b border-slate-800/60 transition-all duration-300
      ${isNew ? 'row-enter-closed' : ''}
      hover:bg-slate-800/40`}>
      <td className="px-3 py-2 text-[11px] text-slate-500 tabular-nums"># {t.positionTicket}</td>
      <td className="px-3 py-2">
        <span className={`text-xs font-bold ${dir ? 'text-emerald-400' : 'text-rose-400'}`}>
          {t.direction}
        </span>
      </td>
      <td className="px-3 py-2 text-xs text-slate-300 font-medium">{t.symbol || '—'}</td>
      <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-300">{fmtVN(t.volume, 2)}</td>
      <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-500">{fmtPrice(t.openPrice)}</td>
      <td className="px-3 py-2 text-right text-xs tabular-nums text-slate-500">{fmtPrice(t.closePrice)}</td>
      <td className={`px-3 py-2 text-right text-xs tabular-nums font-bold ${profitClass(net)}`}>
        {net >= 0 ? '+' : ''}{fmtVN(net)}
      </td>
      <td className="px-3 py-2 text-xs text-slate-600 tabular-nums">{fmtTime(t.closeTime)}</td>
    </tr>
  )
}

/* ================================================================
   BOT TOGGLE BUTTON
   — chỉ thay đổi state của selectedId, không ảnh hưởng copier khác
   ================================================================ */
function BotToggle({ copierId, active, onToggle, toggling }) {
  return (
    <button
      onClick={() => onToggle(copierId, !active)}
      disabled={toggling || !copierId}
      title={`Tài khoản: ${copierId} — click để ${active ? 'tắt' : 'bật'}`}
      className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold
        transition-all duration-200 shadow select-none
        ${active
          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
          : 'bg-slate-700 hover:bg-slate-600 text-slate-300'}
        ${(toggling || !copierId) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`w-2 h-2 rounded-full transition-colors
        ${active ? 'bg-white animate-pulse' : 'bg-slate-500'}`} />
      {toggling ? 'Đang xử lý...' : active ? 'Đang chạy' : 'Đã tắt'}
      <span className="text-[10px] opacity-50 hidden sm:inline">
        ({active ? 'click tắt' : 'click bật'})
      </span>
    </button>
  )
}

/* ================================================================
   MAIN PAGE
   ================================================================ */
export default function ExnessPage() {
  const [copierIds, setCopierIds]         = useState([])
  const [selectedId, setSelectedId]       = useState(null)

  const [openPositions, setOpenPositions] = useState([])
  const [closedPositions, setClosedPositions] = useState([])
  const [loading, setLoading]             = useState(false)

  // State per-copier: { [copierId]: { active, updatedAt, changedBy } }
  // Dùng Map để tránh re-render toàn bộ khi copier khác đổi
  const [stateMap, setStateMap]           = useState({})

  const [connected, setConnected]         = useState(false)
  const [toggling, setToggling]           = useState(false)

  const [newOpenIds, setNewOpenIds]       = useState(new Set())
  const [newClosedIds, setNewClosedIds]   = useState(new Set())
  const [leavingIds, setLeavingIds]       = useState(new Set())

  const clientRef = useRef(null)

  /* ── helpers ────────────────────────────────────────────────── */

  const applyState = useCallback((stateObj) => {
    if (!stateObj || !stateObj.copierId) return
    setStateMap(prev => ({
      ...prev,
      [stateObj.copierId]: {
        active:    !!stateObj.active,
        updatedAt: stateObj.updatedAt || null,
        changedBy: stateObj.changedBy || null,
      },
    }))
  }, [])

  const currentActive = selectedId ? (stateMap[selectedId]?.active ?? false) : false

  /* ── fetch copier ids ───────────────────────────────────────── */

  useEffect(() => {
    fetch(`${BASE}/api/public/mt5/copier/ids`)
      .then(r => r.json())
      .then(d => {
        const ids = d.copierIds || []
        setCopierIds(ids)
        if (ids.length > 0 && !selectedId) setSelectedId(ids[0])
      })
      .catch(console.error)
  }, [])

  /* ── fetch history (gộp state trong response) ──────────────── */

  const fetchHistory = useCallback(async (copierId) => {
    if (!copierId) return
    setLoading(true)
    try {
      const r = await fetch(
        `${BASE}/api/public/mt5/copier/history?copierId=${encodeURIComponent(copierId)}`
      )
      const d = await r.json()
      if (d.success) {
        setOpenPositions(d.openPositions   || [])
        setClosedPositions(d.closedPositions || [])
        // state đã gộp trong response
        if (d.state) applyState(d.state)
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [applyState])

  useEffect(() => {
    if (!selectedId) return
    fetchHistory(selectedId)
  }, [selectedId, fetchHistory])

  /* ── WebSocket — subscribe per-copier topic ─────────────────── */

  useEffect(() => {
    if (!selectedId) return

    const wsUrl = BASE.replace(/^http/, 'http') + '/ws'
    const client = new Client({
      webSocketFactory: () => new SockJS(wsUrl),
      reconnectDelay: 3000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      onConnect: () => {
        setConnected(true)

        // ── subscribe ĐÚNG topic của copier đang xem ──────────
        // Khi user đổi selectedId, effect này chạy lại,
        // client cũ bị deactivate → không có rò rỉ sub chéo copier
        client.subscribe(`/topic/mt5-exness/${selectedId}`, (msg) => {
          try {
            const payload = JSON.parse(msg.body)

            /* ── STATE_CHANGE từ EA (trigger LIMIT/STOP) hoặc copier khác push ── */
            if (payload.type === 'STATE_CHANGE') {
              // Chỉ áp dụng nếu đúng copierId trong message
              // (server đã route đúng topic nhưng double-check thêm)
              if (payload.copierId === selectedId) {
                applyState({
                  copierId:  payload.copierId,
                  active:    payload.active,
                  updatedAt: payload.updatedAt,
                  changedBy: payload.changedBy,
                })
              }
              return
            }

            /* ── TRADE_EVENT ───────────────────────────────────── */
            if (payload.type === 'TRADE_EVENT') {
              const trade = payload.trade
              const event = payload.event

              if (event === 'OPEN') {
                setOpenPositions(prev =>
                  prev.some(t => t.positionTicket === trade.positionTicket)
                    ? prev
                    : [trade, ...prev]
                )
                const tk = trade.positionTicket
                setNewOpenIds(prev => new Set(prev).add(tk))
                setTimeout(() => setNewOpenIds(prev => {
                  const n = new Set(prev); n.delete(tk); return n
                }), 800)
              } else {
                // CLOSE → animate ra khỏi cột mở, rồi xuất hiện ở cột đóng
                const tk = trade.positionTicket
                setLeavingIds(prev => new Set(prev).add(tk))

                setTimeout(() => {
                  setOpenPositions(prev => prev.filter(t => t.positionTicket !== tk))
                  setLeavingIds(prev => { const n = new Set(prev); n.delete(tk); return n })

                  setClosedPositions(prev => {
                    const idx = prev.findIndex(t => t.positionTicket === tk)
                    if (idx !== -1) { const next = [...prev]; next[idx] = trade; return next }
                    return [trade, ...prev]
                  })
                  setNewClosedIds(prev => new Set(prev).add(tk))
                  setTimeout(() => setNewClosedIds(prev => {
                    const n = new Set(prev); n.delete(tk); return n
                  }), 800)
                }, 400)
              }
            }
          } catch (e) { console.error('WS parse error', e) }
        })
      },
      onDisconnect: () => setConnected(false),
      onStompError: () => setConnected(false),
    })

    client.activate()
    clientRef.current = client

    // cleanup khi selectedId đổi hoặc unmount
    return () => { client.deactivate() }
  }, [selectedId, applyState])

  /* ── toggle bot (chỉ tác động selectedId) ───────────────────── */

  const handleToggle = useCallback(async (copierId, active) => {
    if (!copierId || toggling) return
    setToggling(true)
    try {
      const r = await fetch(`${BASE}/api/public/mt5/copier/state`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        // changedBy = "UI" để phân biệt với EA trigger
        body: JSON.stringify({ copierId, active, changedBy: 'UI' }),
      })
      const d = await r.json()
      // Server trả về state mới của đúng copierId đó
      applyState(d)
    } catch (e) { console.error(e) }
    finally { setToggling(false) }
  }, [toggling, applyState])

  /* ── summaries ──────────────────────────────────────────────── */

  const openLot   = useMemo(() =>
    openPositions.reduce((s, t) => s + (t.volume || 0), 0), [openPositions])
  const closedLot = useMemo(() =>
    closedPositions.reduce((s, t) => s + (t.volume || 0), 0), [closedPositions])
  const closedPnL = useMemo(() =>
    closedPositions.reduce((s, t) =>
      s + (t.profit||0) + (t.commission||0) + (t.swap||0) + (t.fee||0), 0),
    [closedPositions])

  const pnlPulse = useValuePulse(closedPnL)

  /* ── state badge ──────────────────────────────────────────────── */
  const stateInfo = selectedId ? stateMap[selectedId] : null
  const stateAge  = stateInfo?.updatedAt
    ? (() => {
        try {
          const diff = Math.floor((Date.now() - new Date(stateInfo.updatedAt).getTime()) / 1000)
          if (diff < 60) return `${diff}s trước`
          if (diff < 3600) return `${Math.floor(diff/60)}m trước`
          return `${Math.floor(diff/3600)}h trước`
        } catch { return '' }
      })()
    : ''

  /* ── render ─────────────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col">

      {/* HEADER */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 sm:px-6 py-3
                         flex items-center justify-between gap-3 flex-wrap sticky top-0 z-30">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Logo */}
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600
                          flex items-center justify-center shadow flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24"
                 stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l4-8 4 4 4-7 4 8" />
            </svg>
          </div>
          <span className="text-base font-bold tracking-tight">Copier Trade</span>
          {/* WS indicator */}
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold
            ${connected ? 'bg-emerald-900/60 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
            <span className={`w-1.5 h-1.5 rounded-full
              ${connected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            {connected ? 'Live' : 'Offline'}
          </span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Copier selector */}
          {copierIds.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 hidden sm:inline">Tài khoản</span>
              <div className="relative">
                <select
                  value={selectedId || ''}
                  onChange={e => setSelectedId(e.target.value)}
                  className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 pr-8
                             text-sm text-slate-200 focus:outline-none focus:border-violet-500
                             cursor-pointer appearance-none"
                >
                  {copierIds.map(id => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-2 top-2.5 w-3 h-3 text-slate-500"
                     fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          )}

          {/* Bot toggle — chỉ tác động selectedId */}
          {selectedId && (
            <div className="flex flex-col items-end gap-0.5">
              <BotToggle
                copierId={selectedId}
                active={currentActive}
                onToggle={handleToggle}
                toggling={toggling}
              />
              {stateAge && (
                <span className="text-[10px] text-slate-600 pr-1">
                  {stateInfo?.changedBy ? `${stateInfo.changedBy} · ` : ''}{stateAge}
                </span>
              )}
            </div>
          )}
        </div>
      </header>

      {/* MAIN */}
      <main className="flex-1 flex flex-col p-4 sm:p-5 gap-4 min-h-0">
        {!selectedId ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-slate-600 text-sm">
              {copierIds.length === 0
                ? 'Chưa có tài khoản nào kết nối.'
                : 'Chọn tài khoản để xem lệnh.'}
            </p>
          </div>
        ) : loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-7 h-7 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 flex-1 min-h-0">

            {/* ── CỘT TRÁI: ĐANG MỞ ── */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 flex flex-col overflow-hidden">
              <ColHeader
                title="Đang mở"
                count={openPositions.length}
                totalLot={openLot}
                totalPnL={null}
                accent="bg-blue-500"
              />
              <div className="flex-1 overflow-auto">
                {openPositions.length === 0 ? (
                  <div className="py-16 text-center text-slate-700 text-sm select-none">
                    Không có lệnh nào đang mở
                  </div>
                ) : (
                  <table className="w-full text-sm min-w-[380px]">
                    <thead>
                      <tr className="border-b border-slate-800">
                        {['Ticket', 'Side', 'Symbol', 'Lot', 'Open', 'Giờ mở'].map((h, i) => (
                          <th key={h} className={`px-3 py-2 text-[10px] font-semibold text-slate-600
                            uppercase tracking-wider whitespace-nowrap
                            ${i >= 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {openPositions.map(t => (
                        <OpenRow
                          key={t.positionTicket}
                          trade={t}
                          isNew={newOpenIds.has(t.positionTicket)}
                          isLeaving={leavingIds.has(t.positionTicket)}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* ── CỘT PHẢI: ĐÃ ĐÓNG ── */}
            <div className="bg-slate-900 rounded-xl border border-slate-800 flex flex-col overflow-hidden">
              <ColHeader
                title="Đã đóng"
                count={closedPositions.length}
                totalLot={closedLot}
                totalPnL={closedPnL}
                accent="bg-amber-500"
              />
              <div className="flex-1 overflow-auto">
                {closedPositions.length === 0 ? (
                  <div className="py-16 text-center text-slate-700 text-sm select-none">
                    Chưa có lệnh đóng nào
                  </div>
                ) : (
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr className="border-b border-slate-800">
                        {['Ticket', 'Side', 'Symbol', 'Lot', 'Open', 'Close', 'P/L', 'Giờ đóng'].map((h, i) => (
                          <th key={h} className={`px-3 py-2 text-[10px] font-semibold text-slate-600
                            uppercase tracking-wider whitespace-nowrap
                            ${i >= 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {closedPositions.map(t => (
                        <ClosedRow
                          key={t.positionTicket}
                          trade={t}
                          isNew={newClosedIds.has(t.positionTicket)}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Footer tổng P/L */}
              {closedPositions.length > 0 && (
                <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-end gap-3">
                  <span className="text-xs text-slate-600">Tổng P/L</span>
                  <AnimatedValue
                    value={`${closedPnL >= 0 ? '+' : ''}${fmtVN(closedPnL)}`}
                    className={`text-base ${closedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}
                    pulseKey={pnlPulse.key}
                    direction={pnlPulse.dir}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ANIMATIONS */}
      <style>{`
        @keyframes rowEnterOpen {
          0%   { opacity:0; transform:translateX(-18px); background:rgba(99,102,241,.15); }
          70%  { background:rgba(99,102,241,.07); }
          100% { opacity:1; transform:translateX(0);     background:transparent; }
        }
        @keyframes rowEnterClosed {
          0%   { opacity:0; transform:translateX(18px);  background:rgba(251,191,36,.15); }
          70%  { background:rgba(251,191,36,.07); }
          100% { opacity:1; transform:translateX(0);     background:transparent; }
        }
        @keyframes rowLeave {
          0%   { opacity:1; transform:translateX(0)  scale(1);    }
          100% { opacity:0; transform:translateX(22px) scale(.97); }
        }
        .row-enter-open   { animation: rowEnterOpen   .5s cubic-bezier(.16,1,.3,1) both; }
        .row-enter-closed { animation: rowEnterClosed .5s cubic-bezier(.16,1,.3,1) both; }
        .row-leave        { animation: rowLeave       .4s ease-in both; pointer-events:none; }

        @keyframes valUp   { 0%,100%{color:inherit} 35%{color:#34d399} }
        @keyframes valDown { 0%,100%{color:inherit} 35%{color:#f87171} }
        .val-up    { animation: valUp   .7s ease both; }
        .val-down  { animation: valDown .7s ease both; }
        .val-pulse { animation: valUp   .7s ease both; }
      `}</style>
    </div>
  )
}