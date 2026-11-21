import { useState, useEffect, useRef } from 'react'
import {
  previewInvoice, issueRetailInvoice, issueBusinessInvoice,
  sendInvoiceToCqt, getInvoicePdf,
  getEInvoiceBusinessLocations,
} from '../services/api'

/**
 * Modal phát hành HĐ POS kèm địa điểm kinh doanh (theo Nghị định 68).
 *
 * UI:
 *   1. Dropdown chọn 1 cửa hàng từ bảng einvoice_store (fetch về).
 *      Mỗi row = 1 ký hiệu Viettel + mã/tên/địa chỉ địa điểm KD + mã cửa hàng.
 *   2. Bấm "Tạo nháp & Xem trước" → previewInvoice({ businessLocationId }).
 *      BE override invoiceSeries (vd C26MOA) → Viettel render PDF có tên/mã
 *      địa điểm trên khối "Đơn vị bán hàng".
 *   3. Bấm "Phát hành" → issueRetailInvoice / issueBusinessInvoice tùy đơn
 *      có MST hay không, vẫn kèm businessLocationId.
 *   4. "Gửi CQT" như flow thường.
 */
export default function PosStoreInvoiceModal({ order, onClose, onIssued }) {
  const bizInfo        = order?.invoiceDetail || {}
  const hasInvoiceInfo = !!bizInfo.taxCode

  // ── State fetch danh sách cửa hàng ─────────────────────────────
  const [stores, setStores]           = useState([])
  const [loadingStores, setLoadingStores] = useState(true)
  const [storesError, setStoresError] = useState(null)
  const [selectedId, setSelectedId]   = useState(null)
  const [storeErr, setStoreErr]       = useState('')

  useEffect(() => {
    setLoadingStores(true)
    getEInvoiceBusinessLocations(true)
      .then(r => {
        const env = r.data
        const list = env?.data || []
        setStores(list)
        if (list.length) setSelectedId(list[0].id)   // mặc định chọn cửa hàng đầu
      })
      .catch(e => setStoresError(e.response?.data?.message || e.message || 'Không tải được danh sách cửa hàng'))
      .finally(() => setLoadingStores(false))
  }, [])

  const selectedStore = stores.find(s => s.id === selectedId) || null

  // ── Flow step ──────────────────────────────────────────────────
  const [step, setStep] = useState('input')     // input | preview | issuing | issued | cqt | done | error
  const [pdfBase64, setPdfBase64]       = useState(null)
  const [issuedResult, setIssuedResult] = useState(null)
  const [error, setError]               = useState(null)
  const [loading, setLoading]           = useState(false)
  const pdfBlobUrl = useRef(null)

  useEffect(() => () => {
    if (pdfBlobUrl.current) URL.revokeObjectURL(pdfBlobUrl.current)
  }, [])

  // ── Envelope unwrap ───────────────────────────────────────────
  const unwrap = res => {
    const env = res?.data
    if (env && typeof env.code === 'number' && !(env.code >= 900 && env.code < 1000)) {
      throw new Error(env.message || 'Yêu cầu thất bại')
    }
    return env?.data ?? env
  }

  const buildBody = () => {
    const base = hasInvoiceInfo ? { ...bizInfo } : {}
    return { ...base, businessLocationId: selectedId }
  }

  // ── Tạo nháp ───────────────────────────────────────────────────
  const handleCreateDraft = async () => {
    if (!selectedId) { setStoreErr('Vui lòng chọn cửa hàng'); return }
    setStoreErr('')
    setLoading(true); setError(null)
    try {
      const base64 = unwrap(await previewInvoice(order.orderCode, buildBody()))
      setPdfBase64(typeof base64 === 'string' ? base64 : null)
      setStep('preview')
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Không tạo được bản nháp')
      setStep('error')
    } finally {
      setLoading(false)
    }
  }

  const handleIssue = async () => {
    setStep('issuing'); setError(null)
    try {
      const body = buildBody()
      const res = hasInvoiceInfo
        ? await issueBusinessInvoice(order.orderCode, body)
        : await issueRetailInvoice(order.orderCode, body)
      const result = unwrap(res)
      if (result?.status === 'ERROR') throw new Error(result.errorMessage)
      setIssuedResult(result)
      setStep('issued')
      onIssued?.(result?.invoiceNo)
    } catch (e) {
      setError(e.response?.data?.message || e.message)
      setStep('error')
    }
  }

  const handleSendCqt = async () => {
    setStep('cqt'); setError(null)
    try {
      unwrap(await sendInvoiceToCqt(order.orderCode))
      setStep('done')
    } catch (e) {
      setError(e.response?.data?.message || e.message)
      setStep('error')
    }
  }

  const handleOpenPdf = async () => {
    if (!issuedResult?.invoiceNo) return
    try {
      if (pdfBlobUrl.current) URL.revokeObjectURL(pdfBlobUrl.current)
      pdfBlobUrl.current = await getInvoicePdf(issuedResult.invoiceNo)
      window.open(pdfBlobUrl.current, '_blank')
    } catch (e) { setError('Không lấy được PDF: ' + e.message) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>

      <div className="bg-white rounded-2xl w-full max-w-5xl shadow-2xl flex flex-col overflow-hidden"
        style={{ height: '90svh' }}>

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-3.5
          bg-gradient-to-r from-blue-600 to-blue-700">
          <div>
            <h2 className="font-bold text-white text-sm sm:text-base">
              🏪 Phát hành HĐ POS — chọn cửa hàng
            </h2>
            <p className="text-blue-200 text-xs mt-0.5">
              Đơn #{order.orderCode}
              {hasInvoiceInfo ? ` · MST ${bizInfo.taxCode}` : ' · Khách lẻ'}
              {selectedStore ? ` · ${selectedStore.templateCode} — ${selectedStore.invoiceSeries}` : ''}
            </p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white text-xl shrink-0">
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">

          {/* ══ Step: chọn cửa hàng ══ */}
          {step === 'input' && (
            <div className="p-5 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 leading-relaxed">
                Mỗi cửa hàng đã được cấu hình riêng 1 ký hiệu hóa đơn trên vinvoice.viettel.vn
                (vd <code className="font-mono">C26MOA</code>, <code className="font-mono">C26MOB</code>),
                bind sẵn với địa điểm kinh doanh. Chọn cửa hàng tương ứng rồi bấm
                <b> Tạo nháp</b> để Viettel render hóa đơn đúng địa điểm.
              </div>

              {loadingStores ? (
                <div className="py-6 text-center text-gray-400 text-sm">
                  <div className="w-6 h-6 mx-auto mb-2 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                  Đang tải danh sách cửa hàng...
                </div>
              ) : storesError ? (
                <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
                  ⚠️ {storesError}
                </div>
              ) : stores.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3">
                  Chưa có cửa hàng nào được cấu hình. Vui lòng thêm cửa hàng qua API
                  <code className="font-mono mx-1 text-xs">POST /api/pos/einvoice/business-locations</code>
                  hoặc liên hệ kế toán.
                </div>
              ) : (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                      Chọn cửa hàng *
                    </label>
                    <select
                      value={selectedId ?? ''}
                      onChange={e => { setSelectedId(Number(e.target.value)); setStoreErr('') }}
                      className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl outline-none
                        focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all bg-white"
                    >
                      {stores.map(s => (
                        <option key={s.id} value={s.id}>
                          🏪 {s.shopCode} — {s.shopName} ({s.templateCode} — {s.invoiceSeries})
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedStore && (
                    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm space-y-2">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                        Chi tiết cửa hàng
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
                        <div><span className="text-gray-500">Mã cửa hàng:</span> <span className="font-mono">{selectedStore.shopCode || '—'}</span></div>
                        <div><span className="text-gray-500">Tên cửa hàng:</span> {selectedStore.shopName || '—'}</div>
                        <div><span className="text-gray-500">Mẫu HĐ:</span> <span className="font-mono">{selectedStore.templateCode}</span></div>
                        <div><span className="text-gray-500">Ký hiệu HĐ:</span> <span className="font-mono">{selectedStore.invoiceSeries}</span></div>
                        <div className="sm:col-span-2"><span className="text-gray-500">Mã địa điểm KD:</span> <span className="font-mono">{selectedStore.businessLocationCode || '—'}</span></div>
                        <div className="sm:col-span-2"><span className="text-gray-500">Tên địa điểm KD:</span> {selectedStore.businessLocationName || '—'}</div>
                        <div className="sm:col-span-2"><span className="text-gray-500">Địa chỉ:</span> {selectedStore.businessLocationAddress || '—'}</div>
                      </div>
                    </div>
                  )}

                  {storeErr && (
                    <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
                      ⚠️ {storeErr}
                    </div>
                  )}

                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Thông tin người mua
                    </p>
                    {hasInvoiceInfo ? (
                      <div className="text-sm text-gray-700 space-y-1">
                        <div><span className="text-gray-500">MST:</span> <span className="font-mono">{bizInfo.taxCode}</span></div>
                        <div><span className="text-gray-500">Công ty:</span> {bizInfo.companyName}</div>
                        {bizInfo.address && <div><span className="text-gray-500">Địa chỉ:</span> {bizInfo.address}</div>}
                        {bizInfo.email   && <div><span className="text-gray-500">Email:</span> {bizInfo.email}</div>}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">Khách lẻ — không có mã số thuế.</p>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══ Step: preview ══ */}
          {step === 'preview' && (
            <div className="flex-1 min-h-0 flex flex-col p-4 sm:p-5 gap-3">
              <div className="shrink-0 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 flex flex-wrap gap-x-4 gap-y-1 items-start">
                <div className="flex-1 min-w-0">
                  <div>🏪 <b>{selectedStore?.shopCode}</b> — {selectedStore?.shopName}
                    {' · '}<span className="font-mono">{selectedStore?.templateCode} — {selectedStore?.invoiceSeries}</span>
                  </div>
                  {selectedStore?.businessLocationAddress && (
                    <div className="text-blue-600 mt-0.5">📍 {selectedStore.businessLocationAddress}</div>
                  )}
                </div>
                <button onClick={() => setStep('input')}
                  className="shrink-0 text-blue-700 hover:underline font-medium">
                  ✎ Đổi cửa hàng
                </button>
              </div>

              <div className="flex-1 min-h-0 rounded-xl border border-gray-200 flex flex-col overflow-hidden">
                <div className="shrink-0 px-3 py-2 bg-gray-50 border-b flex justify-between items-center">
                  <span className="text-xs font-semibold text-gray-600">📄 Xem trước hóa đơn</span>
                  <span className="text-xs text-gray-400 italic">Nháp — chưa phát hành</span>
                </div>

                {pdfBase64 ? (
                  <iframe
                    src={`data:application/pdf;base64,${pdfBase64}`}
                    className="flex-1 w-full border-0"
                    title="Invoice Draft Preview"
                  />
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm">
                    <div className="text-4xl mb-3">📋</div>
                    <p className="font-medium">Chưa có nháp</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ══ Issuing ══ */}
          {step === 'issuing' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="w-14 h-14 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-gray-700 font-semibold">Đang phát hành hóa đơn...</p>
              <p className="text-gray-400 text-sm">Đang ký USB token và gửi lên Viettel</p>
            </div>
          )}

          {/* ══ Issued ══ */}
          {step === 'issued' && issuedResult && (
            <div className="p-5 space-y-4">
              <div className="flex flex-col items-center py-3">
                <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center text-3xl mb-3">✅</div>
                <h3 className="text-lg font-bold text-gray-900">Phát hành thành công!</h3>
                <p className="text-gray-400 text-sm">Hóa đơn đã ký số và phát hành</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
                {[['Số hóa đơn', issuedResult.invoiceNo], ['Ký hiệu', issuedResult.invoiceSeries],
                  ['Mẫu số', issuedResult.templateCode], ['Transaction ID', issuedResult.transactionID],
                  ['Cửa hàng', selectedStore ? `${selectedStore.shopCode} — ${selectedStore.shopName}` : null],
                  ['Địa điểm KD', selectedStore?.businessLocationCode]]
                  .filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="flex justify-between text-sm gap-2">
                    <span className="text-gray-500 shrink-0">{k}:</span>
                    <span className="font-mono font-semibold text-emerald-800 text-right break-all">{v}</span>
                  </div>
                ))}
              </div>
              <button onClick={handleOpenPdf}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors">
                📄 Xem PDF hóa đơn
              </button>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <p className="text-sm font-semibold text-blue-800 mb-1">📨 Gửi lên cơ quan thuế (CQT)</p>
                <p className="text-xs text-blue-400 mb-3">Hóa đơn cần gửi CQT để có hiệu lực pháp lý đầy đủ.</p>
                <button onClick={handleSendCqt}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium text-sm transition-colors">
                  📨 Gửi CQT ngay
                </button>
              </div>
            </div>
          )}

          {/* ══ cqt sending ══ */}
          {step === 'cqt' && (
            <div className="flex-1 flex flex-col items-center justify-center gap-4">
              <div className="w-14 h-14 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
              <p className="text-gray-700 font-semibold">Đang gửi lên cơ quan thuế...</p>
            </div>
          )}

          {/* ══ done ══ */}
          {step === 'done' && (
            <div className="p-5 space-y-4">
              <div className="flex flex-col items-center py-4">
                <div className="w-16 h-16 bg-violet-100 rounded-full flex items-center justify-center text-3xl mb-3">🎉</div>
                <h3 className="text-lg font-bold text-gray-900">Hoàn tất!</h3>
                <p className="text-gray-400 text-sm mt-1">Hóa đơn đã phát hành và gửi CQT</p>
              </div>
              <div className="bg-violet-50 border border-violet-200 rounded-xl p-4">
                <p className="text-sm text-violet-600">
                  Số hóa đơn: <span className="font-mono font-bold text-violet-800 text-lg">{issuedResult?.invoiceNo}</span>
                </p>
                {selectedStore && <p className="text-xs text-violet-500 mt-1">🏪 {selectedStore.shopCode} — {selectedStore.shopName}</p>}
              </div>
              <button onClick={handleOpenPdf}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors">
                📄 Xem PDF hóa đơn
              </button>
            </div>
          )}

          {/* ══ error ══ */}
          {step === 'error' && (
            <div className="p-5 space-y-4">
              <div className="flex flex-col items-center py-4">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center text-3xl mb-3">❌</div>
                <h3 className="text-lg font-bold text-gray-900">Có lỗi xảy ra</h3>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 font-mono break-all">
                {error}
              </div>
              <button onClick={() => { setStep(pdfBase64 ? 'preview' : 'input'); setError(null) }}
                className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium text-sm transition-colors">
                ← Quay lại
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === 'input' && (
          <div className="shrink-0 px-5 py-4 border-t bg-gray-50 flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-medium text-sm transition-colors">
              Hủy
            </button>
            <button onClick={handleCreateDraft} disabled={loading || loadingStores || !stores.length}
              className="flex-1 sm:flex-none sm:px-8 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40
                text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
              {loading ? 'Đang tạo nháp...' : '📋 Tạo nháp & Xem trước'}
            </button>
          </div>
        )}
        {step === 'preview' && (
          <div className="shrink-0 px-5 py-4 border-t bg-gray-50 flex gap-3">
            <button onClick={onClose}
              className="flex-1 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-xl font-medium text-sm transition-colors">
              Hủy
            </button>
            <button onClick={handleIssue}
              className="flex-1 sm:flex-none sm:px-8 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm transition-colors flex items-center justify-center gap-2">
              🧾 Phát hành hóa đơn
            </button>
          </div>
        )}
        {step === 'issued' && (
          <div className="shrink-0 px-5 py-4 border-t bg-gray-50">
            <button onClick={onClose}
              className="w-full py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-500 rounded-xl font-medium text-sm transition-colors">
              Đóng (gửi CQT sau)
            </button>
          </div>
        )}
        {step === 'done' && (
          <div className="shrink-0 px-5 py-4 border-t bg-gray-50">
            <button onClick={onClose}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium text-sm transition-colors">
              Xong
            </button>
          </div>
        )}
      </div>
    </div>
  )
}