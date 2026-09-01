import ProgressBar, { StatusBadge, PriorityBadge, DeadlineBadge } from '../ui/ProgressBar'

const avatarColor = name => {
  const colors = [
    'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
    'bg-rose-500', 'bg-teal-500', 'bg-indigo-500', 'bg-pink-500',
  ]
  let hash = 0
  for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return colors[Math.abs(hash) % colors.length]
}

const initial = name => (name || '?')[0].toUpperCase()

export default function TaskCard({ task, onClick }) {
  const overdue = task.deadline && task.deadline < Date.now() && task.status !== 'COMPLETED' && task.status !== 'CANCELLED'

  return (
    <div
      onClick={() => onClick?.(task)}
      className={`
        card p-4 cursor-pointer transition-all duration-200 hover:shadow-md hover:-translate-y-0.5
        ${overdue ? 'border-l-[3px] border-l-red-400' : ''}
        ${task.status === 'COMPLETED' ? 'opacity-75' : ''}
      `}
    >
      {/* Top row: category + priority */}
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {task.category && (
            <span className="badge bg-gray-100 text-gray-500 truncate max-w-[120px]">{task.category}</span>
          )}
          <PriorityBadge priority={task.priority} />
        </div>
        <StatusBadge status={task.status} />
      </div>

      {/* Title */}
      <h3 className="text-sm font-semibold text-gray-900 leading-snug mb-2 line-clamp-2">{task.title}</h3>

      {/* Progress */}
      <ProgressBar value={task.progress} size="sm" className="mb-3" />

      {/* Bottom: deadline + assignees */}
      <div className="flex items-center justify-between gap-2">
        <DeadlineBadge deadline={task.deadline} />

        <div className="flex items-center -space-x-1.5">
          {(task.assignees || []).slice(0, 4).map((a, i) => (
            <div
              key={a.userId}
              className={`w-6 h-6 rounded-full ${avatarColor(a.fullName || a.username)} flex items-center justify-center text-[10px] font-bold text-white ring-2 ring-white`}
              title={a.fullName || a.username}
            >
              {initial(a.fullName || a.username)}
            </div>
          ))}
          {(task.assignees || []).length > 4 && (
            <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500 ring-2 ring-white">
              +{task.assignees.length - 4}
            </div>
          )}
        </div>
      </div>

      {/* Extension indicator */}
      {task.hasPendingExtension && (
        <div className="mt-2 flex items-center gap-1 text-[10px] text-amber-600 font-medium">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" /><path d="M6 3.5V6.5L8 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
          Đang chờ gia hạn
        </div>
      )}
    </div>
  )
}
