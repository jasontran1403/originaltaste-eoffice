import AdminTaskDashboard from '../../components/task/AdminTaskDashboard'
import AdminKanbanBoard from '../../components/task/AdminKanbanBoard'

export function AdminDashboardPage() {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="flex-shrink-0 pb-2">
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Tổng quan tiến độ công việc</p>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        <AdminTaskDashboard />
      </div>
    </div>
  )
}

export function AdminTaskListPage() {
  return <AdminKanbanBoard />
}