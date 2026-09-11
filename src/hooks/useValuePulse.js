import { useState } from "react"

/**
 * Trả về { pulseKey, direction } — pulseKey đổi mỗi khi value đổi,
 * direction = 'up' | 'down' | null
 */
function useValuePulse(value) {
  const prevRef = useRef(value)
  const [state, setState] = useState({ key: 0, dir: null })

  useEffect(() => {
    const prev = prevRef.current
    if (prev === value) return
    const dir =
      typeof value === 'number' && typeof prev === 'number'
        ? value > prev ? 'up' : 'down'
        : null
    prevRef.current = value
    setState(s => ({ key: s.key + 1, dir }))
  }, [value])

  return state
}