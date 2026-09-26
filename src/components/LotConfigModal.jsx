import { useState, useEffect } from 'react'

const DEFAULT_SIGNAL_BASE_LOT = 0.03

/**
 * Modal sửa cấu hình lot của 1 copier.
 * BẮT BUỘC bot đã tắt trước khi mở/save. Nếu active=true, form disabled + báo.
 *
 * - Signal Base Lot: CHỈ XEM, mặc định 0.03 (không sửa được).
 * - Base Lot + Lot Multiplier: cho sửa.
 * - Khi bấm "Lưu cấu hình" → hiện modal confirm, OK mới gọi onSave.
 */
export default function LotConfigModal({
  open, onClose,
  copierId, copierLabel,
  active, current,
  onSave, saving, error,
}) {
  const [baseLot, setBaseLot]             = useState('')
  const [lotMultiplier, setLotMultiplier] = useState('')
  const [confirmOpen, setConfirmOpen]     = useState(false)

  // Signal Base Lot: ưu tiên current, fallback về default 0.03
  const signalBaseLot = (() => {
    const v = current?.signalBaseLot
    if (v == null || isNaN(Number(v))) return DEFAULT_SIGNAL_BASE_LOT
    return Number(v)
  })()

  // CHỈ nạp giá trị khi modal MỞ hoặc ĐỔI COPIER.
  // KHÔNG phụ thuộc `current` để tránh reset form khi đang gõ.
  useEffect(() => {
    if (!open) return
    setBaseLot(fmt(current?.baseLot))
    setLotMultiplier(fmt(current?.lotMultiplier))
    setConfirmOpen(false) // đảm bảo confirm đóng khi mở lại modal
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, copierId])

  if (!open) return null

  const parseNum = (v) => {
    if (v == null || v === '') return NaN
    const n = Number(String(v).replace(',', '.'))
    return isFinite(n) ? n : NaN
  }
  const nBase = parseNum(baseLot)
  const nMult = parseNum(lotMultiplier)

  const valid =
    !isNaN(nBase) && nBase > 0 &&
    !isNaN(nMult) && nMult > 0 &&
    Number.isInteger(nMult)

  const disabled = active || saving

  const handleRequestSave = () => {
    if (!valid || disabled) return
    setConfirmOpen(true)
  }

  const handleConfirmSave = () => {
    if (!valid || disabled) return
    onSave({
      signalBaseLot: signalBaseLot,
      baseLot:       nBase,
      lotMultiplier: nMult,
    })
    setConfirmOpen(false)
  }

  const handleCancelConfirm = () => {
    // Chỉ đóng modal confirm, GIỮ modal chỉnh sửa
    setConfirmOpen(false)
  }

  return (
    <>
      {/* ===== Modal chỉnh sửa ===== */}
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
            {/* Signal Base Lot: chỉ xem */}
            <ReadonlyField
              label="Signal Base Lot (lot cơ bản của tk Master)"
              value={fmt(signalBaseLot)}/>

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
              onClick={handleRequestSave} disabled={!valid || disabled}>
              {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
            </button>
          </div>
        </div>
      </div>

      {/* ===== Modal confirm ===== */}
      {confirmOpen && (
        <ConfirmSaveModal
          baseLot={nBase}
          lotMultiplier={nMult}
          saving={saving}
          onConfirm={handleConfirmSave}
          onCancel={handleCancelConfirm}/>
      )}
    </>
  )
}

/**
 * Modal confirm khi lưu.
 * - Hiển thị baseLot + multiplier mới, số IN ĐẬM, SIZE TO, MÀU ĐỎ.
 * - OK → onConfirm (gọi onSave).
 * - Hủy → onCancel (chỉ đóng confirm, giữ modal chỉnh sửa).
 */
function ConfirmSaveModal({ baseLot, lotMultiplier, saving, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
         onClick={saving ? undefined : onCancel}>
      <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-5"
           onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-bold text-gray-800 mb-3">
          Xác nhận cập nhật cấu hình lot
        </h3>

        <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 space-y-3">
          <div>
            <div className="text-xs text-gray-500 mb-1">Base Lot</div>
            <div className="text-2xl font-extrabold text-red-600 leading-tight">
              {formatNum(baseLot)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 mb-1">Lot Multiplier</div>
            <div className="text-2xl font-extrabold text-red-600 leading-tight">
              {formatNum(lotMultiplier)}
            </div>
          </div>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          Bạn có chắc muốn lưu cấu hình mới không?
        </p>

        <div className="mt-5 flex justify-end gap-2">
          <button
            className="px-3 py-1.5 rounded-lg text-sm border border-gray-300 text-gray-600 hover:bg-gray-50"
            onClick={onCancel} disabled={saving}>
            Hủy
          </button>
          <button
            className={`px-4 py-1.5 rounded-lg text-sm font-semibold text-white
              ${saving ? 'bg-gray-300 cursor-not-allowed' : 'bg-red-600 hover:bg-red-700'}`}
            onClick={onConfirm} disabled={saving}>
            {saving ? 'Đang lưu...' : 'OK, lưu'}
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Field chỉ xem (readonly) — hiển thị giá trị trong khung xám.
 */
function ReadonlyField({ label, value }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-600 mb-1">{label}</span>
      <div className="w-full px-3 py-1.5 rounded-lg border border-gray-200 bg-gray-100 text-sm text-gray-500 select-none cursor-not-allowed">
        {value || '—'}
      </div>
    </label>
  )
}

/**
 * Input số:
 * - Chỉ cho nhập 0-9 và 1 dấu thập phân (. hoặc ,)
 * - maxDecimals: giới hạn số chữ số sau dấu thập phân (bỏ qua nếu integerOnly)
 * - integerOnly: chỉ cho nhập số nguyên (chặn dấu thập phân)
 * - Chặn wheel up/down
 * - Khi focus: select toàn bộ value
 */
function NumInput({ label, hint, value, onChange, disabled, maxDecimals, integerOnly }) {
  const handleChange = (e) => {
    let raw = e.target.value

    // 1. Chỉ cho phép số và dấu thập phân
    raw = raw.replace(/[^0-9.,]/g, '')

    // 2. integerOnly → chặn dấu thập phân (không biến "1.0" thành "10")
    if (integerOnly && /[.,]/.test(raw)) {
      return
    }

    // 3. Chỉ cho phép 1 dấu thập phân duy nhất
    const firstDot   = raw.indexOf('.')
    const firstComma = raw.indexOf(',')
    let sepIndex = -1
    let sepChar  = ''

    if (firstDot !== -1 && firstComma !== -1) {
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

    // 4. Giới hạn số chữ số sau dấu thập phân
    if (!integerOnly && typeof maxDecimals === 'number' && sepIndex !== -1) {
      const dotPos = raw.search(/[.,]/)
      if (dotPos !== -1) {
        const intPart  = raw.slice(0, dotPos)
        const decPart  = raw.slice(dotPos + 1, dotPos + 1 + maxDecimals)
        raw = intPart + raw[dotPos] + decPart
      }
    }

    // 5. Không cho bắt đầu bằng dấu thập phân
    if (raw.startsWith('.') || raw.startsWith(',')) {
      raw = '0' + raw
    }

    onChange(raw)
  }

  const handleWheel = (e) => {
    e.target.blur()
  }

  const handleFocus = (e) => {
    e.target.select()
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
        onFocus={handleFocus}
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

function formatNum(v) {
  if (v == null || isNaN(Number(v))) return '—'
  return String(Number(v))
}