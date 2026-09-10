import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { getDashboard, listTasks, reassignTask, getAssignableUsers } from '../../services/taskApi'
import TaskDetailModal from './TaskDetailModal'
import Select from '../ui/Select'
import { useToast } from '../ui/Toast'

const pad = n => String(n).padStart(2, '0')
const fmtTime = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}` }
const fmtShort = ts => { const d = new Date(ts); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}` }
const WDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const dayLabel = d => WDAY[d.getDay()]
const PRI_COLOR = { URGENT: '#ef4444', HIGH: '#f59e0b', MEDIUM: '#6366f1', LOW: '#94a3b8' }
const STATUS_DOT = { NOT_STARTED: 'bg-gray-400', IN_PROGRESS: 'bg-blue-500', COMPLETED: 'bg-emerald-500', PAUSED: 'bg-amber-400', CANCELLED: 'bg-red-400' }

// Bar chart colors — 3 loại: chưa xử lý, đang xử lý, hoàn thành
const BAR_COLORS = {
  notStarted: '#94a3b8',  // gray — chưa xử lý (progress = 0%)
  inProgress: '#6366f1',  // indigo — đang xử lý (0% < progress < 100%)
  completed: '#10b981',   // emerald — hoàn thành (progress = 100%)
}

// ═══════════════════════════════════════════════════════════════════
export default function AdminTaskDashboard() {
  const [stats, setStats] = useState(null)
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [detailId, setDetailId] = useState(null)
  const [calOffset, setCalOffset] = useState(0)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [sR, tR] = await Promise.all([getDashboard(), listTasks({ size: 500 })])
      if (sR.data?.code === 900) setStats(sR.data.data)
      if (tR.data?.code === 900) setTasks(tR.data.data?.content || [])
    } catch { } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { const i = setInterval(() => load(), 15000); return () => clearInterval(i) }, [load])

  if (loading && !stats) return <div className="flex items-center justify-center h-full"><div className="spinner" /></div>
  if (!stats) return null

  return (
    <div className="flex flex-col lg:flex-row gap-3 h-full overflow-hidden">
      {/* Left 30% — full height, internal scroll */}
      <div className="w-full lg:w-[30%] flex flex-col gap-2 overflow-y-auto min-h-0">
        <LeftPanel stats={stats} />
      </div>
      {/* Right 70% — full height */}
      <div className="w-full lg:w-[70%] flex flex-col min-h-0">
        <CalendarPanel tasks={tasks} calOffset={calOffset} setCalOffset={setCalOffset} onTaskClick={setDetailId} />
      </div>
      {detailId && <TaskDetailModal taskId={detailId} onClose={() => setDetailId(null)} isAdmin onRefresh={load} />}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// LEFT PANEL
// ═══════════════════════════════════════════════════════════════════
function LeftPanel({ stats }) {
  const cards = [
    { label: 'Hoạt động', val: stats.active, cls: 'from-blue-500 to-blue-600' },
    { label: 'Chưa XL', val: stats.zeroProgress, cls: 'from-slate-400 to-slate-500' },
    { label: 'Đang XL', val: stats.underHundred, cls: 'from-indigo-500 to-violet-600' },
    { label: 'Gần hạn', val: stats.dueSoon, cls: 'from-amber-400 to-orange-500' },
    { label: 'Trễ', val: stats.overdue, cls: 'from-red-500 to-rose-600' },
  ]

  return (
    <>
      {/* Summary */}
      <div className="grid grid-cols-5 gap-2 flex-shrink-0">
        {cards.map(c => (
          <div key={c.label} className={`rounded-xl bg-gradient-to-br ${c.cls} p-3 text-white text-center shadow`}>
            <p className="text-2xl font-extrabold tabular-nums leading-none">{c.val || 0}</p>
            <p className="text-[10px] font-semibold opacity-85 mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      {/* TradingView-style stacked bar chart */}
      <div className="card p-0 flex-1 min-h-[200px] flex flex-col overflow-hidden">
        <TradingViewBarChart data={stats.dailyStats || []} />
      </div>

      {/* Activity */}
      <div className="card p-3 flex flex-col flex-1 min-h-[140px]">
        <h3 className="text-[13px] font-bold text-gray-700 mb-2 shrink-0">Hoạt động gần đây</h3>
        <div className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
          {(stats.recentActivity || []).length === 0 && <p className="text-[12px] text-gray-400 py-3 text-center">Chưa có</p>}
          {(stats.recentActivity || []).slice(0, 10).map((a, i) => {
            const actionCfg = {
              SUBTASK_DONE: { icon: '✓', bg: 'bg-emerald-100', fg: 'text-emerald-600' },
              COMPLETE: { icon: '★', bg: 'bg-green-100', fg: 'text-green-600' },
              PAUSE: { icon: '⏸', bg: 'bg-amber-100', fg: 'text-amber-600' },
              RESUME: { icon: '▶', bg: 'bg-blue-100', fg: 'text-blue-600' },
              EXTENSION: { icon: '⏱', bg: 'bg-purple-100', fg: 'text-purple-600' },
              PROGRESS: { icon: '↑', bg: 'bg-blue-100', fg: 'text-blue-600' },
            }[a.action] || { icon: '•', bg: 'bg-gray-100', fg: 'text-gray-600' }
            const actionLabel = {
              SUBTASK_DONE: null, COMPLETE: 'Hoàn thành task', PAUSE: 'Tạm dừng',
              RESUME: 'Mở lại', EXTENSION: 'Gia hạn', PROGRESS: null,
            }[a.action]
            return (
              <div key={i} className="flex items-start gap-2 py-1.5 border-b border-gray-100 last:border-0">
                <div className={`w-5 h-5 rounded-full ${actionCfg.bg} ${actionCfg.fg} flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5`}>
                  {actionCfg.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-800 font-medium truncate leading-tight">{a.taskTitle}</p>
                  {a.subItemTitle && <p className="text-[10px] text-emerald-600 truncate">✓ {a.subItemTitle}</p>}
                  {actionLabel && <p className="text-[10px] text-gray-500 truncate">{actionLabel}</p>}
                  <span className="text-[9px] text-gray-400">{a.username} · {fmtShort(a.timestamp)} · <b className="text-blue-600">{a.progress}%</b></span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════
// TRADING-VIEW STYLE STACKED BAR CHART (#4)
// ═══════════════════════════════════════════════════════════════════
function TradingViewBarChart({ data }) {
  const containerRef = useRef(null)
  const canvasRef = useRef(null)
  const [tooltip, setTooltip] = useState(null)
  const [offset, setOffset] = useState(0)
  const [visibleCount, setVisibleCount] = useState(10)
  const panRef = useRef({ active: false, startX: 0, startOffset: 0 })

  const maxOffset = Math.max(0, data.length - visibleCount)

  // Compute visible slice
  const startIdx = Math.max(0, data.length - visibleCount - offset)
  const endIdx = startIdx + visibleCount
  const visible = data.slice(startIdx, endIdx)

  // Y-axis max — 1.5x giá trị lớn nhất để cột chỉ chiếm ~70% chiều cao
  const yMax = Math.max(1, ...visible.map(d => (d.notStarted || 0) + (d.inProgress || 0) + (d.completed || 0)))
  const rawMax = Math.ceil(yMax * 1.5)
  // Làm tròn đẹp lên bội số gần nhất
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax || 1)))
  const niceMax = Math.max(rawMax, Math.ceil(rawMax / magnitude) * magnitude)

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const rect = container.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    const W = rect.width
    const H = rect.height
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.style.width = W + 'px'
    canvas.style.height = H + 'px'

    const ctx = canvas.getContext('2d')
    ctx.scale(dpr, dpr)

    const PL = 36, PR = 12, PT = 8, PB = 28
    const cW = W - PL - PR
    const cH = H - PT - PB

    // Background — light theme
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, W, H)

    // Grid lines
    const gridLines = 5
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 1
    ctx.setLineDash([])
    for (let i = 0; i <= gridLines; i++) {
      const y = PT + (cH / gridLines) * i
      ctx.beginPath()
      ctx.moveTo(PL, y)
      ctx.lineTo(W - PR, y)
      ctx.stroke()

      // Y labels
      const val = Math.round(niceMax * (1 - i / gridLines))
      ctx.fillStyle = '#94a3b8'
      ctx.font = '9px monospace'
      ctx.textAlign = 'right'
      ctx.fillText(val, PL - 4, y + 3)
    }

    // Bars
    if (visible.length === 0) return

    const barGap = Math.max(2, Math.min(6, cW / visible.length * 0.15))
    const barW = Math.max(4, (cW - barGap * (visible.length + 1)) / visible.length)

    visible.forEach((d, i) => {
      const x = PL + barGap + i * (barW + barGap)
      const total = (d.notStarted || 0) + (d.inProgress || 0) + (d.completed || 0)
      const h = total > 0 ? (total / niceMax) * cH : 0

      // Stacked bars: chưa XL (bottom) → đang XL (middle) → hoàn thành (top)
      let yStart = PT + cH - h
      const segments = [
        { val: d.notStarted || 0, color: BAR_COLORS.notStarted },
        { val: d.inProgress || 0, color: BAR_COLORS.inProgress },
        { val: d.completed || 0, color: BAR_COLORS.completed },
      ]

      segments.forEach(seg => {
        if (seg.val <= 0) return
        const segH = (seg.val / niceMax) * cH
        ctx.fillStyle = seg.color
        ctx.beginPath()
        const r = Math.min(2, segH / 2, barW / 2)
        roundRect(ctx, x, yStart, barW, segH, r)
        ctx.fill()
        yStart += segH
      })

      // X label
      ctx.fillStyle = '#94a3b8'
      ctx.font = '8px monospace'
      ctx.textAlign = 'center'
      const label = d.date.slice(5) // MM-DD
      ctx.fillText(label, x + barW / 2, H - PB + 12)
    })

    // Bottom line
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(PL, PT + cH)
    ctx.lineTo(W - PR, PT + cH)
    ctx.stroke()

  }, [visible, niceMax, visibleCount])

  // Pan events
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const down = e => {
      const touch = e.touches ? e.touches[0] : e
      panRef.current = { active: true, startX: touch.clientX, startOffset: offset }
      el.style.cursor = 'grabbing'
    }

    const move = e => {
      if (!panRef.current.active) return
      e.preventDefault()
      const touch = e.touches ? e.touches[0] : e
      const dx = touch.clientX - panRef.current.startX
      const rect = el.getBoundingClientRect()
      const pxPerBar = rect.width / visibleCount
      const change = Math.round(dx / pxPerBar)
      const newOff = Math.max(0, Math.min(maxOffset, panRef.current.startOffset + change))
      setOffset(newOff)
    }

    const up = () => { panRef.current.active = false; el.style.cursor = 'grab' }

    el.style.cursor = 'grab'
    el.addEventListener('mousedown', down)
    el.addEventListener('mousemove', move)
    el.addEventListener('mouseup', up)
    el.addEventListener('mouseleave', up)
    el.addEventListener('touchstart', down, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', up)

    // Wheel zoom
    const wheel = e => {
      e.preventDefault()
      setVisibleCount(prev => Math.max(5, Math.min(30, prev + (e.deltaY > 0 ? 2 : -2))))
    }
    el.addEventListener('wheel', wheel, { passive: false })

    return () => {
      el.removeEventListener('mousedown', down)
      el.removeEventListener('mousemove', move)
      el.removeEventListener('mouseup', up)
      el.removeEventListener('mouseleave', up)
      el.removeEventListener('touchstart', down)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [offset, maxOffset, visibleCount])

  // Click for tooltip — only when clicking directly on a bar column with data
  const handleClick = e => {
    const rect = containerRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const PL = 36, PR = 12, PT = 8, PB = 28
    const cW = rect.width - PL - PR
    const cH = rect.height - PT - PB

    if (visible.length === 0) { setTooltip(null); return }

    const barGap = Math.max(2, Math.min(6, cW / visible.length * 0.15))
    const barW = Math.max(4, (cW - barGap * (visible.length + 1)) / visible.length)

    // Find which bar index the click falls on
    const relX = x - PL - barGap
    const step = barW + barGap
    const barIdx = Math.floor(relX / step)
    const posInBar = relX - barIdx * step // position within (barW + barGap) slot

    // Check: click must be within bar bounds (not in gap), and within valid index
    if (barIdx < 0 || barIdx >= visible.length || posInBar > barW) {
      setTooltip(null)
      return
    }

    const d = visible[barIdx]
    const total = (d.notStarted || 0) + (d.inProgress || 0) + (d.completed || 0)

    // Check: bar must have data, and click Y must be within the bar's vertical extent
    if (total <= 0) { setTooltip(null); return }

    const barH = (total / niceMax) * cH
    const barTop = PT + cH - barH
    const barBottom = PT + cH

    if (y < barTop || y > barBottom) { setTooltip(null); return }

    setTooltip({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      date: d.date,
      notStarted: d.notStarted || 0,
      inProgress: d.inProgress || 0,
      completed: d.completed || 0,
      total,
    })
  }

  return (
    <div className="relative flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200">
        <span className="text-[10px] font-bold text-gray-500">TASK · 30 NGÀY</span>
        <div className="flex gap-3">
          <Leg color={BAR_COLORS.notStarted} label="Chưa XL" />
          <Leg color={BAR_COLORS.inProgress} label="Đang XL" />
          <Leg color={BAR_COLORS.completed} label="Xong" />
        </div>
      </div>

      {/* Chart area */}
      <div
        ref={containerRef}
        className="flex-1 relative select-none min-h-0"
        onClick={handleClick}
      >
        <canvas ref={canvasRef} className="absolute inset-0" />

        {/* Tooltip */}
        {tooltip && (
          <div
            className="absolute z-10 pointer-events-none"
            style={{ left: Math.min(tooltip.x, (containerRef.current?.offsetWidth || 200) - 130), top: Math.max(4, tooltip.y - 80) }}
          >
            <div className="bg-white border border-gray-200 rounded-lg p-2 shadow-lg">
              <p className="text-[10px] text-gray-700 font-bold mb-1">{tooltip.date}</p>
              <div className="space-y-0.5">
                <TooltipRow color={BAR_COLORS.notStarted} label="Chưa xử lý" val={tooltip.notStarted} />
                <TooltipRow color={BAR_COLORS.inProgress} label="Đang xử lý" val={tooltip.inProgress} />
                <TooltipRow color={BAR_COLORS.completed} label="Hoàn thành" val={tooltip.completed} />
              </div>
              <div className="border-t border-gray-200 mt-1 pt-1">
                <p className="text-[10px] text-gray-800 font-bold">Tổng: {tooltip.total}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Scrollbar indicator */}
      <div className="h-1 bg-gray-200 mx-3 mb-1 rounded-full overflow-hidden">
        <div
          className="h-full bg-gray-400 rounded-full transition-all"
          style={{
            width: `${Math.max(10, (visibleCount / data.length) * 100)}%`,
            marginLeft: `${data.length > 0 ? ((data.length - visibleCount - offset) / data.length) * 100 : 0}%`
          }}
        />
      </div>
    </div>
  )
}

function roundRect(ctx, x, y, w, h, r) {
  if (h < 1) { ctx.rect(x, y, w, h); return }
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h)
  ctx.lineTo(x, y + h)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

function Leg({ color, label }) {
  return <span className="flex items-center gap-1 text-[9px] text-gray-500"><span className="w-2 h-2 rounded-sm" style={{ background: color }} />{label}</span>
}

function TooltipRow({ color, label, val }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-sm" style={{ background: color }} />
      <span className="text-[9px] text-gray-500 flex-1">{label}</span>
      <span className="text-[10px] text-gray-800 font-bold tabular-nums">{val}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// CALENDAR
// ═══════════════════════════════════════════════════════════════════
function CalendarPanel({ tasks, calOffset, setCalOffset, onTaskClick }) {
  const containerRef = useRef(null)
  const VISIBLE_DAYS = 7
  const HOUR_H = 48
  const START_HOUR = 0
  const END_HOUR = 23
  const hours = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i)
  const TOP_PAD = 10
  const totalHeight = hours.length * HOUR_H + TOP_PAD * 2

  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d }, [])
  const days = useMemo(() => {
    const base = new Date(today)
    base.setDate(base.getDate() + calOffset)
    return Array.from({ length: VISIBLE_DAYS }, (_, i) => {
      const d = new Date(base)
      d.setDate(d.getDate() + i)
      return d
    })
  }, [calOffset, today])

  // Pan
  const panState = useRef({ active: false, startX: 0, startY: 0, scrollTop: 0, startOffset: 0 })

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const down = e => {
      const touch = e.touches ? e.touches[0] : e
      panState.current = { active: true, startX: touch.clientX, startY: touch.clientY, scrollTop: el.scrollTop, startOffset: calOffset }
      el.style.cursor = 'grabbing'; el.style.userSelect = 'none'
    }
    const move = e => {
      if (!panState.current.active) return
      e.preventDefault()
      const touch = e.touches ? e.touches[0] : e
      const dy = touch.clientY - panState.current.startY
      el.scrollTop = panState.current.scrollTop - dy
      const dx = touch.clientX - panState.current.startX
      const dayWidth = el.scrollWidth / VISIBLE_DAYS
      const dayChange = Math.round(dx / dayWidth)
      setCalOffset(panState.current.startOffset - dayChange)
    }
    const up = () => { panState.current.active = false; el.style.cursor = 'grab'; el.style.userSelect = '' }

    el.style.cursor = 'grab'
    el.addEventListener('mousedown', down)
    el.addEventListener('mousemove', move)
    el.addEventListener('mouseup', up)
    el.addEventListener('mouseleave', up)
    el.addEventListener('touchstart', down, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    el.addEventListener('touchend', up)
    return () => {
      el.removeEventListener('mousedown', down)
      el.removeEventListener('mousemove', move)
      el.removeEventListener('mouseup', up)
      el.removeEventListener('mouseleave', up)
      el.removeEventListener('touchstart', down)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', up)
    }
  }, [calOffset, setCalOffset, VISIBLE_DAYS])

  useEffect(() => {
    if (containerRef.current) {
      const nowH = new Date().getHours()
      containerRef.current.scrollTop = Math.max(0, (nowH - 1) * HOUR_H + TOP_PAD)
    }
  }, [])

  const tasksForDay = day => {
    const ds = day.getTime(), de = ds + 86400000
    return tasks.filter(t => t.deadline && t.deadline >= ds && t.deadline < de && t.status !== 'CANCELLED')
  }
  const isToday = d => d.toDateString() === today.toDateString()
  const nowH = new Date().getHours(), nowM = new Date().getMinutes()
  const nowTop = TOP_PAD + (nowH - START_HOUR + nowM / 60) * HOUR_H

  return (
    <div className="card flex flex-col h-full overflow-hidden">
      <div className="flex items-center border-b border-gray-100 px-1 py-1 shrink-0">
        <button onClick={() => setCalOffset(0)} className="text-[9px] font-semibold text-blue-600 hover:text-blue-700 px-2 shrink-0">Hôm nay</button>
        <div className="flex flex-1 ml-6">
          {days.map((d, i) => (
            <div key={i} className="flex-1 text-center px-0.5">
              <p className="text-[8px] text-gray-400 font-semibold">{dayLabel(d)}</p>
              <div className={`text-xs font-bold mx-auto w-6 h-6 rounded-full flex items-center justify-center
                ${isToday(d) ? 'bg-blue-600 text-white' : 'text-gray-800'}`}>{d.getDate()}</div>
              <p className="text-[7px] text-gray-400">{pad(d.getMonth() + 1)}/{d.getFullYear()}</p>
            </div>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="flex-1 overflow-y-auto overflow-x-hidden relative min-h-0">
        <div className="flex" style={{ minHeight: totalHeight }}>
          <div className="w-8 shrink-0 relative">
            {hours.map(h => (
              <div key={h} className="absolute w-full text-[8px] text-gray-400 font-medium text-right pr-1"
                style={{ top: TOP_PAD + (h - START_HOUR) * HOUR_H - 5 }}>{pad(h)}:00</div>
            ))}
          </div>

          <div className="flex flex-1 relative">
            {hours.map(h => (
              <div key={h} className="absolute left-0 right-0 border-t border-gray-100"
                style={{ top: TOP_PAD + (h - START_HOUR) * HOUR_H }} />
            ))}

            {/* Current time line — chỉ hiển thị trong cột ngày hiện tại */}
            {days.map((day, di) => {
              if (!isToday(day)) return null
              const colLeft = `calc(${(di / days.length) * 100}% )`
              const colWidth = `calc(${(1 / days.length) * 100}%)`
              return (
                <div key="now-line" className="absolute z-10 flex items-center pointer-events-none"
                  style={{ top: nowTop, left: colLeft, width: colWidth }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-600 -ml-0.5 shrink-0" />
                  <div className="flex-1 border-t border-blue-500 border-dashed opacity-60" />
                  <span className="text-[6px] bg-blue-600 text-white px-0.5 py-0.5 rounded font-bold ml-0.5 shrink-0">{pad(nowH)}:{pad(nowM)}</span>
                </div>
              )
            })}

            {days.map((day, di) => {
              const dt = tasksForDay(day)
              return (
                <div key={di} className={`flex-1 relative border-l border-gray-50 ${isToday(day) ? 'bg-blue-50/30' : ''}`}>
                  {dt.map(task => {
                    const dd = new Date(task.deadline)
                    const hFrac = dd.getHours() + dd.getMinutes() / 60
                    return (
                      <div key={task.id}
                        onMouseDown={e => e.stopPropagation()}
                        onTouchStart={e => e.stopPropagation()}
                        onClick={() => onTaskClick(task.id)}
                        className="absolute left-0.5 right-0.5 z-[5] cursor-pointer"
                        style={{ top: TOP_PAD + (hFrac - START_HOUR) * HOUR_H }}>
                        <CalCard task={task} />
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function CalCard({ task }) {
  const color = PRI_COLOR[task.priority] || PRI_COLOR.MEDIUM
  const sDot = STATUS_DOT[task.status] || 'bg-gray-400'
  const done = task.status === 'COMPLETED'
  return (
    <div className={`rounded border-l-2 bg-white shadow-sm px-1 py-0.5 hover:shadow-md transition-shadow ${done ? 'opacity-50' : ''}`}
      style={{ borderLeftColor: color }}>
      <div className="flex items-center gap-0.5">
        <p className={`text-[8px] font-semibold truncate flex-1 ${done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{task.title}</p>
        <span className={`w-1 h-1 rounded-full shrink-0 ${sDot}`} />
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[7px] text-gray-400">{fmtTime(task.deadline)}</span>
        <div className="flex-1 h-0.5 bg-gray-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${task.progress}%`, background: color }} />
        </div>
        <span className="text-[7px] font-bold tabular-nums" style={{ color }}>{task.progress}%</span>
      </div>
      {task.assignees?.length > 0 && (
        <div className="flex -space-x-0.5 mt-0.5">
          {task.assignees.slice(0, 2).map(a => (
            <div key={a.userId} className="w-3 h-3 rounded-full bg-blue-400 text-[6px] text-white font-bold flex items-center justify-center ring-1 ring-white">
              {(a.fullName || a.username || '?')[0].toUpperCase()}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}