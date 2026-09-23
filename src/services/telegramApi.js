import api from './api'

/**
 * API cho luồng liên kết Telegram cá nhân.
 *
 * Backend: /api/telegram/link/{status,init} + DELETE /api/telegram/link
 * Chỉ dành cho user đang login — JWT lấy từ interceptor trong api.js.
 */

/** { linked, botConfigured, telegramUsername?, telegramDisplayName?, linkedAt? } */
export const getTelegramStatus = () => api.get('/api/telegram/link/status')

/** { token, telegramDeepLink, botUsername, expiresAt } */
export const initTelegramLink = () => api.post('/api/telegram/link/init')

/** 204 No Content */
export const unlinkTelegram = () => api.delete('/api/telegram/link')
