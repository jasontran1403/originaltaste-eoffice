import { useState, useEffect, useCallback } from 'react'
import { getTask, updateProgress, completeTask, requestExtension } from '../../services/taskApi'
import ProgressBar, { StatusBadge, PriorityBadge, DeadlineBadge } from '../ui/ProgressBar'
import DatePicker from '../ui/DatePicker'
import { useToast } from '../ui/Toast'

const pad = n => String(n).padStart(2, '0')
const fmtFull = ts => {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Modal xem chi tiết task + cập nhật tiến độ.
 * Hiển thị cho cả user và admin (admin chỉ xem, user có thể cập nhật).
 */
export default function TaskDetailModal({ taskId, onClose, isAdmin = false, onRefresh }) {
  const toast = useToast()
  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('detail') // detail | progress | extension

  // Update progress form
  const [newProgress, setNewProgress] = useState(0)
  const [progressNote, setProgressNote] = useState('')
  const [saving, setSaving] = useState(false)

  // Complete form
  const [completionNote, setCompletionNote] = useState('')
  const [showComplete, setShowComplete] = useState(false)

  // Extension form
  const [extDeadline, setExtDeadline] = useState(null)
  const [extReason, setExtReason] = useState('')

  const loadTask = useCallback(async () => {
    try {
      setLoading(true)
      const res = await getTask(taskId)
      if (res.data?.code === 900) {
        setTask(res.data.data)
        setNewProgress(res.data.data.progress || 0)
      }
    } catch { toast.error('Không tải được chi tiết task') }
    finally { setLoading(false) }
  }, [taskId])

  useEffect(() => { loadTask() }, [loadTask])

  const handleUpdateProgress = async () => {
    if (!progressNote.trim()) { toast.warning('Vui lòng nhập ghi chú tiến độ'); return }
    try {
      setSaving(true)
      const res = await updateProgress(taskId, { progress: newProgress, note: progressNote })
      if (res.data?.code === 900) {
        toast.success('Cập nhật tiến độ thành công')
        setProgressNote('')
        loadTask()
        onRefresh?.()
      }
    } catch { toast.error('Lỗi cập nhật tiến độ') }
    finally { setSaving(false) }
  }

  const handleComplete = async () => {
    try {
      setSaving(true)
      const res = await completeTask(taskId, { completionNote })
      if (res.data?.code === 900) {
        toast.success('Task đã được đánh dấu hoàn thành!')
        setShowComplete(false)
        loadTask()
        onRefresh?.()
      }
    } catch { toast.error('Lỗi hoàn thành task') }
    finally { setSaving(false) }
  }

  const handleExtension = async () => {
    if (!extDeadline || !extReason.trim()) { toast.warning('Vui lòng chọn ngày và nhập lý do'); return }
    try {
      setSaving(true)
      const res = await requestExtension(taskId, { newDeadline: extDeadline, reason: extReason })
      if (res.data?.code === 900) {
        toast.success('Đã gửi yêu cầu gia hạn')
        setExtReason('')
        setExtDeadline(null)
        setTab('detail')
        loadTask()
        onRefresh?.()
      }
    } catch { toast.error('Lỗi gửi yêu cầu gia hạn') }
    finally { setSaving(false) }
  }

  if (loading) {
    return (
      <Overlay onClose={onClose}>
        <div className="flex items-center justify-center h-64">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Overlay>
    )
  }

  if (!task) return null

  const canEdit = !isAdmin && task.status !== 'COMPLETED' && task.status !== 'CANCELLED'

  return (
    <Overlay onClose={onClose}>
      <div className="max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-gray-900 leading-snug">{task.title}</h2>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <StatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
              {task.category && <span className="badge bg-gray-100 text-gray-500">{task.category}</span>}
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-400">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </button>
        </div>

        {/* Progress */}
        <div className="mb-4 p-3 rounded-xl bg-gray-50">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-gray-500">Tiến độ</span>
            <span className="text-sm font-bold text-gray-900">{task.progress}%</span>
          </div>
          <ProgressBar value={task.progress} size="lg" showLabel={false} />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-4">
          {['detail', 'progress', ...(canEdit ? ['extension'] : [])].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'detail' ? 'Chi tiết' : t === 'progress' ? 'Tiến độ' : 'Gia hạn'}
            </button>
          ))}
        </div>

        {/* Tab: Detail */}
        {tab === 'detail' && (
          <div className="space-y-4">
            <InfoRow label="Hạn chót"><DeadlineBadge deadline={task.deadline} /></InfoRow>
            <InfoRow label="Người tạo">{task.createdByName || '—'}</InfoRow>
            <InfoRow label="Ngày tạo">{fmtFull(task.createdAt)}</InfoRow>

            {/* Assignees */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1.5">Người thực hiện</p>
              <div className="flex flex-wrap gap-1.5">
                {(task.assignees || []).map(a => (
                  <span key={a.userId} className="badge bg-blue-50 text-blue-700">
                    {a.fullName || a.username}
                  </span>
                ))}
                {(!task.assignees || task.assignees.length === 0) && <span className="text-xs text-gray-400">Chưa giao ai</span>}
              </div>
            </div>

            {task.description && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Mô tả</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{task.description}</p>
              </div>
            )}

            {task.requirements && (
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-1">Yêu cầu</p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{task.requirements}</p>
              </div>
            )}

            {task.completionNote && (
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                <p className="text-xs font-semibold text-emerald-700 mb-1">Ghi chú hoàn thành</p>
                <p className="text-sm text-emerald-800">{task.completionNote}</p>
              </div>
            )}

            {/* Complete button */}
            {canEdit && task.progress >= 50 && !showComplete && (
              <button onClick={() => setShowComplete(true)} className="btn-primary w-full justify-center bg-emerald-600 hover:bg-emerald-700">
                Đánh dấu hoàn thành
              </button>
            )}

            {showComplete && (
              <div className="p-3 bg-emerald-50 rounded-xl space-y-2">
                <textarea
                  value={completionNote}
                  onChange={e => setCompletionNote(e.target.value)}
                  placeholder="Ghi chú xác nhận (tùy chọn)..."
                  className="input min-h-[60px]"
                />
                <div className="flex gap-2">
                  <button onClick={handleComplete} disabled={saving} className="btn-primary bg-emerald-600 hover:bg-emerald-700 flex-1 justify-center">
                    {saving ? 'Đang lưu...' : 'Xác nhận hoàn thành'}
                  </button>
                  <button onClick={() => setShowComplete(false)} className="btn-secondary">Hủy</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Progress */}
        {tab === 'progress' && (
          <div className="space-y-4">
            {/* Update form (user only) */}
            {canEdit && (
              <div className="p-3 bg-blue-50 rounded-xl space-y-3">
                <p className="text-xs font-semibold text-blue-700">Cập nhật tiến độ</p>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-500">Tiến độ mới</span>
                    <span className="text-sm font-bold text-blue-700">{newProgress}%</span>
                  </div>
                  <input
                    type="range"
                    min="0" max="100" step="5"
                    value={newProgress}
                    onChange={e => setNewProgress(+e.target.value)}
                    className="w-full accent-blue-600"
                  />
                </div>
                <textarea
                  value={progressNote}
                  onChange={e => setProgressNote(e.target.value)}
                  placeholder="Mô tả đã làm được gì..."
                  className="input min-h-[60px]"
                />
                <button onClick={handleUpdateProgress} disabled={saving} className="btn-primary w-full justify-center">
                  {saving ? 'Đang lưu...' : 'Cập nhật'}
                </button>
              </div>
            )}

            {/* Progress timeline */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Lịch sử cập nhật</p>
              {(!task.progressLogs || task.progressLogs.length === 0) ? (
                <p className="text-sm text-gray-400 py-4 text-center">Chưa có cập nhật nào</p>
              ) : (
                <div className="space-y-0">
                  {task.progressLogs.map((log, i) => (
                    <div key={log.id} className="flex gap-3 relative">
                      {/* Timeline line */}
                      <div className="flex flex-col items-center">
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${log.progress >= 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                        {i < task.progressLogs.length - 1 && <div className="w-0.5 flex-1 bg-gray-200 my-1" />}
                      </div>
                      <div className="pb-4 min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-semibold text-gray-700">{log.username}</span>
                          <span className="text-[10px] text-gray-400 shrink-0">{fmtFull(log.createdAt)}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="badge bg-blue-100 text-blue-700">{log.progress}%</span>
                        </div>
                        {log.note && <p className="text-sm text-gray-600 mt-1 leading-snug">{log.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab: Extension */}
        {tab === 'extension' && canEdit && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Yêu cầu gia hạn deadline cho task này. Admin sẽ nhận được thông báo và duyệt.</p>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Deadline mới</label>
              <DatePicker
                value={extDeadline}
                onChange={setExtDeadline}
                placeholder="Chọn ngày mới"
                minDate={Date.now()}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1 block">Lý do</label>
              <textarea
                value={extReason}
                onChange={e => setExtReason(e.target.value)}
                placeholder="Nhập lý do xin gia hạn..."
                className="input min-h-[80px]"
              />
            </div>
            <button onClick={handleExtension} disabled={saving} className="btn-primary w-full justify-center">
              {saving ? 'Đang gửi...' : 'Gửi yêu cầu gia hạn'}
            </button>
          </div>
        )}
      </div>
    </Overlay>
  )
}

function Overlay({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5 sm:p-6 animate-fade-in"
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}

function InfoRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs font-semibold text-gray-500">{label}</span>
      <div>{children}</div>
    </div>
  )
}
