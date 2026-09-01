import { Outlet } from 'react-router-dom'
import Navbar from '../components/Navbar'

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="w-full px-4 sm:px-6 lg:px-8 py-5 sm:py-6">
        <Outlet />
      </main>
    </div>
  )
}
