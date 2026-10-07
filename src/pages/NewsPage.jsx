import { useState, useEffect, useRef, useCallback } from 'react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import DarkModeToggle from '../components/common/DarkModeToggle'
import useDarkMode from '../hooks/useDarkMode'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:9009'

/* ============ time utilities — convert MT5 server time (UTC) to Vietnam time (UTC+7) ============ */
// Parse ISO string from backend. If no timezone info, treat as UTC (MT5 server time).
const parseAsUTC = (iso) => {
  if (!iso) return null
  const s = String(iso).trim().replace(' ', 'T')
  const hasTZ = /([zZ]|[+-]\d{2}:?\d{2})$/.test(s)
  const d = new Date(hasTZ ? s : s + 'Z')
  return isNaN(d.getTime()) ? null : d
}

const VN_TZ = 'Asia/Ho_Chi_Minh'

const fmtTime = (iso) => {
  const d = parseAsUTC(iso)
  if (!d) return '—'
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TZ,
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).formatToParts(d)
  const get = (type) => (parts.find(p => p.type === type)?.value ?? '00').padStart(2, '0')
  return `${get('hour')}:${get('minute')}:${get('second')}`
}

const fmtDate = (iso) => {
  const d = parseAsUTC(iso)
  if (!d) return '—'
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: VN_TZ,
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).formatToParts(d)
  const get = (type) => parts.find(p => p.type === type)?.value ?? ''
  return `${get('day')}/${get('month')}/${get('year')}`
}

const fmtDateTime = (iso) => {
  const d = parseAsUTC(iso)
  if (!d) return '—'
  return `${fmtDate(iso)} ${fmtTime(iso)}`
}

const minutesUntil = (iso) => {
  const d = parseAsUTC(iso)
  if (!d) return null
  return Math.round((d.getTime() - Date.now()) / 60000)
}
const humanDelta = (minutes) => {
  if (minutes == null) return ''
  const abs = Math.abs(minutes)
  const sign = minutes < 0 ? '-' : ''
  if (abs < 60) return `${sign}${abs}m`
  const h = Math.floor(abs / 60)
  const m = abs % 60
  if (abs < 24 * 60) return `${sign}${h}h${m > 0 ? ` ${m}m` : ''}`
  const d = Math.floor(h / 24)
  const hh = h % 24
  return `${sign}${d}d${hh > 0 ? ` ${hh}h` : ''}`
}

const IMPACT_META = {
  3: { label: 'HIGH',   dot: 'bg-rose-500',  text: 'text-rose-700 dark:text-rose-400',  bg: 'bg-rose-50 dark:bg-rose-900/30',  border: 'border-rose-200 dark:border-rose-700' },
  2: { label: 'MEDIUM', dot: 'bg-amber-400', text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-900/30', border: 'border-amber-200 dark:border-amber-700' },
  1: { label: 'LOW',    dot: 'bg-sky-400',   text: 'text-sky-700 dark:text-sky-400',   bg: 'bg-sky-50 dark:bg-sky-900/30',   border: 'border-sky-200 dark:border-sky-700' },
}
function ImpactBadge({ importance }) {
  const m = IMPACT_META[importance] || IMPACT_META[1]
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${m.text} ${m.bg} ${m.border}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  )
}

export default function NewsPage() {
  const [dark, toggleDark] = useDarkMode()
  const [snapshot, setSnapshot] = useState(null)
  const [connected, setConnected] = useState(false)
  const clientRef = useRef(null)

  const refresh = useCallback(() => {
    fetch(`${BASE}/api/public/mt5-bot/news`).then(r => r.json()).then(d => {
      if (d.success) setSnapshot(d)
    }).catch(console.error)
  }, [])
  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS(BASE + '/ws'),
      reconnectDelay: 3000,
      onConnect: () => {
        setConnected(true)
        client.subscribe('/topic/mt5-bot/news', (msg) => {
          try { setSnapshot(JSON.parse(msg.body)) } catch (e) { console.error(e) }
        })
      },
      onDisconnect: () => setConnected(false),
      onStompError: () => setConnected(false),
    })
    client.activate(); clientRef.current = client
    return () => client.deactivate()
  }, [])

  const news = snapshot?.news
  const currentBlock = news?.currentBlock
  const upcoming = news?.upcoming || []
  const blocked = news?.tradingBlockedByNews === true
  const updatedAgo = (() => {
    if (!snapshot?.updatedAt) return null
    try {
      const diff = Math.floor((Date.now() - new Date(snapshot.updatedAt).getTime()) / 1000)
      if (diff < 0) return 'vừa xong'
      if (diff < 60) return `${diff}s trước`
      if (diff < 3600) return `${Math.floor(diff / 60)}m trước`
      return `${Math.floor(diff / 3600)}h trước`
    } catch { return null }
  })()

  return (
    <div className="min-h-[100dvh] md:h-[100dvh] bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col md:overflow-hidden">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap z-30 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
          </div>
          <span className="text-base font-bold tracking-tight">News Filter Monitor</span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${connected ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-700' : 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-600'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300 dark:bg-gray-600'}`} />
            {connected ? 'Live' : 'Offline'}
          </span>
          <a href="/exness" className="text-xs text-violet-600 dark:text-violet-400 hover:underline">← Lệnh</a>
        </div>
        <div className="flex items-center gap-3 flex-wrap text-xs text-gray-500 dark:text-gray-400">
          {snapshot?.sourceLogin && <>Nguồn: <b className="text-gray-700 dark:text-gray-200 tabular-nums">{snapshot.sourceLogin}</b></>}
          {updatedAgo && <span>· cập nhật {updatedAgo}</span>}
          <DarkModeToggle dark={dark} onToggle={toggleDark} />
        </div>
      </header>

      <main className="flex-1 overflow-auto p-3 sm:p-5">
        {!news ? (
          <div className="w-full">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Chưa có dữ liệu news. Đợi 1 vài giây để EA sync lần đầu, hoặc kiểm tra <code>InpUseGoldNewsFilter</code> đang bật trên EA.
              </p>
            </div>
          </div>
        ) : (
          <div className="w-full space-y-3">
            {currentBlock?.name && (
              <div className={`rounded-xl border p-4 sm:p-5 shadow-sm ${blocked ? 'bg-rose-50 dark:bg-rose-900/30 border-rose-200 dark:border-rose-700' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'}`}>
                <h3 className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-100 mb-3 uppercase tracking-wider">
                  {blocked ? '⏸ Tin đang chặn hiện tại' : 'Tin gần nhất (đã qua / sắp tới)'}
                </h3>
                <div className="flex items-start gap-3 flex-wrap">
                  <ImpactBadge importance={currentBlock.importance} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 dark:text-gray-100 text-sm sm:text-base break-words">{currentBlock.name}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 tabular-nums leading-relaxed">
                      Giờ tin: <b className="text-gray-700 dark:text-gray-200">{fmtDateTime(currentBlock.time)}</b>
                      <br />
                      Window chặn: <b className="text-gray-700 dark:text-gray-200">{fmtTime(currentBlock.blockFrom)} → {fmtTime(currentBlock.blockTo)}</b>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="px-4 sm:px-5 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-100 uppercase tracking-wider">Tin sắp tới (7 ngày, USD)</h3>
                <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">{upcoming.length} tin</span>
              </div>
              {upcoming.length === 0 ? (
                <div className="py-12 text-center text-gray-400 dark:text-gray-500 text-sm px-4">Không có tin HIGH impact nào trong 7 ngày tới</div>
              ) : (
                <>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-white dark:bg-gray-800">
                        <tr className="border-b border-gray-100 dark:border-gray-700">
                          <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider whitespace-nowrap">Thời gian lên tin</th>
                          <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider whitespace-nowrap">Mức độ ảnh hưởng</th>
                          <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">Title</th>
                          <th className="px-4 py-2 text-right text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider whitespace-nowrap">Thời gian còn lại</th>
                        </tr>
                      </thead>
                      <tbody>
                        {upcoming.map((n, i) => {
                          const mins = minutesUntil(n.time)
                          const isSoon = mins != null && mins >= 0 && mins <= (news.minutesBefore || 60)
                          return (
                            <tr key={i} className={`border-b border-gray-100 dark:border-gray-700 ${isSoon ? 'bg-rose-50/40 dark:bg-rose-900/20' : ''}`}>
                              <td className="px-4 py-2.5 text-xs tabular-nums text-gray-700 dark:text-gray-200 whitespace-nowrap">{fmtDateTime(n.time)}</td>
                              <td className="px-4 py-2.5"><ImpactBadge importance={n.importance} /></td>
                              <td className="px-4 py-2.5 text-xs text-gray-800 dark:text-gray-100">{n.name}</td>
                              <td className={`px-4 py-2.5 text-right text-xs tabular-nums font-semibold whitespace-nowrap
                                ${isSoon ? 'text-rose-600 dark:text-rose-400' : 'text-gray-400 dark:text-gray-500'}`}>
                                {mins == null ? '—' : (mins < 0 ? 'đã qua' : humanDelta(mins))}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="md:hidden divide-y divide-gray-100 dark:divide-gray-700">
                    {upcoming.map((n, i) => {
                      const mins = minutesUntil(n.time)
                      const isSoon = mins != null && mins >= 0 && mins <= (news.minutesBefore || 60)
                      return (
                        <div key={i} className={`px-4 py-3 ${isSoon ? 'bg-rose-50/40 dark:bg-rose-900/20' : ''}`}>
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <ImpactBadge importance={n.importance} />
                            <span className={`text-xs tabular-nums font-semibold ${isSoon ? 'text-rose-600 dark:text-rose-400' : 'text-gray-400 dark:text-gray-500'}`}>
                              {mins == null ? '—' : (mins < 0 ? 'đã qua' : humanDelta(mins))}
                            </span>
                          </div>
                          <div className="text-sm text-gray-800 dark:text-gray-100 font-medium break-words">{n.name}</div>
                          <div className="text-[11px] text-gray-500 dark:text-gray-400 tabular-nums mt-0.5">{fmtDateTime(n.time)}</div>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}