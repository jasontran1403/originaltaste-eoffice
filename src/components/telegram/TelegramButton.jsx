import { useEffect, useState, useCallback } from 'react'
import { getTelegramStatus } from '../../services/telegramApi'
import TelegramLinkModal from './TelegramLinkModal'

/**
 * Nút "Telegram" trên Navbar.
 *
 *   • Chưa link → nút ĐỎ nhấp nháy nhẹ: "Liên kết Telegram"
 *   • Đã link → biểu tượng ✈️ xanh nhạt (yên tĩnh)
 *
 * Bấm → mở TelegramLinkModal ở chế độ bình thường (không forced).
 * Khi modal đóng hoặc link/unlink thành công, reload status.
 */
export default function TelegramButton() {
  const [status, setStatus] = useState(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await getTelegramStatus()
      setStatus(res.data)
    } catch { /* silent */ }
  }, [])

  useEffect(() => { load() }, [load])

  const linked = status?.linked
  const configured = status?.botConfigured

  // Bot chưa cấu hình → ẩn hoàn toàn (đỡ rối user)
  if (status && !configured && !linked) return null

  const cls = linked
    ? 'flex items-center gap-1.5 px-2.5 h-9 rounded-lg text-xs font-semibold bg-sky-50 text-sky-700 hover:bg-sky-100 transition'
    : 'flex items-center gap-1.5 px-2.5 h-9 rounded-lg text-xs font-semibold bg-red-50 text-red-700 hover:bg-red-100 transition ring-1 ring-red-200 animate-pulse'

  return (
    <>
      <button onClick={() => setOpen(true)} className={cls} title={linked ? 'Đã liên kết Telegram' : 'Chưa liên kết Telegram'}>
        <span>✈️</span>
        <span className="hidden sm:inline">{linked ? 'Telegram' : 'Liên kết Telegram'}</span>
      </button>

      <TelegramLinkModal
        open={open}
        onClose={() => { setOpen(false); load() }}
        onLinked={() => { load() }}
      />
    </>
  )
}
