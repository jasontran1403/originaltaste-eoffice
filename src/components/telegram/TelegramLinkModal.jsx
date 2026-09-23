import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { getTelegramStatus, initTelegramLink, unlinkTelegram } from '../../services/telegramApi'
import { useToast } from '../ui/Toast'

/**
 * Modal liên kết Telegram cá nhân.
 *
 * ── QUAN TRỌNG ────────────────────────────────────────────────
 * Modal được render qua createPortal vào document.body.
 *
 * Lý do: Navbar dùng `backdrop-blur` (backdrop-filter). Theo CSS spec, khi tổ tiên
 * có filter/backdrop-filter, phần tử `position: fixed` bên trong bị giới hạn
 * TRONG cái box của tổ tiên đó (containing block bị đổi từ viewport sang phần tử
 * có filter). Kết quả là modal bị chèn vào ô Navbar cao 56px, không phủ full màn hình.
 * Portal ra body giúp modal thoát toàn bộ containing block trong tree.
 */
export default function TelegramLinkModal({
  open,
  forced = false,
  onClose,
  onCloseAttempt,
  onLinked,
}) {
  const toast = useToast()

  const [status, setStatus]   = useState(null)
  const [loading, setLoading] = useState(true)
  const [ticket, setTicket]   = useState(null)
  const [initing, setIniting] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const reload = useCallback(async () => {
    try {
      const res = await getTelegramStatus()
      setStatus(res.data)
      return res.data
    } catch (e) {
      console.error('[telegram] status err', e)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setLoading(true); setTicket(null)
    reload()
  }, [open, reload])

  useEffect(() => {
    if (!open || !ticket || status?.linked) return
    const iv = setInterval(async () => {
      setNow(Date.now())
      const s = await reload()
      if (s?.linked) {
        clearInterval(iv)
        toast?.success?.('Đã liên kết Telegram thành công')
        onLinked?.()
      }
    }, 2000)
    return () => clearInterval(iv)
  }, [open, ticket, status?.linked, reload, toast, onLinked])

  // Khoá scroll body khi modal mở
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  const expired = ticket && ticket.expiresAt && now > ticket.expiresAt

  const handleInit = async () => {
    setIniting(true)
    try {
      const res = await initTelegramLink()
      setTicket(res.data)
      setNow(Date.now())
    } catch (e) {
      toast?.error?.(e.response?.data?.message || 'Không tạo được mã liên kết')
    } finally { setIniting(false) }
  }

  const handleUnlink = async () => {
    setUnlinking(true)
    try {
      await unlinkTelegram()
      toast?.success?.('Đã hủy liên kết Telegram')
      setTicket(null)
      await reload()
    } catch (e) {
      toast?.error?.(e.response?.data?.message || 'Hủy liên kết thất bại')
    } finally { setUnlinking(false) }
  }

  const handleCopyToken = () => {
    if (!ticket?.token) return
    navigator.clipboard?.writeText(ticket.token)
      .then(() => toast?.info?.('Đã sao chép mã'))
      .catch(() => {})
  }

  const handleBackdropClick = () => {
    if (forced) onCloseAttempt?.()
    else onClose?.()
  }
  const handleXClick = () => {
    if (forced) onCloseAttempt?.()
    else onClose?.()
  }

  if (!open) return null

  const linked = status?.linked

  const modal = (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" onClick={handleBackdropClick}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
           onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <div className="w-10 h-10 rounded-full bg-sky-100 flex items-center justify-center text-xl">✈️</div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold text-gray-900">Liên kết Telegram</h3>
            <p className="text-xs text-gray-500">
              {forced ? 'Bắt buộc để tiếp tục sử dụng eOffice' : 'Nhận noti task ngay tại Telegram cá nhân'}
            </p>
          </div>
          <button onClick={handleXClick} className="text-gray-400 hover:text-gray-600 text-lg leading-none w-8 h-8 rounded-lg hover:bg-gray-100">✕</button>
        </div>

        {/* Body */}
        <div className="px-5 py-4">
          {loading ? (
            <div className="py-8 text-center text-sm text-gray-500">Đang tải...</div>
          ) : status && !status.botConfigured ? (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
              ⚠️ Bot Telegram chưa được cấu hình trên hệ thống. Vui lòng liên hệ quản trị viên để hoàn tất cấu hình bot trước khi liên kết.
            </div>
          ) : linked ? (
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-sm text-emerald-800">
                ✅ Bạn đã liên kết với Telegram.
                {status.telegramDisplayName && <> Tài khoản: <b>{status.telegramDisplayName}</b>{status.telegramUsername ? <> (@{status.telegramUsername})</> : null}.</>}
              </div>
              <p className="text-xs text-gray-500">
                Từ giờ mọi noti task mới, task hoàn thành, hay yêu cầu gia hạn sẽ được bot gửi thẳng vào chat cá nhân với bot trên Telegram của bạn.
              </p>
              <button onClick={handleUnlink} disabled={unlinking}
                className="w-full h-11 rounded-xl border border-red-200 bg-white text-sm font-semibold text-red-600 hover:bg-red-50 active:scale-95 transition disabled:opacity-60">
                {unlinking ? 'Đang hủy...' : 'Hủy liên kết'}
              </button>
            </div>
          ) : !ticket ? (
            <div className="space-y-4">
              <div className="text-sm text-gray-700 leading-relaxed">
                Bot Telegram sẽ gửi noti <b>trực tiếp</b> vào chat cá nhân với bạn — không đăng vào group nào.
              </div>
              <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
                <li>Bấm <b>Lấy mã liên kết</b> ở dưới.</li>
                <li>Bấm <b>Mở Telegram</b> — bot mở ra kèm nút <b>START</b>.</li>
                <li>Bấm <b>START</b> — bot xác nhận là xong.</li>
              </ol>
              <button onClick={handleInit} disabled={initing}
                className="w-full h-11 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-sm font-semibold active:scale-95 transition disabled:opacity-60">
                {initing ? 'Đang tạo mã...' : 'Lấy mã liên kết'}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {expired ? (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
                  Mã đã hết hạn. Vui lòng lấy mã mới.
                </div>
              ) : (
                <div className="p-3 rounded-lg bg-sky-50 border border-sky-200 text-sm text-sky-800">
                  Mã có hiệu lực {Math.max(0, Math.ceil((ticket.expiresAt - now) / 60000))} phút. Bấm <b>Mở Telegram</b> để tiếp tục.
                </div>
              )}

              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-gray-50 border border-gray-200 font-mono text-sm text-gray-800 truncate">
                  {ticket.token}
                </div>
                <button onClick={handleCopyToken}
                  className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:bg-gray-50 active:scale-95 transition">
                  Sao chép
                </button>
              </div>

              <a href={ticket.telegramDeepLink} target="_blank" rel="noopener noreferrer"
                 className={`block w-full h-11 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 active:scale-95 transition
                   ${expired ? 'bg-gray-400 pointer-events-none' : 'bg-sky-600 hover:bg-sky-500'}`}>
                ✈️ Mở Telegram {ticket.botUsername ? <span className="opacity-80">(@{ticket.botUsername})</span> : null}
              </a>

              <button onClick={handleInit} disabled={initing}
                className="w-full h-10 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-600 hover:bg-gray-50 active:scale-95 transition disabled:opacity-60">
                {expired ? 'Lấy mã mới' : 'Đổi mã khác'}
              </button>

              <p className="text-xs text-gray-500 pt-1">
                Đang tự động chờ bạn bấm START trong Telegram... Modal sẽ đóng khi liên kết xong.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  // Portal ra document.body để thoát containing block của Navbar (backdrop-blur)
  return createPortal(modal, document.body)
}
