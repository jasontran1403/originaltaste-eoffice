import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:9009'
const GMT7_OFFSET_MS = 7 * 60 * 60 * 1000

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

/**
 * Parse ISO string từ server (UTC) → hiển thị theo GMT+7.
 * Server lưu LocalDateTime (không có timezone) → coi là UTC khi parse.
 * "2025-01-01T02:41:30" hoặc "2025-01-01 02:41:30" → 09:41:30
 */
const toGmt7Date = (iso) => {
  if (!iso) return null
  try {
    // Chuẩn hóa: thay space → T, đảm bảo có Z (UTC)
    const normalized = String(iso).replace(' ', 'T').replace(/(\.\d+)?$/, '') + 'Z'
    const d = new Date(normalized)
    if (isNaN(d.getTime())) return null
    return new Date(d.getTime() + GMT7_OFFSET_MS)
  } catch { return null }
}

const fmtTime = (iso) => {
  const d = toGmt7Date(iso)
  if (!d) return '—'
  return d.toISOString().substring(11, 19)   // HH:mm:ss
}

const fmtDateTime = (iso) => {
  const d = toGmt7Date(iso)
  if (!d) return '—'
  const s = d.toISOString()
  return s.substring(0, 10) + ' ' + s.substring(11, 19)
}

/**
 * Net profit của lệnh đã đóng: profit + commission + swap + fee.
 */
const calcNet = (t) => {
  const p    = Number(t.profit     || 0)
  const comm = Number(t.commission || 0)
  const swap = Number(t.swap       || 0)
  const fee  = Number(t.fee        || 0)
  return p + comm + swap + fee
}

/** P/L floating lệnh đang mở — MQ5 gửi POSITION_PROFIT + SWAP vào field profit */
const calcFloat = (t) => Number(t.profit || 0)

const profitSign = (v) => v > 0.001 ? '+' : ''

const profitClass = (v) =>
  v > 0.001 ? 'text-emerald-600' : v < -0.001 ? 'text-rose-500' : 'text-gray-400'

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
function ColHeader({ title, count, totalLot, totalPnL, accent, pnlPulseKey, pnlDir }) {
  const pc = totalPnL > 0.001 ? 'text-emerald-600'
    : totalPnL < -0.001 ? 'text-rose-500' : 'text-gray-400'
  return (
    <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2 bg-gray-50">
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${accent}`} />
        <span className="text-sm font-semibold text-gray-800">{title}</span>
        <span className="text-xs text-gray-400 tabular-nums">({count})</span>
      </div>
      <div className="flex items-center gap-4 text-xs tabular-nums">
        <span className="text-gray-500">Lot: <b className="text-gray-700">{fmtVN(totalLot, 2)}</b></span>
        {totalPnL !== null && (
          <span className="text-gray-500">P/L:{' '}
            <AnimatedValue
              value={`${profitSign(totalPnL)}${fmtVN(totalPnL)}`}
              className={`text-xs ${pc}`}
              pulseKey={pnlPulseKey}
              direction={pnlDir}
            />
          </span>
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
    <tr className={`border-b border-gray-100 transition-all duration-300
      ${isNew     ? 'row-enter-open' : ''}
      ${isLeaving ? 'row-leave'      : 'hover:bg-blue-50/40'}`}>
      <td className="px-3 py-2.5 text-[11px] text-gray-400 tabular-nums font-mono">
        #{t.positionTicket}
      </td>
      <td className="px-3 py-2.5">
        <span className={`text-xs font-bold ${dir ? 'text-emerald-600' : 'text-rose-500'}`}>
          {t.direction}
        </span>
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-700 font-medium">{t.symbol || '—'}</td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-gray-700">{fmtVN(t.volume, 2)}</td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-gray-600">{fmtPrice(t.openPrice)}</td>
      <td className="px-3 py-2.5 text-xs text-gray-400 tabular-nums">{fmtTime(t.openTime)}</td>
    </tr>
  )
}

/* ================================================================
   CLOSED ROW
   ================================================================ */
function ClosedRow({ trade: t, isNew }) {
  const dir = t.direction === 'BUY'
  const net = calcNet(t)
  return (
    <tr className={`border-b border-gray-100 transition-all duration-300
      ${isNew ? 'row-enter-closed' : ''}
      hover:bg-amber-50/40`}>
      <td className="px-3 py-2.5 text-[11px] text-gray-400 tabular-nums font-mono">
        #{t.positionTicket}
      </td>
      <td className="px-3 py-2.5">
        <span className={`text-xs font-bold ${dir ? 'text-emerald-600' : 'text-rose-500'}`}>
          {t.direction}
        </span>
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-700 font-medium">{t.symbol || '—'}</td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-gray-700">{fmtVN(t.volume, 2)}</td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-gray-500">{fmtPrice(t.openPrice)}</td>
      <td className="px-3 py-2.5 text-right text-xs tabular-nums text-gray-500">{fmtPrice(t.closePrice)}</td>
      <td className={`px-3 py-2.5 text-right text-xs tabular-nums font-bold ${profitClass(net)}`}>
        {net >= 0 ? '+' : ''}{fmtVN(net)}
      </td>
      <td className="px-3 py-2.5 text-xs text-gray-400 tabular-nums">{fmtTime(t.closeTime)}</td>
    </tr>
  )
}

/* ================================================================
   BOT TOGGLE BUTTON
   ================================================================ */
function BotToggle({ copierId, active, onToggle, toggling }) {
  return (
    <button
      onClick={() => onToggle(copierId, !active)}
      disabled={toggling || !copierId}
      title={`Tài khoản: ${copierId} — click để ${active ? 'tắt' : 'bật'}`}
      className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold
        transition-all duration-200 shadow-sm select-none border
        ${active
          ? 'bg-emerald-500 hover:bg-emerald-600 text-white border-emerald-500'
          : 'bg-white hover:bg-gray-50 text-gray-600 border-gray-300'}
        ${(toggling || !copierId) ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 transition-colors
        ${active ? 'bg-white animate-pulse' : 'bg-gray-400'}`} />
      {toggling ? 'Đang xử lý...' : active ? 'Đang chạy' : 'Đã tắt'}
      <span className="text-[10px] opacity-60 hidden sm:inline">
        ({active ? 'click tắt' : 'click bật'})
      </span>
    </button>
  )
}

/* ================================================================
   MAIN PAGE
   ================================================================ */
export default function ExnessPage() {
  const [copierIds, setCopierIds]             = useState([])
  const [selectedId, setSelectedId]           = useState(null)
  const [openPositions, setOpenPositions]     = useState([])
  const [closedPositions, setClosedPositions] = useState([])
  const [loading, setLoading]                 = useState(false)
  const [stateMap, setStateMap]               = useState({})
  const [connected, setConnected]             = useState(false)
  const [toggling, setToggling]               = useState(false)
  const [newOpenIds, setNewOpenIds]           = useState(new Set())
  const [newClosedIds, setNewClosedIds]       = useState(new Set())
  const [leavingIds, setLeavingIds]           = useState(new Set())
  // Map: positionTicket → { profit, currentPrice } — cập nhật realtime từ report
  const [floatMap, setFloatMap]               = useState({})
  const clientRef = useRef(null)

  /* ── helpers ─────────────────────────────────────────────────── */

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

  const currentActive = selectedId ? (stateMap[selectedId]?.active ?? true) : true

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

  /* ── fetch history (gộp state) ──────────────────────────────── */

  const fetchHistory = useCallback(async (copierId) => {
    if (!copierId) return
    setLoading(true)
    try {
      const r = await fetch(
        `${BASE}/api/public/mt5/copier/history?copierId=${encodeURIComponent(copierId)}`
      )
      const d = await r.json()
      if (d.success) {
        setOpenPositions(d.openPositions    || [])
        setClosedPositions(d.closedPositions || [])
        if (d.state) applyState(d.state)
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [applyState])

  useEffect(() => {
    if (!selectedId) return
    fetchHistory(selectedId)
  }, [selectedId, fetchHistory])

  /* ── WebSocket ──────────────────────────────────────────────── */

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
        client.subscribe(`/topic/mt5-exness/${selectedId}`, (msg) => {
          try {
            const payload = JSON.parse(msg.body)

            if (payload.type === 'POSITIONS_UPDATE') {
              // Cập nhật floating P/L của các lệnh đang mở realtime
              const map = {}
              for (const p of (payload.positions || [])) {
                map[p.positionTicket] = { profit: p.profit, currentPrice: p.currentPrice }
              }
              setFloatMap(map)
              return
            }

            if (payload.type === 'STATE_CHANGE') {
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

            if (payload.type === 'TRADE_EVENT') {
              const trade = payload.trade
              const event = payload.event

              if (event === 'OPEN') {
                setOpenPositions(prev =>
                  prev.some(t => t.positionTicket === trade.positionTicket)
                    ? prev : [trade, ...prev]
                )
                const tk = trade.positionTicket
                setNewOpenIds(prev => new Set(prev).add(tk))
                setTimeout(() => setNewOpenIds(prev => {
                  const n = new Set(prev); n.delete(tk); return n
                }), 800)
              } else {
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
      onStompError:  () => setConnected(false),
    })
    client.activate()
    clientRef.current = client
    return () => { client.deactivate() }
  }, [selectedId, applyState])

  /* ── toggle ─────────────────────────────────────────────────── */

  const handleToggle = useCallback(async (copierId, active) => {
    if (!copierId || toggling) return
    setToggling(true)
    try {
      const r = await fetch(`${BASE}/api/public/mt5/copier/state`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ copierId, active, changedBy: 'UI' }),
      })
      const d = await r.json()
      applyState(d)
    } catch (e) { console.error(e) }
    finally { setToggling(false) }
  }, [toggling, applyState])

  /* ── summaries ──────────────────────────────────────────────── */

  const openLot   = useMemo(() =>
    openPositions.reduce((s, t) => s + (t.volume || 0), 0), [openPositions])
  // Total floating P/L — ưu tiên realtime floatMap, fallback t.profit
  const openPnL   = useMemo(() =>
    openPositions.reduce((s, t) => {
      const live = floatMap[t.positionTicket]
      return s + (live ? Number(live.profit || 0) : calcFloat(t))
    }, 0), [openPositions, floatMap])
  const closedLot = useMemo(() =>
    closedPositions.reduce((s, t) => s + (t.volume || 0), 0), [closedPositions])
  const closedPnL = useMemo(() =>
    closedPositions.reduce((s, t) => s + calcNet(t), 0), [closedPositions])

  const pnlPulse    = useValuePulse(closedPnL)
  const openPnlPulse = useValuePulse(openPnL)

  /* ── state badge ─────────────────────────────────────────────── */

  const stateInfo = selectedId ? stateMap[selectedId] : null
  const stateAge  = stateInfo?.updatedAt
    ? (() => {
        try {
          const diff = Math.floor((Date.now() - new Date(stateInfo.updatedAt).getTime()) / 1000)
          if (diff < 60)   return `${diff}s trước`
          if (diff < 3600) return `${Math.floor(diff / 60)}m trước`
          return `${Math.floor(diff / 3600)}h trước`
        } catch { return '' }
      })()
    : ''

  /* ── render ─────────────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 flex flex-col">

      {/* HEADER */}
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3
                         flex items-center justify-between gap-3 flex-wrap sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600
                          flex items-center justify-center shadow-sm flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24"
                 stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 17l4-8 4 4 4-7 4 8" />
            </svg>
          </div>
          <span className="text-base font-bold tracking-tight text-gray-900">Copier Trade</span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold
            ${connected
              ? 'bg-emerald-50 text-emerald-600 border border-emerald-200'
              : 'bg-gray-100 text-gray-400 border border-gray-200'}`}>
            <span className={`w-1.5 h-1.5 rounded-full
              ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
            {connected ? 'Live' : 'Offline'}
          </span>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Copier selector */}
          {copierIds.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 hidden sm:inline">Tài khoản</span>
              <div className="relative">
                <select
                  value={selectedId || ''}
                  onChange={e => setSelectedId(e.target.value)}
                  className="bg-white border border-gray-300 rounded-lg px-3 py-1.5 pr-8
                             text-sm text-gray-700 focus:outline-none focus:border-violet-500
                             cursor-pointer appearance-none shadow-sm"
                >
                  {copierIds.map(id => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
                <svg className="pointer-events-none absolute right-2 top-2.5 w-3 h-3 text-gray-400"
                     fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          )}

          {/* Bot toggle */}
          {selectedId && (
            <div className="flex flex-col items-end gap-0.5">
              <BotToggle
                copierId={selectedId}
                active={currentActive}
                onToggle={handleToggle}
                toggling={toggling}
              />
              {stateAge && (
                <span className="text-[10px] text-gray-400 pr-1">
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
            <p className="text-gray-400 text-sm">
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

            {/* CỘT TRÁI: ĐANG MỞ */}
            <div className="bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden shadow-sm">
              <ColHeader
                title="Đang mở"
                count={openPositions.length}
                totalLot={openLot}
                totalPnL={openPnL}
                accent="bg-blue-500"
                pnlPulseKey={openPnlPulse.key}
                pnlDir={openPnlPulse.dir}
              />
              <div className="flex-1 overflow-auto">
                {openPositions.length === 0 ? (
                  <div className="py-16 text-center text-gray-300 text-sm select-none">
                    Không có lệnh nào đang mở
                  </div>
                ) : (
                  <table className="w-full text-sm min-w-[480px]">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/70">
                        {['Ticket', 'Side', 'Symbol', 'Lot', 'Open', 'P/L', 'Giờ mở'].map((h, i) => (
                          <th key={h} className={`px-3 py-2 text-[10px] font-semibold text-gray-400
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
                          liveProfit={floatMap[t.positionTicket]?.profit}
                        />
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* CỘT PHẢI: ĐÃ ĐÓNG */}
            <div className="bg-white rounded-xl border border-gray-200 flex flex-col overflow-hidden shadow-sm">
              <ColHeader
                title="Đã đóng"
                count={closedPositions.length}
                totalLot={closedLot}
                totalPnL={closedPnL}
                accent="bg-amber-500"
                pnlPulseKey={pnlPulse.key}
                pnlDir={pnlPulse.dir}
              />
              <div className="flex-1 overflow-auto">
                {closedPositions.length === 0 ? (
                  <div className="py-16 text-center text-gray-300 text-sm select-none">
                    Chưa có lệnh đóng nào
                  </div>
                ) : (
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/70">
                        {['Ticket', 'Side', 'Symbol', 'Lot', 'Open', 'Close', 'P/L', 'Giờ đóng'].map((h, i) => (
                          <th key={h} className={`px-3 py-2 text-[10px] font-semibold text-gray-400
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


            </div>
          </div>
        )}
      </main>

      {/* ANIMATIONS */}
      <style>{`
        @keyframes rowEnterOpen {
          0%   { opacity:0; transform:translateX(-16px); background:rgba(99,102,241,.08); }
          70%  { background:rgba(99,102,241,.04); }
          100% { opacity:1; transform:translateX(0);     background:transparent; }
        }
        @keyframes rowEnterClosed {
          0%   { opacity:0; transform:translateX(16px);  background:rgba(245,158,11,.10); }
          70%  { background:rgba(245,158,11,.05); }
          100% { opacity:1; transform:translateX(0);     background:transparent; }
        }
        @keyframes rowLeave {
          0%   { opacity:1; transform:translateX(0) scale(1);     }
          100% { opacity:0; transform:translateX(20px) scale(.97); }
        }
        .row-enter-open   { animation: rowEnterOpen   .5s cubic-bezier(.16,1,.3,1) both; }
        .row-enter-closed { animation: rowEnterClosed .5s cubic-bezier(.16,1,.3,1) both; }
        .row-leave        { animation: rowLeave       .4s ease-in both; pointer-events:none; }

        @keyframes valUp   { 0%,100%{color:inherit} 35%{color:#16a34a} }
        @keyframes valDown { 0%,100%{color:inherit} 35%{color:#dc2626} }
        .val-up    { animation: valUp   .7s ease both; }
        .val-down  { animation: valDown .7s ease both; }
        .val-pulse { animation: valUp   .7s ease both; }
      `}</style>
    </div>
  )
}