import { useState, useEffect, useRef, useCallback } from 'react'
import { Client } from '@stomp/stompjs'
import SockJS from 'sockjs-client'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:9009'

/* ============ raw time utilities (giờ server MT5, không convert) ============ */
const fmtTime = (iso) => {
  if (!iso) return '—'
  const s = String(iso).replace(' ', 'T')
  const m = s.match(/T(\d{2}:\d{2}:\d{2})/)
  if (m) return m[1]
  const m2 = s.match(/(\d{2}:\d{2}:\d{2})/)
  return m2 ? m2[1] : '—'
}
const fmtDate = (iso) => {
  if (!iso) return '—'
  const s = String(iso).replace(' ', 'T')
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'
}
const fmtDateTime = (iso) => `${fmtDate(iso)} ${fmtTime(iso)}`

// Thời điểm iso coi là UTC string (không có tz) — browser compare raw.
const minutesUntil = (iso) => {
  if (!iso) return null
  try {
    const target = new Date(String(iso).replace(' ', 'T') + 'Z').getTime()
    const now = Date.now()
    return Math.round((target - now) / 60000)
  } catch { return null }
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
  3: { label: 'HIGH',   dot: 'bg-rose-500',  text: 'text-rose-700',  bg: 'bg-rose-50',  border: 'border-rose-200' },
  2: { label: 'MEDIUM', dot: 'bg-amber-400', text: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200' },
  1: { label: 'LOW',    dot: 'bg-sky-400',   text: 'text-sky-700',   bg: 'bg-sky-50',   border: 'border-sky-200' },
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
  const [snapshot, setSnapshot] = useState(null)  // { news, updatedAt, sourceLogin }
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
      // Server trả LocalDateTime (không timezone) — treat là giờ local
      // của browser (giả định browser cùng tz với server). KHÔNG append 'Z'
      // vì sẽ bị JS parse thành UTC → lệch múi giờ.
      const diff = Math.floor((Date.now() - new Date(snapshot.updatedAt).getTime()) / 1000)
      if (diff < 0) return 'vừa xong'
      if (diff < 60) return `${diff}s trước`
      if (diff < 3600) return `${Math.floor(diff / 60)}m trước`
      return `${Math.floor(diff / 3600)}h trước`
    } catch { return null }
  })()

  return (
    <div className="min-h-[100dvh] md:h-[100dvh] bg-gray-50 text-gray-900 flex flex-col md:overflow-hidden">
      <header className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap z-30 shadow-sm flex-shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500 to-amber-500 flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
          </div>
          <span className="text-base font-bold tracking-tight">News Filter Monitor</span>
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${connected ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-gray-100 text-gray-400 border border-gray-200'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-300'}`} />
            {connected ? 'Live' : 'Offline'}
          </span>
          <a href="/exness" className="text-xs text-violet-600 hover:underline">← Lệnh</a>
        </div>
        <div className="text-xs text-gray-500">
          {snapshot?.sourceLogin && <>Nguồn: <b className="text-gray-700 tabular-nums">{snapshot.sourceLogin}</b></>}
          {updatedAgo && <span className="ml-2">· cập nhật {updatedAgo}</span>}
        </div>
      </header>

      <main className="flex-1 overflow-auto p-3 sm:p-5">
        {!news ? (
          <div className="w-full">
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <p className="text-sm text-gray-500">
                Chưa có dữ liệu news. Đợi 1 vài giây để EA sync lần đầu, hoặc kiểm tra <code>InpUseGoldNewsFilter</code> đang bật trên EA.
              </p>
            </div>
          </div>
        ) : (
          <div className="w-full space-y-3">
            {/* ======== CURRENT / NEAREST ======== */}
            {currentBlock?.name && (
              <div className={`rounded-xl border p-4 sm:p-5 shadow-sm ${blocked ? 'bg-rose-50 border-rose-200' : 'bg-white border-gray-200'}`}>
                <h3 className="text-xs sm:text-sm font-semibold text-gray-800 mb-3 uppercase tracking-wider">
                  {blocked ? '⏸ Tin đang chặn hiện tại' : 'Tin gần nhất (đã qua / sắp tới)'}
                </h3>
                <div className="flex items-start gap-3 flex-wrap">
                  <ImpactBadge importance={currentBlock.importance} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-gray-900 text-sm sm:text-base break-words">{currentBlock.name}</div>
                    <div className="text-xs text-gray-500 mt-1 tabular-nums leading-relaxed">
                      Giờ tin: <b className="text-gray-700">{fmtDateTime(currentBlock.time)}</b>
                      <br />
                      Window chặn: <b className="text-gray-700">{fmtTime(currentBlock.blockFrom)} → {fmtTime(currentBlock.blockTo)}</b>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ======== UPCOMING ======== */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 sm:px-5 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-xs sm:text-sm font-semibold text-gray-800 uppercase tracking-wider">Tin sắp tới (7 ngày, USD)</h3>
                <span className="text-xs text-gray-500 tabular-nums">{upcoming.length} tin</span>
              </div>
              {upcoming.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm px-4">Không có tin HIGH impact nào trong 7 ngày tới</div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-white">
                        <tr className="border-b border-gray-100">
                          <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Thời gian</th>
                          <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Impact</th>
                          <th className="px-4 py-2 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Tên tin</th>
                          <th className="px-4 py-2 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Còn</th>
                        </tr>
                      </thead>
                      <tbody>
                        {upcoming.map((n, i) => {
                          const mins = minutesUntil(n.time)
                          const isSoon = mins != null && mins >= 0 && mins <= (news.minutesBefore || 60)
                          return (
                            <tr key={i} className={`border-b border-gray-100 ${isSoon ? 'bg-rose-50/40' : ''}`}>
                              <td className="px-4 py-2.5 text-xs tabular-nums text-gray-700 whitespace-nowrap">{fmtDateTime(n.time)}</td>
                              <td className="px-4 py-2.5"><ImpactBadge importance={n.importance} /></td>
                              <td className="px-4 py-2.5 text-xs text-gray-800">{n.name}</td>
                              <td className={`px-4 py-2.5 text-right text-xs tabular-nums font-semibold whitespace-nowrap
                                ${isSoon ? 'text-rose-600' : 'text-gray-400'}`}>
                                {mins == null ? '—' : (mins < 0 ? 'đã qua' : humanDelta(mins))}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile card list */}
                  <div className="md:hidden divide-y divide-gray-100">
                    {upcoming.map((n, i) => {
                      const mins = minutesUntil(n.time)
                      const isSoon = mins != null && mins >= 0 && mins <= (news.minutesBefore || 60)
                      return (
                        <div key={i} className={`px-4 py-3 ${isSoon ? 'bg-rose-50/40' : ''}`}>
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <ImpactBadge importance={n.importance} />
                            <span className={`text-xs tabular-nums font-semibold ${isSoon ? 'text-rose-600' : 'text-gray-400'}`}>
                              {mins == null ? '—' : (mins < 0 ? 'đã qua' : humanDelta(mins))}
                            </span>
                          </div>
                          <div className="text-sm text-gray-800 font-medium break-words">{n.name}</div>
                          <div className="text-[11px] text-gray-500 tabular-nums mt-0.5">{fmtDateTime(n.time)}</div>
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