// Совместимость: админка исторически импортирует из '@/lib/adminApi'.
// Реальные реализации — в доменных модулях lib/api/*. Здесь только реэкспорт.
export {
  listOrders as fetchOrders, getCard, orderAction, createOrder,
  assignLogist, setPosStatus, postInvoice,
  updatePosition, addPosition, deletePosition, updateCard,
} from './api/orders'
export { fetchRefs } from './api/refs'
export { logout, listUsers as fetchUsers } from './api/auth'
