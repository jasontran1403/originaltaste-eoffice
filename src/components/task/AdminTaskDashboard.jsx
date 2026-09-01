import { useState, useEffect, useCallback } from 'react'
import { getDashboard, getPendingExtensions, reviewExtension } from '../../services/taskApi'
import ProgressBar from '../ui/ProgressBar'
import DatePicker from '../ui/DatePicker'
import { useToast } from '../ui/Toast'

const pad = n => String(n).padStart(2, '0')
const fmtDate = ts => { if (!ts) return '—'; const d = new Date(ts); return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}` }

const STAT_CARDS = [
  { key: 'totalTasks',  label: 'Tổng task',     icon: '📋', tone: 'blue' },
  { key: 'inProgress',  label: 'Đang xử lý',    icon: '🔄', tone: 'indigo' },
  { key: 'completed',   label: 'Hoàn thành',     icon: '✅', tone: 'emerald' },
  { key: 'overdue',     label: 'Quá hạn',        icon: '🔴', tone: 'red' },
  { key: 'dueSoon',     label: 'Sắp đến hạn',    icon: '🟡', tone: 'amber' },
  { key: 'notStarted',  label: 'Chưa bắt đầu',  icon: '⏸', tone: 'gray' },
]

const TONES = {
  blue:    'bg-blue-50 text-blue-600 border-blue-200',
  indigo:  'bg-indigo-50 text-indigo-600 border-indigo-200',
  emerald: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  red:     'bg-red-50 text-red-600 border-red-200',
  amber:   'bg-amber-50 text-amber-600 border-amber-200',
  gray:    'bg-gray-50 text-gray-600 border-gray-200',
}

const STATUS_COLORS = {
  NOT_STARTED: '#94a3b8',
  IN_PROGRESS: '#6366f1',
  COMPLETED:   '#10b981',
  CANCELLED:   '#ef4444',
}

const PRIORITY_COLORS = {
  LOW: '#94a3b8',
  MEDIUM: '#3b82f6',
  HIGH: '#f59e0b',
  URGENT: '#ef4444',
}

const PRI_LABELS = { LOW: 'Thấp', MEDIUM: 'TB', HIGH: 'Cao', URGENT: 'Khẩn' }

export default function AdminTaskDashboard() {
  const toast = useToast()
  const [stats, setStats] = useState(null)
  const [extensions, setExtensions] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const [sRes, eRes] = await Promise.all([getDashboard(), getPendingExtensions()])
      if (sRes.data?.code === 900) setStats(sRes.data.data)
      if (eRes.data?.code === 900) setExtensions(eRes.data.data?.content || [])
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleReview = async (id, status) => {
    try {
      const res = await reviewExtension(id, { status, adminNote: status === 'REJECTED' ? 'Không đồng ý gia hạn' : '' })
      if (res.data?.code === 900) {
        toast.success(status === 'APPROVED' ? 'Đã duyệt gia hạn' : 'Đã từ chối gia hạn')
        load()
      }
    } catch { toast.error('Lỗi xử lý') }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!stats) return null

  const totalForPie = stats.totalTasks || 1

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {STAT_CARDS.map(c => (
          <div key={c.key} className={`rounded-xl border p-3.5 ${TONES[c.tone]}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-lg">{c.icon}</span>
              <span className="text-xs font-semibold opacity-80">{c.label}</span>
            </div>
            <p className="text-2xl font-bold tabular-nums">{stats[c.key] || 0}</p>
          </div>
        ))}
      </div>

      {/* Avg progress */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">Tiến độ trung bình</span>
          <span className="text-lg font-bold text-blue-600">{Math.round(stats.avgProgress || 0)}%</span>
        </div>
        <ProgressBar value={Math.round(stats.avgProgress || 0)} size="lg" showLabel={false} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Status donut */}
        <div className="card p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-4">Phân bổ trạng thái</h3>
          <div className="flex items-center gap-6">
            <DonutChart
              data={[
                { value: stats.notStarted || 0, color: STATUS_COLORS.NOT_STARTED },
                { value: stats.inProgress || 0, color: STATUS_COLORS.IN_PROGRESS },
                { value: stats.completed || 0, color: STATUS_COLORS.COMPLETED },
                { value: stats.cancelled || 0, color: STATUS_COLORS.CANCELLED },
              ]}
              size={120}
              center={`${stats.totalTasks}`}
            />
            <div className="space-y-2 flex-1">
              {[
                { label: 'Chưa bắt đầu', value: stats.notStarted, color: STATUS_COLORS.NOT_STARTED },
                { label: 'Đang xử lý', value: stats.inProgress, color: STATUS_COLORS.IN_PROGRESS },
                { label: 'Hoàn thành', value: stats.completed, color: STATUS_COLORS.COMPLETED },
                { label: 'Đã hủy', value: stats.cancelled, color: STATUS_COLORS.CANCELLED },
              ].map(item => (
                <div key={item.label} className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                  <span className="text-xs text-gray-600 flex-1">{item.label}</span>
                  <span className="text-xs font-bold text-gray-800 tabular-nums">{item.value || 0}</span>
                  <span className="text-[10px] text-gray-400 tabular-nums w-8 text-right">{totalForPie ? Math.round((item.value / totalForPie) * 100) : 0}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Priority bar chart */}
        <div className="card p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-4">Theo độ ưu tiên</h3>
          <div className="space-y-3">
            {(stats.byPriority || []).map(p => {
              const max = Math.max(...(stats.byPriority || []).map(x => x.count), 1)
              return (
                <div key={p.priority} className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-gray-500 w-10 shrink-0">{PRI_LABELS[p.priority] || p.priority}</span>
                  <div className="flex-1 h-6 bg-gray-100 rounded-lg overflow-hidden relative">
                    <div
                      className="h-full rounded-lg transition-all duration-700"
                      style={{ width: `${(p.count / max) * 100}%`, background: PRIORITY_COLORS[p.priority] || '#94a3b8' }}
                    />
                    <div
                      className="absolute top-0 h-full rounded-lg opacity-30"
                      style={{ width: `${(p.completed / max) * 100}%`, background: '#10b981' }}
                    />
                  </div>
                  <span className="text-xs font-bold text-gray-700 tabular-nums w-6 text-right">{p.count}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Assignee workload */}
      {stats.byAssignee && stats.byAssignee.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-4">Khối lượng theo người</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {stats.byAssignee.map(a => (
              <div key={a.fullName} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50">
                <div className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {(a.fullName || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{a.fullName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-gray-400">{a.completed}/{a.totalTasks} xong</span>
                    <ProgressBar value={Math.round(a.avgProgress || 0)} size="sm" className="flex-1" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category breakdown */}
      {stats.byCategory && stats.byCategory.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-4">Theo danh mục</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {stats.byCategory.map(c => (
              <div key={c.category} className="p-3 rounded-xl bg-gray-50 text-center">
                <p className="text-xs font-medium text-gray-500 truncate">{c.category}</p>
                <p className="text-lg font-bold text-gray-800 mt-0.5">{c.count}</p>
                <p className="text-[10px] text-emerald-600">{c.completed} hoàn thành</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pending extensions */}
      {extensions.length > 0 && (
        <div className="card p-4">
          <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
            Yêu cầu gia hạn
            <span className="badge bg-amber-100 text-amber-700">{extensions.length}</span>
          </h3>
          <div className="space-y-2">
            {extensions.map(ext => (
              <div key={ext.id} className="flex items-center gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{ext.requesterName}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Gia hạn đến: {fmtDate(ext.newDeadline)}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{ext.reason}</p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button onClick={() => handleReview(ext.id, 'APPROVED')} className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center hover:bg-emerald-200 transition-colors" title="Duyệt">✓</button>
                  <button onClick={() => handleReview(ext.id, 'REJECTED')} className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center hover:bg-red-200 transition-colors" title="Từ chối">✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** SVG donut chart */
function DonutChart({ data, size = 100, center }) {
  const r = size / 2
  const stroke = 12
  const radius = r - stroke / 2
  const circumference = 2 * Math.PI * radius
  const total = data.reduce((s, d) => s + d.value, 0) || 1

  let offset = 0
  const arcs = data.filter(d => d.value > 0).map(d => {
    const len = (d.value / total) * circumference
    const arc = { len, gap: circumference - len, offset, color: d.color }
    offset += len
    return arc
  })

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
      <circle cx={r} cy={r} r={radius} fill="none" stroke="#f1f5f9" strokeWidth={stroke} />
      {arcs.map((arc, i) => (
        <circle
          key={i}
          cx={r} cy={r} r={radius}
          fill="none"
          stroke={arc.color}
          strokeWidth={stroke}
          strokeDasharray={`${arc.len} ${arc.gap}`}
          strokeDashoffset={-arc.offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${r} ${r})`}
          className="transition-all duration-700"
        />
      ))}
      {center && (
        <text x={r} y={r} textAnchor="middle" dominantBaseline="central" className="text-xl font-bold fill-gray-800">
          {center}
        </text>
      )}
    </svg>
  )
}
