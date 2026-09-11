import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:9009'

/* ================================================================
   HELPERS  (aligned with ExnessPage)
   ================================================================ */

const fmtVN = (v, d = 2) => {
  if (v == null || isNaN(Number(v))) return '—'
  return new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  }).format(Number(v))
}

const fmtCent = (v, d = 2) => {
  if (v == null || isNaN(Number(v))) return '—'
  return `${fmtVN(v, d)}¢`
}

const fmtLot = (v) => (v == null || isNaN(Number(v)) ? '—' : fmtVN(v, 2))

const fmtPrice = (v) => {
  if (v == null || isNaN(Number(v))) return '—'
  const s = String(v)
  const dec = s.includes('.') ? s.split('.')[1].length : 2
  return fmtVN(v, Math.min(dec, 5))
}

const fmtTime = (iso) => {
  if (!iso) return '—'
  const m = String(iso).match(/(\d{2}):(\d{2}):(\d{2})/)
  return m ? `${m[1]}:${m[2]}:${m[3]}` : String(iso)
}

const fmtAge = (ms) => {
  if (ms == null || isNaN(ms)) return '—'
  if (ms < 5000) return 'vừa xong'
  if (ms < 60000) return `${Math.floor(ms / 1000)}s trước`
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m trước`
  return `${Math.floor(ms / 3600000)}h trước`
}

const positionKey = (p) => String(p.key ?? p.ticket ?? p.masterId ?? p.positionTicket ?? '')

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
    const dir =
      typeof value === 'number' && typeof prev === 'number'
        ? value > prev ? 'up' : 'down'
        : null
    prevRef.current = value
    setState((s) => ({ key: s.key + 1, dir }))
  }, [value])

  return state
}

function PulseValue({ value, pulseKey, direction, className = '', tag: Tag = 'span' }) {
  const [pulse, setPulse] = useState(false)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) { first.current = false; return }
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
   POSITIONS: track add / remove so we can fade them
   ================================================================ */

/**
 * Merge incoming positions with the previous set, keeping outgoing ones
 * around for 320ms with `_exiting: true` so a CSS animation can play.
 * Returns { list, entered } — `entered` is a Set of keys that just appeared,
 * used to trigger the enter animation.
 */
function usePositionsWithExit(incoming) {
  const [list, setList] = useState([])
  const [entered, setEntered] = useState(new Set())
  const prevKeys = useRef(new Set())
  const exitTimers = useRef(new Map())
  const enterTimers = useRef(new Map())

  useEffect(() => {
    const nextArr = Array.isArray(incoming) ? incoming : []
    const nextByKey = new Map()
    for (const p of nextArr) nextByKey.set(positionKey(p), p)

    const nextKeys = new Set(nextByKey.keys())
    const previousKeys = prevKeys.current

    const enteredNow = new Set()
    for (const k of nextKeys) if (!previousKeys.has(k)) enteredNow.add(k)

    // Cancel any pending exit for keys that came back
    for (const k of nextKeys) {
      const t = exitTimers.current.get(k)
      if (t) { clearTimeout(t); exitTimers.current.delete(k) }
    }

    // Merge: new/updated items from server; keep exiting items in place
    setList((previousList) => {
      const merged = []
      const seen = new Set()

      // Preserve previous order for stable animation
      for (const p of previousList) {
        const k = positionKey(p)
        if (nextByKey.has(k)) {
          merged.push({ ...nextByKey.get(k), _exiting: false })
          seen.add(k)
        } else if (!p._exiting) {
          merged.push({ ...p, _exiting: true })
          seen.add(k)
        } else {
          merged.push(p)
          seen.add(k)
        }
      }

      // Append newcomers (respecting server order)
      for (const p of nextArr) {
        const k = positionKey(p)
        if (!seen.has(k)) merged.push({ ...p, _exiting: false })
      }

      return merged
    })

    // Track enter animation lifecycle
    if (enteredNow.size > 0) {
      setEntered((prev) => {
        const next = new Set(prev)
        for (const k of enteredNow) next.add(k)
        return next
      })
      for (const k of enteredNow) {
        const timer = setTimeout(() => {
          setEntered((prev) => {
            if (!prev.has(k)) return prev
            const next = new Set(prev)
            next.delete(k)
            return next
          })
          enterTimers.current.delete(k)
        }, 500)
        enterTimers.current.set(k, timer)
      }
    }

    // Schedule removal for exiting keys
    for (const k of previousKeys) {
      if (nextKeys.has(k)) continue
      if (exitTimers.current.has(k)) continue
      const timer = setTimeout(() => {
        setList((prev) => prev.filter((p) => positionKey(p) !== k))
        exitTimers.current.delete(k)
      }, 320)
      exitTimers.current.set(k, timer)
    }

    prevKeys.current = nextKeys
  }, [incoming])

  useEffect(() => () => {
    for (const t of exitTimers.current.values()) clearTimeout(t)
    for (const t of enterTimers.current.values()) clearTimeout(t)
    exitTimers.current.clear()
    enterTimers.current.clear()
  }, [])

  return { list, entered }
}

/* ================================================================
   METRIC — small number tile
   ================================================================ */

function Metric({ label, value, sub, valueClass = 'text-gray-900', pulseKey, direction }) {
  return (
    <div className="px-4 py-3 first:pl-0 last:pr-0">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-[0.08em] mb-1">
        {label}
      </p>
      <PulseValue
        value={value}
        pulseKey={pulseKey}
        direction={direction}
        className={`text-base sm:text-[17px] font-bold leading-tight ${valueClass}`}
      />
      {sub && <p className="text-[11px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

/* ================================================================
   POSITION ROW
   ================================================================ */

function PositionRow({ position, isEntering }) {
  const isBuy = String(position.direction).toUpperCase() === 'BUY'
  const profit = Number(position.profit)
  const profitClass = isNaN(profit)
    ? 'text-gray-300'
    : profit >= 0 ? 'text-emerald-600' : 'text-rose-500'

  const rowClass = position._exiting
    ? 'position-exit'
    : isEntering ? 'position-enter' : ''

  return (
    <tr className={`border-b border-gray-100/70 ${rowClass}`}>
      <td className="px-3 py-2 whitespace-nowrap font-mono text-[12px] text-gray-700 tabular-nums">
        {position.ticket || '—'}
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-[13px] font-semibold text-gray-900">
        {position.symbol || '—'}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span className={`text-[11px] font-bold ${isBuy ? 'text-emerald-600' : 'text-rose-500'}`}>
          {position.direction || '—'}
        </span>
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums text-[13px] text-gray-700">
        {fmtLot(position.volume)}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums text-[12px] text-gray-500">
        {fmtPrice(position.openPrice)}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums text-[12px] text-gray-500">
        {fmtPrice(position.currentPrice)}
      </td>
      <td className={`px-3 py-2 text-right whitespace-nowrap tabular-nums text-[13px] font-semibold ${profitClass}`}>
        {isNaN(profit) ? '—' : fmtCent(profit)}
      </td>
      <td className="px-3 py-2 whitespace-nowrap text-[11px] text-gray-400 tabular-nums">
        {fmtTime(position.openTime)}
      </td>
    </tr>
  )
}

/* ================================================================
   ACCOUNT CARD
   ================================================================ */

function AccountCard({ account, isMaster }) {
  const { list, entered } = usePositionsWithExit(account.positions || [])

  const pBal = useValuePulse(account.balance)
  const pEq = useValuePulse(account.equity)
  const pFloat = useValuePulse(account.floating)
  const pLots = useValuePulse(account.openLots)
  const pOpen = useValuePulse(account.openCount)

  const stale = account.reportAgeMs != null && account.reportAgeMs > 15000
  const noReport = !account.hasReport
  const badFeed = noReport || stale

  const roleClass = isMaster
    ? 'bg-indigo-600 text-white'
    : 'bg-gray-900 text-gray-100'

  const idLine = isMaster
    ? account.name || 'Master account'
    : account.name || account.id

  const floatingClass = account.floating == null
    ? 'text-gray-400'
    : account.floating >= 0 ? 'text-emerald-600' : 'text-rose-500'

  return (
    <section className="bg-white border border-gray-200/80 rounded-2xl shadow-sm overflow-hidden">
      {/* ─────── header ─────── */}
      <header className="px-5 py-3.5 flex items-center justify-between gap-3 border-b border-gray-100 bg-gradient-to-b from-white to-gray-50/60">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wider ${roleClass}`}>
            {isMaster ? 'MASTER' : 'COPIER'}
          </span>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-gray-900 truncate">{idLine}</h2>
            <p className="text-[11px] text-gray-500 truncate tabular-nums">
              {account.login ? `#${account.login}` : account.id}
              {account.server && <span> · {account.server}</span>}
              {account.currency && <span> · {account.currency}</span>}
              {account.eaVersion && <span> · EA {account.eaVersion}</span>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-right shrink-0">
          <div className="flex flex-col items-end">
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold ${
              badFeed ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                badFeed ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'
              }`} />
              {noReport ? 'Chưa có report' : stale ? 'Report cũ' : 'Live'}
            </span>
            {account.reportAgeMs != null && (
              <span className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
                {fmtAge(account.reportAgeMs)}
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ─────── metrics strip ─────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-x divide-y sm:divide-y-0 divide-gray-100 px-1">
        <Metric
          label="Balance"
          value={fmtCent(account.balance)}
          pulseKey={pBal.key} direction={pBal.dir}
        />
        <Metric
          label="Equity"
          value={fmtCent(account.equity)}
          pulseKey={pEq.key} direction={pEq.dir}
        />
        <Metric
          label="Floating P/L"
          value={account.floating != null ? fmtCent(account.floating) : '—'}
          valueClass={floatingClass}
          pulseKey={pFloat.key} direction={pFloat.dir}
        />
        <Metric
          label="Lot đang mở"
          value={fmtLot(account.openLots)}
          sub={`${account.openCount ?? 0} lệnh`}
          pulseKey={pLots.key} direction={pLots.dir}
        />
        <Metric
          label="Hôm nay"
          value={`${account.todayTrades ?? 0} lệnh`}
          sub={`${fmtLot(account.todayLots)} lot`}
          pulseKey={pOpen.key} direction={pOpen.dir}
        />
        <Metric
          label={isMaster ? 'Credit' : 'Poll gần nhất'}
          value={
            isMaster
              ? (account.credit > 0 ? fmtCent(account.credit) : '—')
              : (account.lastPollAgeMs != null ? fmtAge(account.lastPollAgeMs) : '—')
          }
          valueClass={
            isMaster
              ? 'text-gray-900'
              : account.lastPollAgeMs != null && account.lastPollAgeMs > 10000
                ? 'text-amber-600'
                : 'text-gray-900'
          }
          sub={
            !isMaster && account.pendingSignals != null
              ? `${account.pendingSignals} signal đang chờ`
              : undefined
          }
        />
      </div>

      {/* ─────── positions ─────── */}
      <div className="border-t border-gray-100">
        <div className="px-5 py-2.5 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.08em]">
            Lệnh đang mở
          </h3>
          <span className="text-[11px] text-gray-400 tabular-nums">
            {list.filter((p) => !p._exiting).length} / {list.length}
          </span>
        </div>

        {list.length === 0 ? (
          <div className="px-5 py-8 text-center text-[13px] text-gray-400">
            Không có lệnh nào đang mở
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50/60 border-t border-b border-gray-100">
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Ticket</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Symbol</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Side</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Lot</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Mở</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Hiện tại</th>
                  <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider">P/L</th>
                  <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Thời gian mở</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <PositionRow
                    key={positionKey(p)}
                    position={p}
                    isEntering={entered.has(positionKey(p))}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {account.lastError && (
          <div className="px-5 py-2 border-t border-gray-100 bg-rose-50/40 text-[12px] text-rose-600">
            {account.lastError}
          </div>
        )}
      </div>
    </section>
  )
}

/* ================================================================
   MONITOR PAGE
   ================================================================ */

export default function MonitorPage() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [connected, setConnected] = useState(false)
  const [, setTick] = useState(0)   // 1s ticker for "vừa xong / 5s trước"
  const clientRef = useRef(null)

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch(`${BASE}/api/public/mt5/monitor`)
      const data = await res.json()
      if (data.success) setAccounts(data.accounts || [])
      else setError(data.message || 'Không tải được dữ liệu monitor')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchSnapshot() }, [fetchSnapshot])

  // Poll every 5s as a safety net if WebSocket drops. WebSocket updates are
  // per-account, so the polling covers accounts that never sent an incremental.
  useEffect(() => {
    const t = setInterval(() => { if (!connected) fetchSnapshot() }, 5000)
    return () => clearInterval(t)
  }, [connected, fetchSnapshot])

  // Re-render every second so "report age" and "poll age" advance smoothly
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const wsUrl = BASE.replace(/^http/, 'http') + '/ws'
    const client = new Client({
      webSocketFactory: () => new SockJS(wsUrl),
      reconnectDelay: 3000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      onConnect: () => {
        setConnected(true)
        client.subscribe('/topic/mt5-monitor', (msg) => {
          try {
            const payload = JSON.parse(msg.body)
            if (payload.type !== 'ACCOUNT' || !payload.account) return
            const account = payload.account
            setAccounts((prev) => {
              const idx = prev.findIndex((a) => a.id === account.id)
              if (idx === -1) return [...prev, account]
              const next = prev.slice()
              next[idx] = { ...next[idx], ...account }
              return next
            })
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
  }, [])

  // Age is computed relative to now — recompute from builtAtMs each render
  const displayedAccounts = useMemo(() => {
    const now = Date.now()
    return accounts.map((a) => ({
      ...a,
      reportAgeMs: a.hasReport && a.builtAtMs != null
        ? Math.max(0, now - a.builtAtMs + (a.reportAgeMs || 0))
        : a.reportAgeMs,
      lastPollAgeMs: a.lastPollAgeMs != null && a.builtAtMs != null
        ? Math.max(0, now - a.builtAtMs + a.lastPollAgeMs)
        : a.lastPollAgeMs,
    }))
  }, [accounts])

  const master = displayedAccounts.find((a) => a.role === 'MASTER')
  const copiers = displayedAccounts.filter((a) => a.role === 'COPIER')

  const totals = useMemo(() => {
    const acc = { balance: 0, equity: 0, floating: 0, openLots: 0, todayTrades: 0 }
    for (const a of copiers) {
      acc.balance += Number(a.balance) || 0
      acc.equity += Number(a.equity) || 0
      acc.floating += Number(a.floating) || 0
      acc.openLots += Number(a.openLots) || 0
      acc.todayTrades += Number(a.todayTrades) || 0
    }
    return acc
  }, [copiers])

  return (
    <div className="min-h-screen bg-gray-50/80">
      <header className="bg-white/95 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-30">
        <div className="w-full px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-sm">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h6v6H4V4zm10 0h6v6h-6V4zM4 14h6v6H4v-6zm10 0h6v6h-6v-6z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-gray-900 tracking-tight leading-none">
                Copy trade monitor
              </h1>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {copiers.length} copier · master {master?.hasReport ? 'live' : 'chưa báo'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold ${
              connected ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                connected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'
              }`} />
              {connected ? 'WebSocket' : 'Đang kết nối lại...'}
            </span>
            <button
              onClick={fetchSnapshot}
              className="px-3 py-1.5 text-sm rounded-lg font-medium bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
            >
              Làm mới
            </button>
          </div>
        </div>
      </header>

      <main className="w-full px-4 sm:px-6 py-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-24 text-rose-500 text-sm">{error}</div>
        ) : (
          <>
            {/* Copier totals — chỉ hiện khi có ít nhất 2 copier */}
            {copiers.length >= 2 && (
              <div className="bg-gradient-to-br from-indigo-50/50 to-white border border-indigo-100 rounded-2xl px-5 py-3 flex flex-wrap gap-x-6 gap-y-2 items-baseline">
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-[0.08em]">
                  Tổng copier
                </span>
                <span className="text-[13px] text-gray-500">
                  Balance <b className="text-gray-900 tabular-nums">{fmtCent(totals.balance)}</b>
                </span>
                <span className="text-[13px] text-gray-500">
                  Equity <b className="text-gray-900 tabular-nums">{fmtCent(totals.equity)}</b>
                </span>
                <span className="text-[13px] text-gray-500">
                  Floating <b className={`tabular-nums ${totals.floating >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {fmtCent(totals.floating)}
                  </b>
                </span>
                <span className="text-[13px] text-gray-500">
                  Lot mở <b className="text-gray-900 tabular-nums">{fmtLot(totals.openLots)}</b>
                </span>
                <span className="text-[13px] text-gray-500">
                  Lệnh hôm nay <b className="text-gray-900 tabular-nums">{totals.todayTrades}</b>
                </span>
              </div>
            )}

            {master && <AccountCard account={master} isMaster />}

            {master && copiers.length > 0 && (
              <div className="flex items-center gap-3 py-2">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-[0.12em]">
                  Copier
                </span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
            )}

            {copiers
              .sort((a, b) => String(a.id).localeCompare(String(b.id)))
              .map((c) => <AccountCard key={c.id} account={c} isMaster={false} />)
            }

            {copiers.length === 0 && !master && (
              <div className="text-center py-24">
                <div className="text-gray-300 text-4xl mb-3">📡</div>
                <p className="text-gray-400 text-sm">
                  Chưa có EA nào gửi report. Kiểm tra Master EA và Copier EA đã được cấu hình URL report chưa.
                </p>
              </div>
            )}
          </>
        )}
      </main>

      <style>{`
        @keyframes positionEnter {
          0%   { opacity: 0; transform: translateY(-8px); background: rgba(16, 185, 129, 0.10); }
          80%  { opacity: 1; transform: translateY(0);    background: rgba(16, 185, 129, 0.06); }
          100% { opacity: 1; transform: translateY(0);    background: transparent; }
        }
        .position-enter { animation: positionEnter 0.5s cubic-bezier(0.16, 1, 0.3, 1) both; }

        @keyframes positionExit {
          0%   { opacity: 1; background: rgba(244, 63, 94, 0.08); }
          100% { opacity: 0; background: rgba(244, 63, 94, 0.02); }
        }
        .position-exit { animation: positionExit 0.32s cubic-bezier(0.4, 0, 1, 1) both; }

        @keyframes valuePulseUp {
          0%   { transform: scale(1);    background: transparent; }
          30%  { transform: scale(1.08); background: rgba(16, 185, 129, 0.18); }
          100% { transform: scale(1);    background: transparent; }
        }
        @keyframes valuePulseDown {
          0%   { transform: scale(1);    background: transparent; }
          30%  { transform: scale(1.08); background: rgba(244, 63, 94, 0.18); }
          100% { transform: scale(1);    background: transparent; }
        }
        @keyframes valuePulse {
          0%   { transform: scale(1);    filter: brightness(1); }
          30%  { transform: scale(1.06); filter: brightness(1.15); }
          100% { transform: scale(1);    filter: brightness(1); }
        }
        .value-pulse-up   { animation: valuePulseUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both; border-radius: 4px; padding: 0 2px; }
        .value-pulse-down { animation: valuePulseDown 0.7s cubic-bezier(0.16, 1, 0.3, 1) both; border-radius: 4px; padding: 0 2px; }
        .value-pulse      { animation: valuePulse 0.7s cubic-bezier(0.16, 1, 0.3, 1) both; }
      `}</style>
    </div>
  )
}