import axios from 'axios'
import { readToken, wipeAuth } from '../hooks/useAuth'

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:9009'

const api = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' }
})

const AUTH_ERROR_CODES = [901, 902, 923, 924]
const SESSION_EXPIRED_DELAY = 3000
let expiredHandled = false

function handleSessionExpired(message) {
  if (expiredHandled) return
  expiredHandled = true
  import('../components/ui/Toast').then(({ toastStatic }) => {
    // fallback: use alert if toast not available
  }).catch(() => {})
  alert(message || 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.')
  setTimeout(() => { wipeAuth(); window.location.href = '/login' }, SESSION_EXPIRED_DELAY)
}

export const signPdf = async ({ file, zones, pin }) => {
  const form = new FormData()
  form.append('file', file)
  form.append('zones', JSON.stringify({ zones }))

  const res = await api.post('/api/tools/sign', form, {
    responseType: 'blob',
    timeout: 5 * 60 * 1000,
    headers: { 'X-Token-Pin': pin },   // PIN chỉ nằm trong header, không log
  })

  await assertPdfBlob(res.data)

  const cd = res.headers['content-disposition'] || ''
  const match = cd.match(/filename[^;=\n]*=\s*(?:["']?)([^"'\n;]+)/i)
  return {
    blobUrl: URL.createObjectURL(res.data),
    filename: match?.[1] || `signed_${Date.now()}.pdf`,
  }
}


const isExempt = url => {
  const u = url || ''
  return u.startsWith('/api/public/') || u.startsWith('/api/auth/')
}

api.interceptors.request.use(cfg => {
  const token = readToken()
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  if (typeof FormData !== 'undefined' && cfg.data instanceof FormData) {
    delete cfg.headers['Content-Type']
    delete cfg.headers['content-type']
  }
  return cfg
})

api.interceptors.response.use(
  res => {
    const code = res.data?.code
    if (AUTH_ERROR_CODES.includes(code) && !isExempt(res.config?.url)) handleSessionExpired(res.data?.message)
    return res
  },
  err => {
    const status = err.response?.status
    if ((status === 401 || status === 403) && !isExempt(err.config?.url)) handleSessionExpired(err.response?.data?.message)
    return Promise.reject(err)
  }
)

export const login = (username, password) => {
  expiredHandled = false
  return api.post('/api/auth/login', { username, password })
}

export default api

// ─── POS/Einvoice endpoints (accountant) ─────────────────────────
const dateParams = (fromDate, toDate, date) => {
  if (fromDate && toDate && fromDate !== toDate) return { fromDate, toDate }
  if (fromDate) return { date: fromDate }
  if (date) return { date }
  return {}
}

export const getInvoiceOrders = (date, page = 0, size = 50, fromDate, toDate, storeId) => {
  const params = { page, size, ...dateParams(fromDate, toDate, date) }
  if (storeId) params.storeId = storeId
  return api.get('/api/pos/einvoice/orders', { params })
}

export const getStores = () => api.get('/api/pos/einvoice/stores')

export const getSaleInvoiceOrders = (page = 0, size = 50, fromDate, toDate, type, q) => {
  const params = { page, size, ...dateParams(fromDate, toDate) }
  if (type) params.type = type
  if (q) params.q = q
  return api.get('/api/pos/einvoice/sale/orders', { params })
}

export const getSaleOrderTypes = () => api.get('/api/pos/einvoice/sale/types')

export const updateSaleInvoiceInfo = (orderCode, data) => api.put(`/api/pos/einvoice/sale/${orderCode}/invoice-info`, data)
export const getSaleInvoiceQr = orderCode => api.get(`/api/pos/einvoice/sale/${orderCode}/invoice-qr`)
export const previewSaleInvoice = (orderCode, buyerInfo = null) => api.post(`/api/pos/einvoice/sale/preview/${orderCode}`, buyerInfo ?? {})
export const issueSaleInvoice = (orderCode, buyerInfo = null) => api.post(`/api/pos/einvoice/sale/issue/${orderCode}`, buyerInfo ?? {})
export const sendSaleInvoiceToCqt = orderCode => api.post(`/api/pos/einvoice/sale/${orderCode}/send-cqt`, {})
export const createDraftInvoice = (orderCode, buyerInfo) => api.post(`/api/pos/einvoice/draft/${orderCode}`, buyerInfo ?? {})
export const issueRetailInvoice = orderCode => api.post(`/api/pos/einvoice/retail/${orderCode}`, {})
export const issueBusinessInvoice = (orderCode, buyerInfo) => api.post(`/api/pos/einvoice/business/${orderCode}`, buyerInfo)
export const previewInvoice = (orderCode, buyerInfo = null) => api.post(`/api/pos/einvoice/preview/${orderCode}`, buyerInfo ?? {})
export const sendInvoiceToCqt = orderCode => api.post(`/api/pos/einvoice/${orderCode}/send-cqt`, {})
export const getInvoicePdf = async (invoiceNo) => {
  const response = await api.get(`/api/pos/einvoice/${invoiceNo}/pdf`, { responseType: 'blob' })
  const blob = new Blob([response.data], { type: 'application/pdf' })
  return URL.createObjectURL(blob)
}
export const getPdfUrl = invoiceNo => `${BASE}/api/pos/einvoice/${invoiceNo}/pdf`

export const mediaUrl = path => {
  if (!path) return ''
  return /^https?:\/\//.test(path) ? path : BASE + path
}
