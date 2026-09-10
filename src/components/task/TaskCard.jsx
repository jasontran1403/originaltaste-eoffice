import { useState, useEffect } from 'react'
import ProgressBar, { StatusBadge, PriorityBadge } from '../ui/ProgressBar'

const PRIORITY_STYLES = {
  URGENT: 'bg-gradient-to-br from-red-50 to-rose-50 border-red-200',
  HIGH:   'bg-gradient-to-br from-orange-50 to-amber-50 border-orange-200',
  MEDIUM: 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200',
  LOW:    'bg-gradient-to-br from-gray-50 to-slate-50 border-gray-200',
}

const PRIORITY_ACCENT = {
  URGENT: 'from-red-500 to-rose-500',
  HIGH:   'from-orange-500 to-amber-500',
  MEDIUM: 'from-blue-500 to-indigo-500',
  LOW:    'from-gray-400 to-slate-400',
}

const avatarColor = name => {
  const c = ['bg-blue-500','bg-emerald-500','bg-violet-500','bg-amber-500','bg-rose-500','bg-teal-500','bg-indigo-500','bg-pink-500']
  let h = 0; for (let i = 0; i < (name||'').length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return c[Math.abs(h) % c.length]
}

function useCountdown(deadline, createdAt) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!deadline) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [deadline])

  if (!deadline) return { text: null, urgent: false, overdue: false, pct: 100 }

  const remaining = deadline - now
  const total = deadline - (createdAt || now)
  const pct = total > 0 ? Math.max(0, remaining / total) : 0

  if (remaining <= 0) return { text: 'Quá hạn', urgent: true, overdue: true, pct: 0 }

  const d = Math.floor(remaining / 86400000)
  const h = Math.floor((remaining % 86400000) / 3600000)
  const m = Math.floor((remaining % 3600000) / 60000)
  const s = Math.floor((remaining % 60000) / 1000)

  let text = ''
  if (d > 0) text = `${d}d ${h}h`
  else if (h > 0) text = `${h}h ${m}m`
  else text = `${m}m ${s}s`

  return { text: `Còn ${text}`, urgent: pct <= 0.1, overdue: false, pct }
}

export default function TaskCard({ task, onClick, compact = false, showType = false, onDelete, onEdit }) {
  const isDone = task.status === 'COMPLETED' || task.status === 'CANCELLED'
  const isPaused = task.status === 'PAUSED'
  const cd = useCountdown(isDone || isPaused ? null : task.deadline, task.createdAt)
  const isPersonal = task.taskType === 'PERSONAL'

  const baseCls = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.MEDIUM
  const accent = PRIORITY_ACCENT[task.priority] || PRIORITY_ACCENT.MEDIUM
  const completedSubs = (task.subItems || []).filter(s => s.completed).length
  const totalSubs = (task.subItems || []).length

  return (
    <div onClick={() => onClick?.(task)}
      className={`relative rounded-xl border overflow-hidden cursor-pointer transition-all duration-300
        hover:shadow-lg hover:-translate-y-1
        ${baseCls}
        ${isDone ? 'opacity-60 saturate-50' : ''}
        ${isPaused ? 'opacity-70' : ''}
        ${cd.urgent && !isDone ? 'urgent-border' : ''}
      `}
    >
      {/* Priority accent bar */}
      <div className={`h-1 bg-gradient-to-r ${accent}`} />

      <div className={`p-3.5 ${compact ? 'p-2.5' : ''}`}>
        {/* Top: status + type + category */}
        <div className="flex items-center justify-between gap-1.5 mb-2">
          <div className="flex items-center gap-1">
            <StatusBadge status={task.status} />
            {showType && isPersonal && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-violet-100 text-violet-600">Cá nhân</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {task.category && <span className="text-[10px] text-gray-500 bg-white/70 px-1.5 py-0.5 rounded-md">{task.category}</span>}
            <PriorityBadge priority={task.priority} />
          </div>
        </div>

        {/* Title */}
        <h3 className={`font-semibold text-gray-900 leading-snug mb-2 line-clamp-2 ${compact ? 'text-xs' : 'text-sm'}`}>
          {task.title}
        </h3>

        {/* Subtask mini progress */}
        {totalSubs > 0 && (
          <div className="flex items-center gap-1.5 mb-2">
            <div className="flex gap-0.5 flex-1">
              {(task.subItems || []).map((s, i) => (
                <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-500 ${s.completed ? 'bg-emerald-400' : 'bg-gray-200'}`} />
              ))}
            </div>
            <span className="text-[10px] text-gray-500 font-semibold tabular-nums">{completedSubs}/{totalSubs}</span>
          </div>
        )}

        {/* Progress */}
        <ProgressBar value={task.progress} size="sm" className="mb-2.5" />

        {/* Bottom: countdown + assignees */}
        <div className="flex items-center justify-between gap-2">
          {cd.text ? (
            <span className={`text-[11px] font-bold tabular-nums flex items-center gap-1
              ${cd.overdue ? 'text-red-600' : cd.urgent ? 'text-red-500 animate-pulse' : cd.pct < 0.3 ? 'text-amber-600' : 'text-gray-500'}`}>
              {cd.overdue && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
              {cd.text}
            </span>
          ) : (
            <span className="text-[10px] text-gray-400">{task.deadline ? fmtShort(task.deadline) : 'Không hạn'}</span>
          )}

          <div className="flex items-center gap-1.5">
            {/* Edit/Delete for personal tasks */}
            {isPersonal && (onEdit || onDelete) && (
              <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                {onEdit && (
                  <button onClick={onEdit} className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50" title="Sửa">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M7.5 1.5l1 1-5.5 5.5H2V7L7.5 1.5z" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                )}
                {onDelete && (
                  <button onClick={onDelete} className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50" title="Xóa">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 3h6M3.5 3V2.5a.5.5 0 01.5-.5h2a.5.5 0 01.5.5V3M4 4.5v2.5M6 4.5v2.5M3 3l.5 5h3l.5-5" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center -space-x-1.5">
              {(task.assignees || []).slice(0, 3).map(a => (
                <div key={a.userId}
                  className={`w-5 h-5 rounded-full ${avatarColor(a.fullName || a.username)} flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-white`}
                  title={a.fullName || a.username}>
                  {(a.fullName || a.username || '?')[0].toUpperCase()}
                </div>
              ))}
              {(task.assignees || []).length > 3 && (
                <div className="w-5 h-5 rounded-full bg-gray-300 flex items-center justify-center text-[9px] font-bold text-gray-600 ring-2 ring-white">
                  +{task.assignees.length - 3}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Extension/Paused indicators */}
        {task.hasPendingExtension && !isDone && (
          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-amber-600 font-medium">⏳ Chờ gia hạn</div>
        )}
        {isPaused && (
          <div className="mt-1.5 flex items-center gap-1 text-[10px] text-gray-500 font-semibold">⏸ Tạm dừng</div>
        )}
      </div>
    </div>
  )
}

function fmtShort(ts) {
  const d = new Date(ts)
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}
