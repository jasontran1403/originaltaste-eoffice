import { useEffect, useRef, useState, useCallback } from 'react'
import { getExternalCredential, setExternalCredential } from '../services/api'

/**
 * Modal set / xem cookie sàn (mặc định GrabFood).
 *
 * - Mở modal → GET status: hiển thị cookie đang set + countdown hạn JWT.
 * - Dán cookie mới → Lưu (PUT) → tự refresh lại status.
 * - Countdown đếm lùi mỗi giây dựa trên tokenExpiresAt (decode từ JWT phía BE).
 *
 * <GrabCookieModal open={bool} platform="GRAB_FOOD" onClose={fn} showToast={fn} />
 */
export default function GrabCookieModal({
  open,
  platform = 'GRAB_FOOD',
  onClose,
  showToast,
}) {
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [cookie, setCookie] = useState('')
  const [expiresAt, setExpiresAt] = useState(null) // epoch millis
  const [hasCookie, setHasCookie] = useState(false)
  const [nowTick, setNowTick] = useState(Date.now())
  const tickRef = useRef(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await getExternalCredential(platform)
      const d = r.data?.data || {}
      setCookie(d.cookie || '')
      setExpiresAt(d.tokenExpiresAt ?? null)
      setHasCookie(!!d.hasCookie)
    } catch {
      showToast?.('Không tải được trạng thái cookie', false)
    } finally {
      setLoading(false)
    }
  }, [platform, showToast])

  // Khi mở modal: load status + chạy đồng hồ countdown.
  useEffect(() => {
    if (!open) return
    load()
    tickRef.current = setInterval(() => setNowTick(Date.now()), 1000)
    return () => clearInterval(tickRef.current)
  }, [open, load])

  const save = async () => {
    const value = cookie.trim()
    if (!value) {
      showToast?.('Vui lòng dán chuỗi cookie', false)
      return
    }
    setSaving(true)
    try {
      const r = await setExternalCredential(platform, value)
      const d = r.data?.data || {}
      setExpiresAt(d.tokenExpiresAt ?? null)
      setHasCookie(!!d.hasCookie)
      showToast?.('Đã lưu cookie')
      await load()
    } catch (e) {
      showToast?.(e?.response?.data?.message || 'Lưu cookie thất bại', false)
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  const remain = expiresAt != null ? expiresAt - nowTick : null
  const expired = remain != null && remain <= 0

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" onClick={saving ? undefined : onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20">
              🍜
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                Cookie {platform === 'SHOPEE_FOOD' ? 'ShopeeFood' : 'GrabFood'}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Dán cookie merchant để hệ thống tự lấy đơn
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Trạng thái + countdown */}
          <div className={`rounded-xl px-4 py-3 text-sm flex items-center justify-between
            ${expired
              ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'
              : hasCookie
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                : 'bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400'}`}>
            <span className="font-semibold">
              {loading
                ? 'Đang tải...'
                : !hasCookie
                  ? 'Chưa có cookie'
                  : expired
                    ? 'Cookie đã hết hạn'
                    : 'Cookie đang hoạt động'}
            </span>
            {hasCookie && expiresAt != null && (
              <span className="tabular-nums">
                {expired ? 'Hết hạn' : <>Còn <b>{fmtRemain(remain)}</b></>}
                {' · '}
                <span className="text-xs opacity-70">
                  hết hạn {fmtDateTime(expiresAt)}
                </span>
              </span>
            )}
          </div>

          {/* Ô dán cookie */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1.5">
              Chuỗi Cookie
            </label>
            <textarea
              value={cookie}
              onChange={e => setCookie(e.target.value)}
              rows={7}
              spellCheck={false}
              placeholder="_ga=...; mexusers_authn_token=...; ..."
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950
                px-3 py-2.5 text-xs font-mono leading-relaxed text-gray-900 dark:text-gray-100
                focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-y break-all"
            />
            <p className="mt-1 text-[11px] text-gray-400">
              Hạn được đọc tự động từ JWT trong cookie (mexusers_authn_token).
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-2 p-4 pt-0">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 h-11 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900
              text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800
              active:scale-95 transition disabled:opacity-50"
          >
            Đóng
          </button>
          <button
            onClick={save}
            disabled={saving || loading}
            className="flex-1 h-11 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500
              active:scale-95 transition disabled:opacity-60"
          >
            {saving ? 'Đang lưu...' : 'Lưu cookie'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Countdown: ms → "Xd Xh Xm Xs" (bỏ phần 0 ở đầu).
function fmtRemain(ms) {
  if (ms == null || ms <= 0) return '0s'
  const s = Math.floor(ms / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  const parts = []
  if (d > 0) parts.push(`${d}d`)
  if (h > 0 || d > 0) parts.push(`${h}h`)
  if (m > 0 || h > 0 || d > 0) parts.push(`${m}m`)
  parts.push(`${ss}s`)
  return parts.join(' ')
}

function fmtDateTime(ms) {
  try {
    return new Date(ms).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit',
    })
  } catch {
    return ''
  }
}