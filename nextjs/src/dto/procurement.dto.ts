// DTO автозакупа.
import { z } from 'zod'

// 🗑 в автозакупе: убрать товар из потребности, удалив его позиции в самих заявках
// (решение владельца 20.11.2026 — строка исчезает и из закупа, и из карточки заказчика).
export const dropDemandSchema = z.object({
  names: z.array(z.string().trim().min(1)).min(1),
})
export type DropDemandInput = z.infer<typeof dropDemandSchema>
