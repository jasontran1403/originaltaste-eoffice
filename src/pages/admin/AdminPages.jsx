import AdminTaskDashboard from '../../components/task/AdminTaskDashboard'
import AdminTaskList from '../../components/task/AdminTaskList'

export function AdminDashboardPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900">Dashboard Admin</h1>
        <p className="text-sm text-gray-500 mt-0.5">Tổng quan tiến độ công việc</p>
      </div>
      <AdminTaskDashboard />
    </>
  )
}

export function AdminTaskListPage() {
  return <AdminTaskList />
}
