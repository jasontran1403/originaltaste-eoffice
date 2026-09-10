import api from './api'

function rolePrefix() {
  const role = localStorage.getItem('role') || sessionStorage.getItem('role') || ''
  if (role === 'ADMIN' || role === 'SUPERADMIN') return '/api/admin'
  return '/api/user'
}

function isManager() {
  const role = localStorage.getItem('role') || sessionStorage.getItem('role') || ''
  return role === 'ADMIN' || role === 'SUPERADMIN'
}

// ─── Tasks ───────────────────────────────────────────────────────

export const listTasks = (params = {}) =>
  api.get(`${rolePrefix()}/tasks`, { params })

export const getTask = id =>
  api.get(`${rolePrefix()}/tasks/${id}`)

export const updateProgress = (id, data) =>
  api.patch(`${rolePrefix()}/tasks/${id}/progress`, data)

export const completeSubItem = (taskId, subId, data = {}) =>
  api.post(`/api/user/tasks/${taskId}/sub/${subId}/complete`, data)

export const completeTask = (id, data) =>
  api.post(`${rolePrefix()}/tasks/${id}/complete`, data)

export const requestExtension = (id, data) =>
  api.post(`${rolePrefix()}/tasks/${id}/extension`, data)

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
/** Admin gán thêm / đổi người xử lý */
export const reassignTask = (id, data) =>
  api.put(`/api/admin/tasks/${id}/reassign`, data)

// ─── User personal tasks ─────────────────────────────────────────

export const createPersonalTask = data => api.post('/api/user/tasks', data)
export const updatePersonalTask = (id, data) => api.put(`/api/user/tasks/${id}`, data)
export const deletePersonalTask = id => api.delete(`/api/user/tasks/${id}`)

// ─── Messages ────────────────────────────────────────────────────

export const getMessages = (page = 0, size = 20) =>
  api.get(`${rolePrefix()}/messages`, { params: { page, size } })

export const getUnreadCount = () =>
  api.get(`${rolePrefix()}/messages/unread`)

export const markRead = id =>
  api.patch(`${rolePrefix()}/messages/${id}/read`)

export const markAllRead = () =>
  api.post(`${rolePrefix()}/messages/read-all`)

export { isManager }
