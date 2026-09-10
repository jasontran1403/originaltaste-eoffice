import { useState, useEffect, useCallback } from 'react'
import { getTask, updateProgress, completeTask, completeSubItem, requestExtension } from '../../services/taskApi'
import ProgressBar, { StatusBadge, PriorityBadge } from '../ui/ProgressBar'
import DatePicker from '../ui/DatePicker'
import { useToast } from '../ui/Toast'

const pad = n => String(n).padStart(2, '0')
const fmtFull = ts => {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TaskDetailModal({ taskId, onClose, isAdmin = false, onRefresh }) {
  const toast = useToast()
  const [task, setTask] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('detail')
  const [newProgress, setNewProgress] = useState(0)
  const [progressNote, setProgressNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [completionNote, setCompletionNote] = useState('')
  const [showComplete, setShowComplete] = useState(false)
  const [extDeadline, setExtDeadline] = useState(null)
  const [extReason, setExtReason] = useState('')
  const [subNote, setSubNote] = useState('')

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

  const handleCompleteSubItem = async (subId) => {
    try {
      setSaving(true)
      const res = await completeSubItem(taskId, subId, { note: subNote || null })
      if (res.data?.code === 900) {
        toast.success('Đã hoàn thành đầu mục!')
        setSubNote('')
        loadTask(); onRefresh?.()
      } else toast.error(res.data?.message || 'Lỗi')
    } catch (e) { toast.error(e.response?.data?.message || 'Lỗi') }
    finally { setSaving(false) }
  }

  const handleUpdateProgress = async () => {
    if (!progressNote.trim()) { toast.warning('Vui lòng nhập ghi chú'); return }
    try {
      setSaving(true)
      const res = await updateProgress(taskId, { progress: newProgress, note: progressNote })
      if (res.data?.code === 900) {
        toast.success('Cập nhật tiến độ thành công'); setProgressNote(''); loadTask(); onRefresh?.()
      }
    } catch { toast.error('Lỗi') } finally { setSaving(false) }
  }

  const handleComplete = async () => {
    try {
      setSaving(true)
      const res = await completeTask(taskId, { completionNote })
      if (res.data?.code === 900) {
        toast.success('Task hoàn thành!'); setShowComplete(false); loadTask(); onRefresh?.()
      }
    } catch { toast.error('Lỗi') } finally { setSaving(false) }
  }

  const handleExtension = async () => {
    if (!extDeadline || !extReason.trim()) { toast.warning('Vui lòng chọn ngày giờ và nhập lý do'); return }
    try {
      setSaving(true)
      const res = await requestExtension(taskId, { newDeadline: extDeadline, reason: extReason })
      if (res.data?.code === 900) {
        toast.success('Đã gửi yêu cầu gia hạn'); setExtReason(''); setExtDeadline(null); setTab('detail'); loadTask(); onRefresh?.()
      }
    } catch { toast.error('Lỗi') } finally { setSaving(false) }
  }

  if (loading) return <Overlay onClose={onClose}><div className="flex items-center justify-center h-64"><div className="spinner" /></div></Overlay>
  if (!task) return null

  const isPersonal = task.taskType === 'PERSONAL'
  const canEdit = !isAdmin && task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && task.status !== 'PAUSED'
  const hasSubs = task.subItems && task.subItems.length > 0
  const tabs = ['detail', ...(hasSubs ? ['subtasks'] : []), 'progress', ...(canEdit && !isPersonal ? ['extension'] : [])]
  const tabLabels = { detail: 'Chi tiết', subtasks: 'Đầu mục', progress: 'Tiến độ', extension: 'Gia hạn' }

  return (
    <Overlay onClose={onClose}>
      <div className="max-h-[85vh] overflow-y-auto overscroll-contain">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-gray-900 leading-snug">{task.title}</h2>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <StatusBadge status={task.status} />
              <PriorityBadge priority={task.priority} />
              {task.category && <span className="badge bg-gray-100 text-gray-500">{task.category}</span>}
              {isPersonal && <span className="badge bg-violet-100 text-violet-600 text-[9px] font-bold">Cá nhân</span>}
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-400">✕</button>
        </div>

        {/* Progress */}
        <div className="mb-3 p-3 rounded-xl bg-gray-50">
          <div className="flex items-center justify-between mb-1"><span className="text-xs font-semibold text-gray-500">Tiến độ</span><span className="text-sm font-bold text-gray-900">{task.progress}%</span></div>
          <ProgressBar value={task.progress} size="lg" showLabel={false} />
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-4 overflow-x-auto">
          {tabs.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3.5 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tabLabels[t]}
            </button>
          ))}
        </div>

        {/* Detail tab */}
        {tab === 'detail' && (
          <div className="space-y-3">
            <Row label="Hạn chót">{task.deadline ? fmtFull(task.deadline) : <span className="text-gray-400">Không hạn</span>}</Row>
            <Row label="Người tạo">{task.createdByName || '—'}</Row>
            <Row label="Ngày tạo">{fmtFull(task.createdAt)}</Row>
            {!isPersonal && (
              <div><p className="text-xs font-semibold text-gray-500 mb-1.5">Người thực hiện</p>
                <div className="flex flex-wrap gap-1.5">
                  {(task.assignees||[]).map(a => <span key={a.userId} className="badge bg-blue-50 text-blue-700">{a.fullName || a.username}</span>)}
                  {(!task.assignees || !task.assignees.length) && <span className="text-xs text-gray-400">Chưa giao</span>}
                </div>
              </div>
            )}
            {task.description && <div><p className="text-xs font-semibold text-gray-500 mb-1">Mô tả</p><p className="text-sm text-gray-700 whitespace-pre-wrap">{task.description}</p></div>}
            {task.requirements && <div><p className="text-xs font-semibold text-gray-500 mb-1">Yêu cầu</p><p className="text-sm text-gray-700 whitespace-pre-wrap">{task.requirements}</p></div>}
            {task.completionNote && <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200"><p className="text-xs font-semibold text-emerald-700 mb-1">Ghi chú hoàn thành</p><p className="text-sm text-emerald-800">{task.completionNote}</p></div>}
          </div>
        )}

        {/* Subtasks tab */}
        {tab === 'subtasks' && hasSubs && (
          <div className="space-y-2">
            {task.sequentialSubtasks && <p className="text-[10px] text-amber-600 font-medium mb-1">⚡ Phải hoàn thành theo thứ tự</p>}
            {task.subItems.map((sub, idx) => {
              const locked = task.sequentialSubtasks && idx > 0 && !task.subItems[idx-1].completed
              const canComplete = canEdit && !sub.completed && !locked
              return (
                <div key={sub.id} className={`p-3 rounded-xl border transition-all
                  ${sub.completed ? 'bg-emerald-50 border-emerald-200' : locked ? 'bg-gray-50 border-gray-100 opacity-60' : 'bg-white border-gray-200 hover:border-blue-200'}`}>
                  <div className="flex items-center gap-2.5">
                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all
                      ${sub.completed ? 'bg-emerald-500 border-emerald-500' : locked ? 'border-gray-300' : 'border-blue-400'}`}>
                      {sub.completed && <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 6l2 2 4-4" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      {locked && <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 2v4M3.5 4h3a1 1 0 011 1v2a1 1 0 01-1 1h-3a1 1 0 01-1-1V5a1 1 0 011-1z" stroke="#aaa" strokeWidth="1"/></svg>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${sub.completed ? 'text-emerald-700 line-through' : 'text-gray-800'}`}>{sub.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-400 font-bold">{sub.weight}%</span>
                        {/* Hiện người được gán cho sub-item */}
                        {sub.assigneeName && (
                          <span className="text-[10px] text-violet-600 font-medium">👤 {sub.assigneeName}</span>
                        )}
                        {sub.completedByName && <span className="text-[10px] text-emerald-600">{sub.completedByName} · {fmtFull(sub.completedAt)}</span>}
                      </div>
                    </div>
                    {canComplete && (
                      <button onClick={() => handleCompleteSubItem(sub.id)} disabled={saving}
                        className="btn-primary px-2.5 py-1 text-[11px] shrink-0">Xong</button>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Complete entire task */}
            {canEdit && task.progress >= 100 && !showComplete && (
              <button onClick={() => setShowComplete(true)} className="btn-primary w-full justify-center bg-emerald-600 hover:bg-emerald-700 mt-3">Đánh dấu hoàn thành task</button>
            )}
            {showComplete && (
              <div className="p-3 bg-emerald-50 rounded-xl space-y-2 mt-2">
                <textarea value={completionNote} onChange={e => setCompletionNote(e.target.value)} className="input min-h-[50px]" placeholder="Ghi chú xác nhận (tùy chọn)..." />
                <div className="flex gap-2">
                  <button onClick={handleComplete} disabled={saving} className="btn-primary bg-emerald-600 hover:bg-emerald-700 flex-1 justify-center">{saving ? 'Đang lưu...' : 'Xác nhận'}</button>
                  <button onClick={() => setShowComplete(false)} className="btn-secondary">Hủy</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Progress tab */}
        {tab === 'progress' && (
          <div className="space-y-4">
            {canEdit && !hasSubs && (
              <div className="p-3 bg-blue-50 rounded-xl space-y-3">
                <p className="text-xs font-semibold text-blue-700">Cập nhật tiến độ</p>
                <div>
                  <div className="flex items-center justify-between mb-1"><span className="text-xs text-gray-500">Tiến độ</span><span className="text-sm font-bold text-blue-700">{newProgress}%</span></div>
                  <input type="range" min="0" max="100" step="5" value={newProgress} onChange={e => setNewProgress(+e.target.value)} className="w-full accent-blue-600" />
                </div>
                <textarea value={progressNote} onChange={e => setProgressNote(e.target.value)} className="input min-h-[50px]" placeholder="Đã làm được gì..." />
                <button onClick={handleUpdateProgress} disabled={saving} className="btn-primary w-full justify-center">{saving ? 'Đang lưu...' : 'Cập nhật'}</button>
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-2">Lịch sử</p>
              {(!task.progressLogs || !task.progressLogs.length) ? (
                <p className="text-sm text-gray-400 py-4 text-center">Chưa có cập nhật</p>
              ) : (
                <div className="space-y-0">
                  {task.progressLogs.map((log, i) => (
                    <div key={log.id} className="flex gap-3 relative">
                      <div className="flex flex-col items-center">
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${log.progress>=100?'bg-emerald-500':'bg-blue-500'}`} />
                        {i < task.progressLogs.length-1 && <div className="w-0.5 flex-1 bg-gray-200 my-1" />}
                      </div>
                      <div className="pb-3 min-w-0 flex-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-semibold text-gray-700">{log.username}</span>
                          <span className="text-[10px] text-gray-400 shrink-0">{fmtFull(log.createdAt)}</span>
                        </div>
                        <span className="badge bg-blue-100 text-blue-700 mt-0.5">{log.progress}%</span>
                        {log.note && <p className="text-sm text-gray-600 mt-0.5 leading-snug">{log.note}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Extension tab */}
        {tab === 'extension' && canEdit && !isPersonal && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">Yêu cầu gia hạn deadline. Admin sẽ nhận thông báo.</p>
            <div>
              <label className="label-sm">Deadline mới (ngày + giờ)</label>
              <DatePicker value={extDeadline} onChange={setExtDeadline} showTime
                placeholder="Chọn ngày giờ mới" minDate={Date.now()} portal />
            </div>
            <div>
              <label className="label-sm">Lý do</label>
              <textarea value={extReason} onChange={e => setExtReason(e.target.value)} className="input min-h-[60px]" placeholder="Nhập lý do..." />
            </div>
            <button onClick={handleExtension} disabled={saving} className="btn-primary w-full justify-center">{saving ? 'Đang gửi...' : 'Gửi yêu cầu'}</button>
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
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-5 sm:p-6 animate-fade-in" onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  )
}
function Row({ label, children }) { return <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-gray-500">{label}</span><div>{children}</div></div> }
