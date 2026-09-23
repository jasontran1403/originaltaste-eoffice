import UserTaskBoard from '../../components/task/UserTaskBoard'

export default function UserTaskPage() {
  return (
    // Bọc trong flex-col-h-full để UserTaskBoard (h-full) chiếm đúng phần
    // còn lại của <main>, cho phép chỉ vùng grid task scroll (không phải cả page).
    <div className="h-full flex flex-col min-h-0">
      <div className="mb-5 shrink-0">
        <h1 className="text-xl font-bold text-gray-900">Công việc của tôi</h1>
        <p className="text-sm text-gray-500 mt-0.5">Task được giao và task cá nhân</p>
      </div>
      <div className="flex-1 min-h-0">
        <UserTaskBoard />
      </div>
    </div>
  )
}