import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:9009'

/* ================================================================
   HARDCODED BLACKLIST — bỏ qua các lệnh cache sai
   ================================================================ */
const IGNORED_TICKETS = new Set([
    '190694484',
    '190686869',
    '190682831',
    '190641422',
    '190611433',
    '190601705',
])

const isIgnoredPosition = (p) => {
    const t = String(p?.ticket ?? p?.key ?? p?.masterId ?? '')
    return IGNORED_TICKETS.has(t)
}
/* ================================================================
   FORMAT HELPERS
   ================================================================ */

const fmtVN = (v, d = 2) => {
    if (v == null || isNaN(Number(v))) return '—'
    return new Intl.NumberFormat('vi-VN', {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
    }).format(Number(v))
}
const fmtCent = (v, d = 2) => (v == null || isNaN(Number(v))) ? '—' : `${fmtVN(v, d)}¢`
const fmtLot = (v) => (v == null || isNaN(Number(v))) ? '—' : fmtVN(v, 2)
const fmtPrice = (v) => {
    if (v == null || isNaN(Number(v))) return '—'
    const s = String(v)
    const dec = s.includes('.') ? s.split('.')[1].length : 2
    return fmtVN(v, Math.min(dec, 5))
}
const fmtDateTime = (iso) => iso ? String(iso).replace('T', ' ').replace(/\.\d+$/, '') : '—'

const fmtAge = (ms) => {
    if (ms == null || isNaN(ms)) return '—'
    if (ms < 5000) return 'vừa xong'
    if (ms < 60000) return `${Math.floor(ms / 1000)}s trước`
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m trước`
    return `${Math.floor(ms / 3600000)}h trước`
}

const positionKey = (p) => String(p.key ?? p.ticket ?? p.masterId ?? '')

/* ================================================================
   PULSE — only for Floating P/L
   ================================================================ */

function useValuePulse(value) {
    const prevRef = useRef(value)
    const [state, setState] = useState({ key: 0, dir: null })

    useEffect(() => {
        const prev = prevRef.current
        if (prev === value) return
        if (typeof value === 'number' && typeof prev === 'number' && Math.abs(value - prev) < 1e-9) return
        const dir = typeof value === 'number' && typeof prev === 'number'
            ? value > prev ? 'up' : 'down'
            : null
        prevRef.current = value
        setState((s) => ({ key: s.key + 1, dir }))
    }, [value])

    return state
}

function PulseNumber({ value, pulseKey, direction, className = '' }) {
    const [pulse, setPulse] = useState(false)
    const first = useRef(true)

    useEffect(() => {
        if (first.current) { first.current = false; return }
        setPulse(true)
        const t = setTimeout(() => setPulse(false), 700)
        return () => clearTimeout(t)
    }, [pulseKey])

    const cls = pulse
        ? direction === 'up' ? 'value-pulse-up'
            : direction === 'down' ? 'value-pulse-down' : 'value-pulse'
        : ''

    return <span className={`tabular-nums ${className} ${cls}`}>{value}</span>
}

/* ================================================================
   FADE IN / OUT ROWS
   ================================================================ */

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

        for (const k of nextKeys) {
            const t = exitTimers.current.get(k)
            if (t) { clearTimeout(t); exitTimers.current.delete(k) }
        }

        setList((previousList) => {
            const merged = []
            const seen = new Set()
            for (const p of previousList) {
                const k = positionKey(p)
                if (nextByKey.has(k)) { merged.push({ ...nextByKey.get(k), _exiting: false }); seen.add(k) }
                else if (!p._exiting) { merged.push({ ...p, _exiting: true }); seen.add(k) }
                else { merged.push(p); seen.add(k) }
            }
            for (const p of nextArr) {
                const k = positionKey(p)
                if (!seen.has(k)) merged.push({ ...p, _exiting: false })
            }
            return merged
        })

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
                        const next = new Set(prev); next.delete(k); return next
                    })
                    enterTimers.current.delete(k)
                }, 500)
                enterTimers.current.set(k, timer)
            }
        }

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
   MODAL
   ================================================================ */

function Modal({ title, subtitle, onClose, children }) {
    useEffect(() => {
        const h = (e) => { if (e.key === 'Escape') onClose() }
        document.addEventListener('keydown', h)
        document.body.style.overflow = 'hidden'
        return () => {
            document.removeEventListener('keydown', h)
            document.body.style.overflow = ''
        }
    }, [onClose])

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4 animate-fade-in"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-md overflow-hidden animate-scale-in"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
                    <div className="min-w-0">
                        <h3 className="text-sm font-bold text-gray-900 truncate">{title}</h3>
                        {subtitle && <p className="text-[11px] text-gray-500 mt-0.5 truncate">{subtitle}</p>}
                    </div>
                    <button
                        onClick={onClose}
                        className="shrink-0 w-7 h-7 -mt-1 -mr-1 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400"
                    >✕</button>
                </div>
                <div className="max-h-[70vh] overflow-y-auto">{children}</div>
            </div>
        </div>
    )
}

function DetailRow({ label, value, valueClass = 'text-gray-900', mono }) {
    return (
        <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-b border-gray-50 last:border-b-0">
            <span className="text-[12px] text-gray-500 shrink-0">{label}</span>
            <span className={`text-[13px] font-semibold tabular-nums text-right truncate ${mono ? 'font-mono' : ''} ${valueClass}`}>
                {value}
            </span>
        </div>
    )
}

function SectionLabel({ children }) {
    return (
        <div className="px-5 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50/40 border-b border-gray-100">
            {children}
        </div>
    )
}

/* ================================================================
   POSITION DETAIL MODAL
   ================================================================ */

function PositionDetailModal({ position, accountLabel, isMaster, onClose }) {
    if (!position) return null
    const isBuy = String(position.direction).toUpperCase() === 'BUY'
    const profit = Number(position.profit)
    const profitClass = isNaN(profit) ? 'text-gray-400' : profit >= 0 ? 'text-emerald-600' : 'text-rose-500'

    return (
        <Modal
            title={`${position.symbol || 'Lệnh'} · ${position.direction || ''}`}
            subtitle={accountLabel}
            onClose={onClose}
        >
            <div className="px-5 py-4 bg-gradient-to-b from-gray-50/60 to-white border-b border-gray-100">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    Lãi/Lỗ hiện tại
                </p>
                <p className={`text-2xl font-bold tabular-nums ${profitClass}`}>
                    {isNaN(profit) ? '—' : fmtCent(profit)}
                </p>
            </div>

            <DetailRow label="Ticket" mono value={position.ticket || '—'} />
            {!isMaster && position.masterId != null && (
                <DetailRow label="Copy từ master" mono value={position.masterId || '—'} valueClass="text-indigo-600" />
            )}
            {isMaster && (
                <DetailRow label="Position ID" mono value={position.masterId || position.ticket || '—'} />
            )}
            <DetailRow label="Symbol" value={position.symbol || '—'} />
            <DetailRow
                label="Chiều"
                value={position.direction || '—'}
                valueClass={isBuy ? 'text-emerald-600' : 'text-rose-500'}
            />
            <DetailRow label="Lot" value={fmtLot(position.volume)} />
            <DetailRow label="Giá mở" value={fmtPrice(position.openPrice)} />
            <DetailRow label="Giá hiện tại" value={position.currentPrice ? fmtPrice(position.currentPrice) : '—'} />
            <DetailRow label="Thời gian mở" value={fmtDateTime(position.openTime)} />
        </Modal>
    )
}

/* ================================================================
   ACCOUNT DETAIL MODAL
   ================================================================ */

function AccountDetailModal({ account, onClose }) {
    if (!account) return null
    const isMaster = account.role === 'MASTER'
    const floatingClass = account.floating == null
        ? 'text-gray-400'
        : account.floating >= 0 ? 'text-emerald-600' : 'text-rose-500'

    return (
        <Modal
            title={account.name || account.id}
            subtitle={`${isMaster ? 'Master' : 'Copier'}${account.login ? ` · #${account.login}` : ''}`}
            onClose={onClose}
        >
            <div className="px-5 py-4 bg-gradient-to-b from-gray-50/60 to-white border-b border-gray-100">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    Floating P/L
                </p>
                <p className={`text-2xl font-bold tabular-nums ${floatingClass}`}>
                    {account.floating != null ? fmtCent(account.floating) : '—'}
                </p>
                <p className="text-[11px] text-gray-500 mt-1">
                    {account.openCount || 0} lệnh đang mở · {fmtLot(account.openLots)} lot
                </p>
            </div>

            <SectionLabel>Tài chính</SectionLabel>
            <DetailRow label="Balance" value={fmtCent(account.balance)} />
            <DetailRow label="Equity" value={fmtCent(account.equity)} />
            {account.credit > 0 && <DetailRow label="Credit" value={fmtCent(account.credit)} />}
            <DetailRow label="Margin" value={fmtCent(account.margin)} />
            <DetailRow label="Free margin" value={fmtCent(account.freeMargin)} />

            <SectionLabel>Hôm nay</SectionLabel>
            <DetailRow label="Số lệnh" value={account.todayTrades ?? 0} />
            <DetailRow label="Tổng lot" value={fmtLot(account.todayLots)} />
            <DetailRow
                label="Lời/Lỗ hôm nay"
                value={account.todayProfit != null ? fmtCent(account.todayProfit) : '—'}
                valueClass={
                    account.todayProfit == null ? 'text-gray-400'
                        : account.todayProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'
                }
            />
            <DetailRow label="— Đã đóng" value={`${account.todayClosedCount ?? 0} lệnh · ${fmtLot(account.todayClosedLots)} lot`} />
            <DetailRow
                label="— Profit đã đóng"
                value={account.todayClosedProfit != null ? fmtCent(account.todayClosedProfit) : '—'}
                valueClass={
                    account.todayClosedProfit == null ? 'text-gray-400'
                        : account.todayClosedProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'
                }
            />
            <DetailRow label="— Đang mở" value={`${(account.todayTrades ?? 0) - (account.todayClosedCount ?? 0)} lệnh`} />

            <SectionLabel>Kết nối</SectionLabel>
            {account.hasReport && (
                <DetailRow
                    label="Report gần nhất"
                    value={fmtAge(account.reportAgeMs)}
                    valueClass={account.reportAgeMs > 15000 ? 'text-amber-600' : 'text-gray-900'}
                />
            )}
            {!isMaster && (
                <>
                    <DetailRow
                        label="Poll gần nhất"
                        value={account.lastPollAgeMs != null ? fmtAge(account.lastPollAgeMs) : '—'}
                        valueClass={account.lastPollAgeMs > 10000 ? 'text-amber-600' : 'text-gray-900'}
                    />
                    {account.pendingSignals != null && (
                        <DetailRow label="Signal đang chờ" value={account.pendingSignals} />
                    )}
                    {account.successCount != null && (
                        <DetailRow label="Signal đã xử lý" value={account.successCount} />
                    )}
                    {account.failedCount != null && account.failedCount > 0 && (
                        <DetailRow label="Signal lỗi" value={account.failedCount} valueClass="text-rose-500" />
                    )}
                    <DetailRow
                        label="Kết nối server"
                        value={account.serverConnected ? 'Có' : 'Không'}
                        valueClass={account.serverConnected ? 'text-emerald-600' : 'text-rose-500'}
                    />
                </>
            )}
            <DetailRow
                label="MT5 kết nối"
                value={account.terminalConnected ? 'Có' : 'Không'}
                valueClass={account.terminalConnected ? 'text-emerald-600' : 'text-rose-500'}
            />
            {!isMaster && (
                <DetailRow
                    label="AutoTrading"
                    value={account.tradeAllowed === false ? 'Tắt' : 'Bật'}
                    valueClass={account.tradeAllowed === false ? 'text-rose-500' : 'text-emerald-600'}
                />
            )}

            <SectionLabel>Tài khoản</SectionLabel>
            <DetailRow label="Server" value={account.server || '—'} />
            <DetailRow label="Currency" value={account.currency || '—'} />
            <DetailRow label="Leverage" value={account.leverage ? `1:${account.leverage}` : '—'} />
            {account.chartSymbol && <DetailRow label="Symbol" value={account.chartSymbol} />}
            <DetailRow label="EA version" value={account.eaVersion || '—'} />

            {account.lastError && (
                <div className="px-5 py-3 bg-rose-50/60 border-t border-rose-100 text-[12px] text-rose-600">
                    <p className="font-semibold mb-0.5">Lỗi gần nhất</p>
                    <p className="break-words">{account.lastError}</p>
                </div>
            )}
        </Modal>
    )
}

/* ================================================================
   ROW
   ================================================================ */

function PositionRow({ position, isEntering, isMaster, onHover, onClick }) {
    const isBuy = String(position.direction).toUpperCase() === 'BUY'
    const profit = Number(position.profit)
    const profitClass = isNaN(profit) ? 'text-gray-300'
        : profit >= 0 ? 'text-emerald-600' : 'text-rose-500'

    const linkId = position.masterId ? String(position.masterId) : ''
    const rowClass = position._exiting ? 'position-exit' : isEntering ? 'position-enter' : ''

    return (
        <tr
            data-master-link={linkId}
            onMouseEnter={() => linkId && onHover(linkId)}
            onMouseLeave={() => onHover(null)}
            onClick={() => onClick(position)}
            className={`border-b border-gray-100/70 cursor-pointer transition-colors hover:bg-gray-50/60 ${rowClass}`}
        >
            {/* Ticket */}
            <td className="px-3 py-2 whitespace-nowrap font-mono text-[12px] text-gray-700 tabular-nums">
                {position.ticket || '—'}
            </td>

            {/* Side */}
            <td className="px-3 py-2 whitespace-nowrap text-center">
                <span className={`text-[11px] font-bold ${isBuy ? 'text-emerald-600' : 'text-rose-500'}`}>
                    {position.direction || '—'}
                </span>
            </td>

            {/* Lot */}
            <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-[12px] text-gray-700 tabular-nums">
                {fmtLot(position.volume)}
            </td>

            {/* Giá mở */}
            <td className="px-3 py-2 whitespace-nowrap text-right font-mono text-[12px] text-gray-700 tabular-nums">
                {fmtPrice(position.openPrice)}
            </td>

            {/* P/L */}
            <td className={`px-3 py-2 text-right whitespace-nowrap tabular-nums text-[13px] font-semibold ${profitClass}`}>
                {isNaN(profit) ? '—' : fmtCent(profit)}
            </td>


        </tr>
    )
}

/* ================================================================
   ACCOUNT CARD
   ================================================================ */

function AccountCard({ account, isMaster, onHoverLink, onShowPosition, onShowAccount }) {
    const filteredPositions = useMemo(
        () => (account.positions || []).filter((p) => !isIgnoredPosition(p)),
        [account.positions]
    )
    const { list, entered } = usePositionsWithExit(filteredPositions)

    const pFloat = useValuePulse(account.floating)

    const stale = account.reportAgeMs != null && account.reportAgeMs > 15000
    const noReport = !account.hasReport
    const badFeed = noReport || stale

    const roleClass = isMaster ? 'bg-indigo-600 text-white' : 'bg-gray-900 text-gray-100'
    const floatingClass = account.floating == null
        ? 'text-gray-400'
        : account.floating >= 0 ? 'text-emerald-600' : 'text-rose-500'

    const idLine = account.name || account.id
    const openCount = list.filter((p) => !p._exiting).length

    const handleRowClick = useCallback((p) => {
        onShowPosition({
            position: p,
            accountLabel: `${isMaster ? 'Master' : 'Copier'} · ${idLine}`,
            isMaster,
        })
    }, [onShowPosition, isMaster, idLine])

    return (
        <section className={`bg-white border rounded-2xl shadow-sm overflow-hidden flex flex-col ${isMaster ? 'border-indigo-200' : 'border-gray-200/80'
            }`}>
            {/* header */}
            <header className="px-4 py-3 flex items-start justify-between gap-2 border-b border-gray-100">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wider ${roleClass}`}>
                            {isMaster ? 'MASTER' : 'COPIER'}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${badFeed ? 'text-amber-600' : 'text-emerald-600'
                            }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${badFeed ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'
                                }`} />
                            {noReport ? 'Chưa có report' : stale ? 'Cũ' : fmtAge(account.reportAgeMs)}
                        </span>
                    </div>
                    <h2 className="text-[13px] font-bold text-gray-900 truncate leading-tight">{idLine}</h2>
                    <p className="text-[10px] text-gray-500 truncate tabular-nums">
                        {account.login ? `#${account.login}` : account.id}
                        {account.chartSymbol && <span> · {account.chartSymbol}</span>}
                    </p>
                </div>
                <button
                    onClick={() => onShowAccount(account)}
                    className="shrink-0 px-2 py-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-md transition-colors"
                >
                    Chi tiết
                </button>
            </header>

            {/* floating P/L + tổng kết hôm nay */}
            <div className="px-4 py-3 border-b border-gray-100 bg-gradient-to-b from-white to-gray-50/40">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                    Floating P/L
                </p>
                <div className="flex items-baseline justify-between gap-2">
                    <PulseNumber
                        value={account.floating != null ? fmtCent(account.floating) : '—'}
                        pulseKey={pFloat.key}
                        direction={pFloat.dir}
                        className={`text-xl font-bold ${floatingClass}`}
                    />
                    <p className="text-[11px] text-gray-500 tabular-nums shrink-0">
                        Đang mở {openCount} lệnh · {fmtLot(account.openLots)} lot
                    </p>
                </div>

                {/* Tổng kết trong ngày */}
                <div className="mt-2 pt-2 border-t border-dashed border-gray-100 grid grid-cols-2 gap-2">
                    {/* <div>
                        <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
                            Tổng profit (hôm nay)
                        </p>
                        <p className={`text-[13px] font-bold tabular-nums ${account.todayProfit == null ? 'text-gray-400'
                                : account.todayProfit >= 0 ? 'text-emerald-600' : 'text-rose-500'
                            }`}>
                            {account.todayProfit != null ? fmtCent(account.todayProfit) : '—'}
                        </p>
                    </div> */}
                    <div className="text-left">
                        <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
                            Tổng lot (hôm nay)
                        </p>
                        <p className="text-[13px] font-bold text-gray-700 tabular-nums">
                            {account.todayLots != null ? fmtLot(account.todayLots) : '—'}
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
                            Số orders (hôm nay)
                        </p>
                        <p className="text-[13px] font-bold text-gray-700 tabular-nums">
                            {account.todayTrades ?? '—'}
                        </p>
                    </div>
                </div>
            </div>

            {/* positions */}
            <div className="flex-1 min-h-0">
                {list.length === 0 ? (
                    <div className="px-4 py-8 text-center text-[12px] text-gray-400">
                        Không có lệnh đang mở
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="bg-gray-50/60 border-b border-gray-100">
                                    <th className="px-3 py-1.5 text-left text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
                                        Ticket
                                    </th>

                                    <th className="px-3 py-1.5 text-center text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
                                        Side
                                    </th>

                                    <th className="px-3 py-1.5 text-right text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
                                        Lot
                                    </th>

                                    <th className="px-3 py-1.5 text-right text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
                                        Giá
                                    </th>

                                    <th className="px-3 py-1.5 text-right text-[9px] font-semibold text-gray-400 uppercase tracking-wider">
                                        P/L
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {list.map((p) => (
                                    <PositionRow
                                        key={positionKey(p)}
                                        position={p}
                                        isEntering={entered.has(positionKey(p))}
                                        isMaster={isMaster}
                                        onHover={onHoverLink}
                                        onClick={handleRowClick}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {account.lastError && (
                <div className="px-4 py-2 border-t border-gray-100 bg-rose-50/40 text-[11px] text-rose-600 truncate" title={account.lastError}>
                    {account.lastError}
                </div>
            )}
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
    const [, setTick] = useState(0)
    const [highlightId, setHighlightId] = useState(null)
    const [positionModal, setPositionModal] = useState(null)
    const [accountModal, setAccountModal] = useState(null)
    const clientRef = useRef(null)

    const fetchSnapshot = useCallback(async () => {
        try {
            const res = await fetch(`${BASE}/api/public/mt5/monitor`)
            const data = await res.json()
            if (data.success) setAccounts(data.accounts || [])
            else setError(data.message || 'Không tải được dữ liệu monitor')
        } catch (e) { setError(e.message) }
        finally { setLoading(false) }
    }, [])

    useEffect(() => { fetchSnapshot() }, [fetchSnapshot])

    useEffect(() => {
        const t = setInterval(() => { if (!connected) fetchSnapshot() }, 5000)
        return () => clearInterval(t)
    }, [connected, fetchSnapshot])

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
                    } catch (e) { console.error('WS parse error', e) }
                })
            },
            onDisconnect: () => setConnected(false),
            onStompError: () => setConnected(false),
        })
        client.activate()
        clientRef.current = client
        return () => { client.deactivate() }
    }, [])

    const displayedAccounts = useMemo(() => {
        const now = Date.now()
        return accounts.map((a) => {
            const positions = (a.positions || []).filter((p) => !isIgnoredPosition(p))
            return {
                ...a,
                positions,
                openCount: positions.length,
                openLots: positions.reduce((s, p) => s + (Number(p.volume) || 0), 0),
                reportAgeMs: a.hasReport && a.builtAtMs != null
                    ? Math.max(0, now - a.builtAtMs + (a.reportAgeMs || 0))
                    : a.reportAgeMs,
                lastPollAgeMs: a.lastPollAgeMs != null && a.builtAtMs != null
                    ? Math.max(0, now - a.builtAtMs + a.lastPollAgeMs)
                    : a.lastPollAgeMs,
            }
        })
    }, [accounts])

    const master = displayedAccounts.find((a) => a.role === 'MASTER')
    const copiers = displayedAccounts
        .filter((a) => a.role === 'COPIER')
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))

    const orderedCards = master ? [master, ...copiers] : copiers

    return (
        <div className="min-h-screen bg-gray-50/80">
            {/* Cross-card highlight: single CSS rule for the whole page — no re-renders. */}
            {highlightId && (
                <style>{`
          [data-master-link="${highlightId}"] {
            background: rgba(99, 102, 241, 0.10) !important;
            box-shadow: inset 3px 0 0 rgb(99, 102, 241);
          }
          [data-master-link="${highlightId}"] td {
            color: rgb(30, 27, 75);
          }
        `}</style>
            )}

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
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold ${connected ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-400'
                            }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'
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

            <main className="w-full px-4 sm:px-6 py-4">
                {loading ? (
                    <div className="flex items-center justify-center py-24">
                        <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                ) : error ? (
                    <div className="text-center py-24 text-rose-500 text-sm">{error}</div>
                ) : orderedCards.length === 0 ? (
                    <div className="text-center py-24">
                        <div className="text-gray-300 text-4xl mb-3">📡</div>
                        <p className="text-gray-400 text-sm">
                            Chưa có EA nào gửi report. Kiểm tra Master EA và Copier EA đã được cấu hình URL report chưa.
                        </p>
                    </div>
                ) : (
                    <div
                        className="grid gap-3"
                        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}
                    >
                        {orderedCards.map((a) => (
                            <AccountCard
                                key={a.id}
                                account={a}
                                isMaster={a.role === 'MASTER'}
                                onHoverLink={setHighlightId}
                                onShowPosition={setPositionModal}
                                onShowAccount={setAccountModal}
                            />
                        ))}
                    </div>
                )}
            </main>

            {positionModal && (
                <PositionDetailModal
                    position={positionModal.position}
                    accountLabel={positionModal.accountLabel}
                    isMaster={positionModal.isMaster}
                    onClose={() => setPositionModal(null)}
                />
            )}

            {accountModal && (
                <AccountDetailModal
                    account={accountModal}
                    onClose={() => setAccountModal(null)}
                />
            )}

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
          30%  { transform: scale(1.06); background: rgba(16, 185, 129, 0.18); }
          100% { transform: scale(1);    background: transparent; }
        }
        @keyframes valuePulseDown {
          0%   { transform: scale(1);    background: transparent; }
          30%  { transform: scale(1.06); background: rgba(244, 63, 94, 0.18); }
          100% { transform: scale(1);    background: transparent; }
        }
        @keyframes valuePulse {
          0%   { transform: scale(1);    filter: brightness(1); }
          30%  { transform: scale(1.05); filter: brightness(1.15); }
          100% { transform: scale(1);    filter: brightness(1); }
        }
        .value-pulse-up   { animation: valuePulseUp 0.7s cubic-bezier(0.16, 1, 0.3, 1) both; border-radius: 4px; padding: 0 3px; }
        .value-pulse-down { animation: valuePulseDown 0.7s cubic-bezier(0.16, 1, 0.3, 1) both; border-radius: 4px; padding: 0 3px; }
        .value-pulse      { animation: valuePulse 0.7s cubic-bezier(0.16, 1, 0.3, 1) both; }

        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        .animate-fade-in { animation: fadeIn 0.15s ease-out both; }

        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.96); }
          to   { opacity: 1; transform: scale(1); }
        }
        .animate-scale-in { animation: scaleIn 0.18s cubic-bezier(0.16, 1, 0.3, 1) both; }
      `}</style>
        </div>
    )
}