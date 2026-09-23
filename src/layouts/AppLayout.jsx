import { Outlet } from 'react-router-dom'
import Navbar from '../components/Navbar'
import TelegramLinkGate from '../components/telegram/TelegramLinkGate'

export default function AppLayout() {
  return (
    <TelegramLinkGate>
      <div className="h-[100dvh] flex flex-col overflow-hidden bg-gray-50">
        <Navbar />
        <main className="flex-1 min-h-0 overflow-hidden px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <Outlet />
        </main>
      </div>
    </TelegramLinkGate>
  )
}
