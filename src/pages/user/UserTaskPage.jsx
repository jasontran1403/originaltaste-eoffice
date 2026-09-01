import UserTaskBoard from '../../components/task/UserTaskBoard'

export default function UserTaskPage() {
  return (
    <>
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Công việc của tôi</h1>
        <p className="text-sm text-gray-500 mt-0.5">Các task được giao cho bạn</p>
      </div>
      <UserTaskBoard />
    </>
  )
}
