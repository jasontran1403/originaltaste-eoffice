import { useState, useEffect, useCallback } from 'react'
import DateRangePicker from '../../components/DateRangePicker'
import InvoiceDetailBadge from '../../components/InvoiceDetailBadge'
import Pagination from '../../components/Pagination'
import InvoiceModal from '../../components/InvoiceModal'
import { getInvoiceOrders, getStores, getInvoicePdf } from '../../services/api'
import { fmtCurrency, fmtDateTime, todayVN } from '../../utils/format'

const PAGE_SIZE = 50

// Danh sách store được phép xem trong tab POS. Tạm thời chỉ mở 2 store:
//   9 = OT-447HVB (mặc định)
//   7 = ???
// Bỏ lựa chọn "Tất cả cửa hàng". Khi muốn mở thêm store, chỉ cần append id vào mảng.
const POS_ALLOWED_STORE_IDS = [9, 7]
const POS_DEFAULT_STORE_ID  = '9'

const STATUS = {
  COMPLETED:   { l: 'Hoàn thành', cls: 'bg-green-100 text-green-700' },
  CANCELLED:   { l: 'Đã hủy',     cls: 'bg-red-100 text-red-600' },
  PENDING:     { l: 'Chờ',        cls: 'bg-yellow-100 text-yellow-700' },
  IN_PROGRESS: { l: 'Xử lý',      cls: 'bg-blue-100 text-blue-700' },
}

/**
 * Đơn coi như đã phát hành khi có eInvoiceNo — kể cả eInvoiceStatus bị thiếu
 * (đơn cũ, hoặc lưu kết quả lỗi giữa chừng). Tránh cho phát hành trùng.
 */
const isIssued     = o => o.eInvoiceStatus === 'ISSUED' || !!o.eInvoiceNo
const isGiftIssued = o => o.giftEInvoiceStatus === 'ISSUED' || !!o.giftEInvoiceNo

function rowCls(o) {
  if (isIssued(o)) return 'bg-emerald-50'
  if (o.invoiceSubmitted) return 'bg-orange-50'
  if (o.invoiceDeadlineExpired) return 'bg-yellow-50'
  return ''
}

/**
 * Tab POS. Toàn bộ filter (ngày, cửa hàng, trang) nằm trên URL qua pageState
 * nên F5 vẫn giữ nguyên: ?tab=pos&posStore=2&posPage=3
 */
export default function PosOrdersTab({ pageState, showToast }) {
  const { get, getNum, patch } = pageState
  const today = todayVN()

  // ── State đọc từ URL ────────────────────────────────────────────
  const fromDate = get('posFrom', today)
  const toDate   = get('posTo', today)
  const page     = getNum('posPage', 0)
  // storeId: mặc định = 9 (OT-447HVB); không còn tùy chọn "tất cả".
  const storeId  = get('posStore', POS_DEFAULT_STORE_ID)

  // ── State cục bộ ────────────────────────────────────────────────
  const [orders, setOrders] = useState([])
  const [meta, setMeta] = useState({ total: 0, pages: 0 })
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(false)
  const [modal, setModal] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  // Đảm bảo URL luôn có posStore (nếu user vào không kèm query thì set mặc định)
  useEffect(() => {
    if (!get('posStore', '')) patch({ posStore: POS_DEFAULT_STORE_ID })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Danh sách cửa hàng cho dropdown — chỉ các store được allow ──
  useEffect(() => {
    getStores()
      .then(r => {
        const all = r.data?.data || []
        setStores(all.filter(s => POS_ALLOWED_STORE_IDS.includes(Number(s.id))))
      })
      .catch(() => setStores([]))   // lỗi dropdown không nên chặn cả trang
  }, [])

  // ── Tải đơn ─────────────────────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await getInvoiceOrders(null, page, PAGE_SIZE, fromDate, toDate, storeId || undefined)
      const d = r.data?.data
      setOrders(d?.content || [])
      setMeta({ total: d?.totalElements || 0, pages: d?.totalPages || 0 })
    } catch (e) {
      showToast('Lỗi tải dữ liệu: ' + e.message, false)
    } finally {
      setLoading(false)
    }
  }, [fromDate, toDate, page, storeId, refreshKey])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load() }, [load])

  // Đổi filter → luôn về trang 0 (gộp trong 1 patch để không ghi đè nhau)
  const handleRangeChange = (f, t) => patch({ posFrom: f, posTo: t, posPage: 0 })
  const handleStoreChange = e => patch({ posStore: e.target.value, posPage: 0 })

  const storeLabel = stores.find(s => String(s.id) === String(storeId))?.name
                  || `#${storeId}`

  return (
    // Khung tab = flex column fill parent; filter/chú thích/pagination shrink-0,
    // chỉ card chứa bảng là flex-1 + overflow để scroll trong.
    <div className="flex-1 min-h-0 flex flex-col">
      {/* ── Thanh filter ── */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Đơn hàng POS</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {meta.total} đơn · {storeLabel} · {fromDate === toDate ? fromDate : `${fromDate} → ${toDate}`}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={storeId}
            onChange={handleStoreChange}
            className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 hover:border-blue-400 transition-colors shadow-sm outline-none focus:border-blue-500"
          >
            {stores.map(s => (
              <option key={s.id} value={s.id}>🏪 {s.name}</option>
            ))}
          </select>

          <DateRangePicker fromDate={fromDate} toDate={toDate} onChange={handleRangeChange} />

          <button onClick={() => setRefreshKey(k => k + 1)} className="btn-secondary">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Làm mới
          </button>
        </div>
      </div>

      {/* ── Chú thích màu ── */}
      <div className="flex flex-wrap gap-4 mb-3 text-xs text-gray-500 shrink-0">
        {[
          { cls: 'bg-emerald-100 border-emerald-300', lbl: 'Đã xuất hóa đơn' },
          { cls: 'bg-orange-100 border-orange-300',   lbl: 'Có thông tin xuất HĐ' },
          { cls: 'bg-yellow-100 border-yellow-300',   lbl: 'Hết hạn nhập (12h)' },
          { cls: 'bg-white border-gray-200',          lbl: 'Bình thường' },
        ].map(({ cls, lbl }) => (
          <div key={lbl} className="flex items-center gap-1.5">
            <span className={`w-3 h-3 rounded border ${cls} shrink-0`} />
            {lbl}
          </div>
        ))}
      </div>

      {/* ── Bảng — flex-1 fill phần còn lại, scroll bên trong ── */}
      <div className="card flex-1 min-h-0 flex flex-col overflow-hidden">
        {loading ? (
          <div className="py-20 text-center text-gray-400">
            <div className="text-4xl mb-3 animate-pulse">⏳</div>
            <p>Đang tải dữ liệu...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
            <div className="text-5xl mb-4">📭</div>
            <p className="font-medium">Không có đơn hàng nào</p>
            <p className="text-sm mt-1 text-gray-300">Thử chọn cửa hàng hoặc khoảng thời gian khác</p>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 border-b border-gray-200">
                  {['Mã đơn / Cửa hàng', 'Khách hàng', 'Thông tin HĐ', 'Tiền hàng', 'VAT',
                    'Thành tiền', 'Thời gian tạo', 'Hành động'].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map(o => (
                  <tr key={o.id} className={`transition-colors hover:brightness-95 ${rowCls(o)}`}>
                    <td className="px-4 py-3 min-w-[140px]">
                      <p className="font-semibold text-gray-900">{o.orderCode}</p>
                      {o.storeName && <p className="text-xs text-blue-600 mt-0.5">🏪 {o.storeName}</p>}
                      {o.appOrderCode && <p className="text-xs text-gray-400">{o.appOrderCode}</p>}
                      <div className="flex flex-wrap items-center gap-1 mt-1">
                        <span className={`badge text-xs ${STATUS[o.status]?.cls || 'bg-gray-100 text-gray-500'}`}>
                          {STATUS[o.status]?.l || o.status}
                        </span>
                        {o.hasGiftItems && (
                          <span className="badge text-xs bg-amber-100 text-amber-700" title="Đơn có sản phẩm giảm 100% — cần phát hành thêm HĐ tặng">
                            🎁 Có HĐ tặng
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3 min-w-[130px]">
                      <p className="text-gray-800 font-medium">
                        {o.customerName || <span className="text-gray-300 italic">Khách lẻ</span>}
                      </p>
                      {o.customerPhone && <p className="text-xs text-gray-400">{o.customerPhone}</p>}
                      {o.orderSource && <p className="text-xs text-gray-400 mt-0.5">{o.orderSource}</p>}
                    </td>

                    <td className="px-4 py-3">
                      <InvoiceDetailBadge o={o} />
                      {o.invoiceDeadlineExpired && !o.eInvoiceStatus && (
                        <p className="text-xs text-amber-600 mt-1">⏰ Hết hạn</p>
                      )}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-medium text-gray-800">{fmtCurrency(o.totalAmount)}</p>
                      {o.discountAmount > 0 && (
                        <p className="text-xs text-red-500">- {fmtCurrency(o.discountAmount)}</p>
                      )}
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-gray-700">{fmtCurrency(o.totalVatAmount)}</p>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="font-bold text-gray-900">{fmtCurrency(o.finalAmount)}</p>
                      <p className="text-xs text-gray-400">{o.paymentMethod}</p>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-gray-700 text-xs">{fmtDateTime(o.createdAt)}</p>
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1.5 min-w-[120px]">
                        {/* ─── HÓA ĐƠN CHÍNH ─── */}
                        {isIssued(o) ? (
                          <>
                            <button
                              onClick={async () => {
                                if (!o.eInvoiceNo) { showToast('❌ Đơn chưa có số hóa đơn', false); return }
                                try {
                                  const url = await getInvoicePdf(o.eInvoiceNo)
                                  window.open(url, '_blank')
                                } catch { showToast('❌ Không lấy được PDF', false) }
                              }}
                              className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors flex items-center gap-1 text-left">
                              📄 Xem hóa đơn
                              {o.eInvoiceNo && <span className="text-emerald-500 font-mono">{o.eInvoiceNo}</span>}
                            </button>
                            <button onClick={() => setModal({ ...o, _cqtMode: true })}
                              className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors text-left">
                              📨 Gửi CQT
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => setModal(o)}
                              className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors text-left">
                              👁 Xem trước HĐ
                            </button>
                            {o.status === 'COMPLETED' && (
                              <button onClick={() => setModal(o)}
                                className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors text-left">
                                🧾 Phát hành HĐ
                              </button>
                            )}
                          </>
                        )}

                        {/* ─── HÓA ĐƠN TẶNG — chỉ hiện khi đơn có item giảm 100% ─── */}
                        {o.hasGiftItems && (
                          <div className="mt-1 pt-1.5 border-t border-dashed border-amber-200">
                            {isGiftIssued(o) ? (
                              <>
                                <button
                                  onClick={async () => {
                                    try {
                                      const url = await getInvoicePdf(o.giftEInvoiceNo)
                                      window.open(url, '_blank')
                                    } catch { showToast('❌ Không lấy được PDF HĐ tặng', false) }
                                  }}
                                  className="w-full px-2.5 py-1.5 text-xs font-medium rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors flex items-center gap-1 text-left">
                                  🎁 Xem HĐ tặng
                                  {o.giftEInvoiceNo && <span className="text-amber-500 font-mono">{o.giftEInvoiceNo}</span>}
                                </button>
                                <button onClick={() => setModal({ ...o, _cqtMode: true, _giftMode: true })}
                                  className="w-full mt-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-violet-50 text-violet-700 hover:bg-violet-100 transition-colors text-left">
                                  📨 Gửi CQT HĐ tặng
                                </button>
                              </>
                            ) : isIssued(o) ? (
                              <>
                                <button onClick={() => setModal({ ...o, _giftMode: true })}
                                  className="w-full px-2.5 py-1.5 text-xs font-medium rounded-md bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors text-left">
                                  👁 Xem trước HĐ tặng
                                </button>
                                <button onClick={() => setModal({ ...o, _giftMode: true })}
                                  className="w-full mt-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors text-left">
                                  🎁 Phát hành HĐ tặng
                                </button>
                              </>
                            ) : (
                              <div className="text-[10px] text-amber-600 bg-amber-50 rounded px-2 py-1 leading-tight">
                                🎁 Có hàng tặng — phát hành HĐ chính trước
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="shrink-0 mt-3">
        <Pagination page={page} totalPages={meta.pages} onChange={p => patch({ posPage: p })} />
      </div>

      {modal && (
        <InvoiceModal
          source={modal._giftMode ? 'pos-gift' : 'pos'}
          order={
            modal._giftMode && modal._cqtMode
              ? {
                  ...modal,
                  // Khi gửi CQT cho HĐ tặng, modal cần đọc gift fields qua các key chuẩn
                  eInvoiceNo:             modal.giftEInvoiceNo,
                  eInvoiceTransactionId:  modal.giftEInvoiceTransactionId,
                  invoiceSeries:          modal.giftEInvoiceSeries,
                  templateCode:           modal.giftEInvoiceTemplateCode,
                }
              : modal
          }
          onClose={() => setModal(null)}
          onIssued={invoiceNo => {
            setModal(null)
            showToast(`✅ Phát hành OK — ${invoiceNo}`)
            setRefreshKey(k => k + 1)
          }}
        />
      )}
    </div>
  )
}