import { useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

const STORAGE_KEY = 'invoice:pageState'

/**
 * Giá»¯ state cá»§a mÃ n hÃ¬nh hÃ³a Ä‘Æ¡n (tab Ä‘ang má»Ÿ, trang, cá»­a hÃ ng, khoáº£ng ngÃ y...)
 * trÃªn URL â†’ F5 / má»Ÿ láº¡i link lÃ  khÃ´i phá»¥c nguyÃªn tráº¡ng.
 *
 * NgoÃ i ra snapshot vÃ o sessionStorage Ä‘á»ƒ khi vÃ o tháº³ng /orders (khÃ´ng kÃ¨m
 * query, vÃ­ dá»¥ ngay sau khi Ä‘Äƒng nháº­p) váº«n quay láº¡i Ä‘Ãºng chá»— cÅ©.
 * sessionStorage sáº½ bá»‹ xÃ³a khi logout (useAuth gá»i sessionStorage.clear()).
 *
 * DÃ¹ng replace: true Ä‘á»ƒ phÃ¢n trang khÃ´ng lÃ m rÃ¡c lá»‹ch sá»­ trÃ¬nh duyá»‡t.
 */
export function usePageState() {
  const [sp, setSp] = useSearchParams()
  const restored = useRef(false)

  // â”€â”€ KhÃ´i phá»¥c snapshot khi URL chÆ°a cÃ³ param nÃ o â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    if (sp.toString()) return
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}')
      if (saved && Object.keys(saved).length) {
        setSp(new URLSearchParams(saved), { replace: true })
      }
    } catch { /* bá» qua, dÃ¹ng máº·c Ä‘á»‹nh */ }
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  // â”€â”€ LÆ°u láº¡i má»—i khi URL Ä‘á»•i â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    const obj = Object.fromEntries(sp.entries())
    if (!Object.keys(obj).length) return
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(obj))
    } catch { /* bá» qua */ }
  }, [sp])

  /** Äá»c param dáº¡ng chuá»—i */
  const get = useCallback(
    (key, fallback = '') => sp.get(key) ?? fallback,
    [sp]
  )

  /** Äá»c param dáº¡ng sá»‘ nguyÃªn >= 0 */
  const getNum = useCallback((key, fallback = 0) => {
    const n = parseInt(sp.get(key), 10)
    return Number.isFinite(n) && n >= 0 ? n : fallback
  }, [sp])

  /**
   * Cáº­p nháº­t nhiá»u param má»™t lÃºc.
   * GiÃ¡ trá»‹ '' / null / undefined â†’ xÃ³a param cho URL gá»n.
   * LuÃ´n gá»™p trong 1 láº§n gá»i Ä‘á»ƒ trÃ¡nh ghi Ä‘Ã¨ láº«n nhau,
   * VD: patch({ store: 3, posPage: 0 })
   */
  const patch = useCallback((next) => {
    const params = new URLSearchParams(sp)
    Object.entries(next).forEach(([k, v]) => {
      if (v === null || v === undefined || v === '') params.delete(k)
      else params.set(k, String(v))
    })
    setSp(params, { replace: true })
  }, [sp, setSp])

  return { get, getNum, patch }
}