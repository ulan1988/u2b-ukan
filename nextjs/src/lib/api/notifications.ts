// Домен: уведомления.
import { getArray, send } from './http'

export const listNotifications = () => getArray('/api/notifications')
export const markRead = (id: string) => send(`/api/notifications/${id}/read`, 'PUT')
