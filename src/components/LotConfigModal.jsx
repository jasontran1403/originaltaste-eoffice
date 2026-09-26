import { useState, useEffect } from 'react'

/**
 * Modal sửa cấu hình lot của 1 copier.
 * BẮT BUỘC bot đã tắt trước khi mở/save. Nếu active=true, form disabled + báo.
 */
export default function LotConfigModal({
  open, onClose,
  copierId, copierLabel,
  active, current,
  onSave, saving, error,
}) {
  const [signalBaseLot, setSignalBaseLot] = useState('')
  const [baseLot, setBaseLot]             = useState('')
  const [lotMultiplier, setLotMultiplier] = useState('')

  useEffect(() => {
    if (!open) return
    setSignalBaseLot(fmt(current?.signalBaseLot))
    setBaseLot(fmt(current?.baseLot))
    setLotMultiplier(fmt(current?.lotMultiplier))
  }, [open, current])

  if (!open) return null

  const parseNum = (v) => {
    if (v == null || v === '') return NaN
    const n = Number(String(v).replace(',', '.'))
    return isFinite(n) ? n : NaN
  }
  const nSignal = parseNum(signalBaseLot)
  const nBase   = parseNum(baseLot)
  const nMult   = parseNum(lotMultiplier)

  const valid =
    !isNaN(nSignal) && nSignal > 0 &&
    !isNaN(nBase)   && nBase   > 0 &&
    !isNaN(nMult)   && nMult   > 0 &&
    Number.isInteger(nMult) // Lot Multiplier phải là số nguyên

  const disabled = active || saving

  const handleSave = () => {
    if (!valid || disabled) return
    onSave({
      signalBaseLot: nSignal,
      baseLot:       nBase,
      lotMultiplier: nMult,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
         onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-5"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-gray-800">
            Cấu hình lot — <span className="text-violet-600">{copierLabel}</span>
          </h3>
          <button className="text-gray-400 hover:text-gray-600" onClick={onClose}>✕</button>
        </div>

        {active && (
          <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            ⚠ Bot đang bật. <b>Hãy tắt bot trước</b> rồi mới sửa được lot.
          </div>
        )}

        <div className="space-y-3">
          <NumInput label="Signal Base Lot (lot cơ bản của tk Master)"
                    hint="Vd: 0.22"
                    value={signalBaseLot} onChange={setSignalBaseLot}
                    disabled={disabled}
                    maxDecimals={2}/>

          <NumInput label="Base Lot (lot cơ bản của tk Copier)"
                    hint="Vd: 0.01"
                    value={baseLot} onChange={setBaseLot}
                    disabled={disabled}
                    maxDecimals={2}/>

          <NumInput label="Lot Multiplier (hệ số nhân)"
                    hint="Vd: 1"
                    value={lotMultiplier} onChange={setLotMultiplier}
                    disabled={disabled}
                    integerOnly/>
        </div>
        
        {error && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 text-gray-600 hover:bg-gray-50"
                  onClick={onClose} disabled={saving}>
            Hủy
          </button>
          <button
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold text-white
              ${(!valid || disabled) ? 'bg-gray-300 cursor-not-allowed' : 'bg-violet-600 hover:bg-violet-700'}`}
            onClick={handleSave} disabled={!valid || disabled}>
            {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Input số:
 * - Chỉ cho nhập 0-9 và 1 dấu thập phân (. hoặc ,)
 * - maxDecimals: giới hạn số chữ số sau dấu thập phân (bỏ qua nếu integerOnly)
 * - integerOnly: chỉ cho nhập số nguyên (chặn dấu thập phân)
 * - Chặn wheel up/down (không thay đổi giá trị khi cuộn chuột)
 */
function NumInput({ label, hint, value, onChange, disabled, maxDecimals, integerOnly }) {
  const handleChange = (e) => {
    let raw = e.target.value

    // 1. Chỉ cho phép số và dấu thập phân (. hoặc ,)
    //    Loại bỏ mọi ký tự khác (chữ, ký tự đặc biệt, khoảng trắng...)
    raw = raw.replace(/[^0-9.,]/g, '')

    // 2. Chỉ cho phép 1 dấu thập phân duy nhất (dấu đầu tiên gặp)
    const firstDot   = raw.indexOf('.')
    const firstComma = raw.indexOf(',')
    let sepIndex = -1
    let sepChar  = ''

    if (firstDot !== -1 && firstComma !== -1) {
      // có cả 2 → giữ cái xuất hiện trước
      if (firstDot < firstComma) { sepIndex = firstDot; sepChar = '.' }
      else                        { sepIndex = firstComma; sepChar = ',' }
    } else if (firstDot !== -1)   { sepIndex = firstDot; sepChar = '.' }
    else if (firstComma !== -1)   { sepIndex = firstComma; sepChar = ',' }

    if (sepIndex !== -1) {
      const before = raw.slice(0, sepIndex).replace(/[.,]/g, '')
      const after  = raw.slice(sepIndex + 1).replace(/[.,]/g, '')
      raw = before + sepChar + after
    } else {
      raw = raw.replace(/[.,]/g, '')
    }

    // 3. Nếu integerOnly → bỏ luôn dấu thập phân
    if (integerOnly) {
      raw = raw.replace(/[.,]/g, '')
    }

    // 4. Giới hạn số chữ số sau dấu thập phân
    if (!integerOnly && typeof maxDecimals === 'number' && sepIndex !== -1) {
      const dotPos = raw.search(/[.,]/)
      if (dotPos !== -1) {
        const intPart  = raw.slice(0, dotPos)
        const decPart  = raw.slice(dotPos + 1, dotPos + 1 + maxDecimals)
        raw = intPart + raw[dotPos] + decPart
      }
    }

    // 5. Không cho bắt đầu bằng dấu thập phân (tránh ".5" → thêm "0" phía trước)
    if (raw.startsWith('.') || raw.startsWith(',')) {
      raw = '0' + raw
    }

    onChange(raw)
  }

  // Chặn wheel thay đổi giá trị (blur input khi user cuộn chuột trên input)
  const handleWheel = (e) => {
    e.target.blur()
  }

  return (
    <label className="block">
      <span className="block text-xs text-gray-600 mb-1">{label}</span>
      <input
        type="text"
        inputMode={integerOnly ? 'numeric' : 'decimal'}
        value={value}
        onChange={handleChange}
        onWheel={handleWheel}
        disabled={disabled}
        placeholder={hint}
        autoComplete="off"
        className={`w-full px-3 py-1.5 rounded-lg border text-sm
          ${disabled ? 'bg-gray-100 text-gray-400 border-gray-200'
                     : 'border-gray-300 focus:outline-none focus:border-violet-500'}`}/>
    </label>
  )
}

function fmt(v) {
  if (v == null || isNaN(Number(v))) return ''
  return String(Number(v))
}