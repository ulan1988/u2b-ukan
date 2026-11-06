// Передача заказа филиала головному (без логиста).
import { z } from 'zod'

export const sendToHqSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),   // рабочая дата кабинета (задним числом)
})
export type SendToHqInput = z.infer<typeof sendToHqSchema>
