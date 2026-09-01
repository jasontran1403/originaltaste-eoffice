/**
 * Animated progress bar with percentage label.
 */
export default function ProgressBar({ value = 0, size = 'md', showLabel = true, className = '' }) {
  const h = size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3' : 'h-2'
  const color = value >= 100 ? 'bg-emerald-500' : value >= 60 ? 'bg-blue-500' : value >= 30 ? 'bg-amber-500' : 'bg-gray-400'

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className={`flex-1 ${h} rounded-full bg-gray-100 overflow-hidden`}>
        <div
          className={`${h} rounded-full ${color} transition-all duration-500 ease-out`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      {showLabel && <span className="text-xs font-semibold text-gray-500 tabular-nums w-8 text-right">{value}%</span>}
    </div>
  )
}

export function StatusBadge({ status }) {
  const map = {
    NOT_STARTED:  { label: 'Chưa bắt đầu',  cls: 'bg-gray-100 text-gray-600' },
    IN_PROGRESS:  { label: 'Đang thực hiện', cls: 'bg-blue-100 text-blue-700' },
    COMPLETED:    { label: 'Hoàn thành',     cls: 'bg-emerald-100 text-emerald-700' },
    CANCELLED:    { label: 'Đã hủy',        cls: 'bg-red-100 text-red-600' },
  }
  const { label, cls } = map[status] || { label: status, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`badge ${cls}`}>{label}</span>
}

export function PriorityBadge({ priority }) {
  const map = {
    LOW:    { label: 'Thấp',    cls: 'bg-gray-100 text-gray-600' },
    MEDIUM: { label: 'Trung bình', cls: 'bg-blue-100 text-blue-700' },
    HIGH:   { label: 'Cao',     cls: 'bg-orange-100 text-orange-700' },
    URGENT: { label: 'Khẩn cấp', cls: 'bg-red-100 text-red-700' },
  }
  const { label, cls } = map[priority] || { label: priority, cls: 'bg-gray-100 text-gray-600' }
  return <span className={`badge ${cls}`}>{label}</span>
}

export function DeadlineBadge({ deadline }) {
  if (!deadline) return <span className="text-xs text-gray-400">Không có hạn</span>
  const now = Date.now()
  const diff = deadline - now
  const d = new Date(deadline)
  const fmt = `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`

  if (diff < 0) return <span className="badge bg-red-100 text-red-700">Quá hạn · {fmt}</span>
  if (diff < 3 * 24 * 60 * 60 * 1000) return <span className="badge bg-amber-100 text-amber-700">Sắp hạn · {fmt}</span>
  return <span className="text-xs text-gray-500">{fmt}</span>
}
