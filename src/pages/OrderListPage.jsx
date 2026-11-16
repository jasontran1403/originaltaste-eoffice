import { useState } from 'react'
import PosOrdersTab from './tabs/PosOrdersTab'
import SaleOrdersTab from './tabs/SaleOrdersTab'
import GrabCookieModal from '../components/GrabCookieModal'
import { usePageState } from '../hooks/usePageState'

const TABS = [
  { key: 'sale', icon: '📦', label: 'Bán sỉ/lẻ' },
  { key: 'pos',  icon: '🏪', label: 'POS' },
]

export default function OrderListPage() {
  const pageState = usePageState()
  const [toast, setToast] = useState(null)
  const [cookieOpen, setCookieOpen] = useState(false)

  const tab = pageState.get('tab', 'sale')
  const activeTab = TABS.some(t => t.key === tab) ? tab : 'sale'

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)]">
      {toast && (
        <div className={`fixed top-16 right-4 z-50 px-5 py-3 rounded-xl shadow-xl text-sm font-medium text-white max-w-[90vw]
          ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.msg}
        </div>
      )}

      {/* ❖ Header: tiêu đề + nút mở modal cookie */}
      <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
        <h1 className="text-xl font-bold text-gray-900">Quản lý hóa đơn</h1>
        <button
          onClick={() => setCookieOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold
            bg-emerald-600 text-white hover:bg-emerald-500 active:scale-95 transition whitespace-nowrap"
        >
          <span>🍜</span> Cookie Grab
        </button>
      </div>

      <GrabCookieModal
        open={cookieOpen}
        platform="GRAB_FOOD"
        onClose={() => setCookieOpen(false)}
        showToast={showToast}
      />

      <div className="flex items-center gap-1 mb-4 border-b border-gray-200 overflow-x-auto shrink-0">
        {TABS.map(({ key, icon, label }) => (
          <button
            key={key}
            onClick={() => pageState.patch({ tab: key })}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors
              ${activeTab === key
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'}`}
          >
            <span>{icon}</span>{label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 flex flex-col">
        {activeTab === 'pos'
          ? <PosOrdersTab  pageState={pageState} showToast={showToast} />
          : <SaleOrdersTab pageState={pageState} showToast={showToast} />}
      </div>
    </div>
  )
}