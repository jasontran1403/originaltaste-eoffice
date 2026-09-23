import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getTelegramStatus } from '../../services/telegramApi'
import { useAuth } from '../../hooks/useAuth'
import TelegramLinkModal from './TelegramLinkModal'
import ConfirmModal from '../common/ConfirmModal'

/**
 * Bọc quanh AppLayout. Ngay sau khi login vào app:
 *
 *   1. Gọi /api/telegram/link/status
 *   2. Nếu chưa liên kết  → mở modal bắt buộc (forced)
 *   3. Nếu user cố đóng modal → hiện popup xác nhận:
 *        "Hủy sẽ đăng xuất khỏi eOffice. OK để đăng xuất, Hủy để mở lại modal."
 *      - OK    → clearAuth() + navigate('/login')
 *      - Hủy  → mở lại modal
 *   4. Nếu đã liên kết → không hiện gì, chỉ render children như bình thường
 *
 * Bot chưa cấu hình (status.botConfigured=false): KHÔNG ép buộc link
 * (không có cách nào link được), user vẫn dùng app bình thường — chỉ hiện
 * badge cảnh báo trên Navbar (do TelegramButton xử lý).
 */
export default function TelegramLinkGate({ children }) {
  const { auth, clearAuth } = useAuth()
  const nav = useNavigate()

  const [checked, setChecked] = useState(false)
  const [needLink, setNeedLink] = useState(false)
  const [askLogout, setAskLogout] = useState(false)

  // Check status ngay khi có auth
  useEffect(() => {
    if (!auth) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await getTelegramStatus()
        if (cancelled) return
        const s = res.data
        // Chỉ ép buộc khi: bot ĐÃ cấu hình + user CHƯA link
        if (s.botConfigured && !s.linked) setNeedLink(true)
      } catch (e) {
        // Nếu gọi lỗi (bot chưa có route, network...) — không chặn user
        console.warn('[telegram gate] status err', e)
      } finally {
        if (!cancelled) setChecked(true)
      }
    })()
    return () => { cancelled = true }
  }, [auth])

  const doLogout = () => {
    setAskLogout(false); setNeedLink(false)
    clearAuth(); nav('/login', { replace: true })
  }

  return (
    <>
      {children}

      <TelegramLinkModal
        open={needLink && !askLogout}
        forced
        onCloseAttempt={() => setAskLogout(true)}
        onLinked={() => setNeedLink(false)}
      />

      <ConfirmModal
        open={askLogout}
        title="Bắt buộc liên kết Telegram"
        message="Nếu không liên kết Telegram, bạn sẽ bị đăng xuất khỏi eOffice. Bạn có chắc muốn đăng xuất không?"
        confirmLabel="Đăng xuất"
        cancelLabel="Hủy"
        danger
        onConfirm={doLogout}
        onCancel={() => setAskLogout(false)}
      />

      {/* Placeholder để tránh cảnh báo dead var — không render gì */}
      {checked ? null : null}
    </>
  )
}
