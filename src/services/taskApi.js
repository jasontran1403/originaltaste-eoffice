import api from './api'

// Detect role prefix from stored auth
function rolePrefix() {
  const role = localStorage.getItem('role') || sessionStorage.getItem('role') || ''
  if (role === 'ADMIN') return '/api/admin'
  if (role === 'ACCOUNTANT' || role === 'SUPERADMIN') return '/api/accountant'
  return '/api/user'
}

// ─── Tasks ───────────────────────────────────────────────────────

export const listTasks = (params = {}) => {
  const p = rolePrefix()
  return api.get(`${p}/tasks`, { params })
}

export const getTask = id => {
  const p = rolePrefix()
  return api.get(`${p}/tasks/${id}`)
}

export const updateProgress = (id, data) => {
  const p = rolePrefix()
  return api.patch(`${p}/tasks/${id}/progress`, data)
}

export const completeTask = (id, data) => {
  const p = rolePrefix()
  return api.post(`${p}/tasks/${id}/complete`, data)
}

export const requestExtension = (id, data) => {
  const p = rolePrefix()
  return api.post(`${p}/tasks/${id}/extension`, data)
}

// ─── Admin-only ──────────────────────────────────────────────────

export const createTask = data => api.post('/api/admin/tasks', data)
export const updateTask = (id, data) => api.put(`/api/admin/tasks/${id}`, data)
export const deleteTask = id => api.delete(`/api/admin/tasks/${id}`)
export const getDashboard = () => api.get('/api/admin/tasks/dashboard')
export const getCategories = () => api.get('/api/admin/tasks/categories')
export const getAssignableUsers = () => api.get('/api/admin/tasks/users')
export const getPendingExtensions = (page = 0, size = 20) =>
  api.get('/api/admin/tasks/extensions', { params: { page, size } })
export const reviewExtension = (id, data) =>
  api.put(`/api/admin/tasks/extensions/${id}`, data)

// ─── Messages ────────────────────────────────────────────────────

export const getMessages = (page = 0, size = 20) => {
  const p = rolePrefix()
  return api.get(`${p}/messages`, { params: { page, size } })
}

export const getUnreadCount = () => {
  const p = rolePrefix()
  return api.get(`${p}/messages/unread`)
}

export const markRead = id => {
  const p = rolePrefix()
  return api.patch(`${p}/messages/${id}/read`)
}

export const markAllRead = () => {
  const p = rolePrefix()
  return api.post(`${p}/messages/read-all`)
}
