import { getObj } from './http'

// Версия, выложенная на сервер сейчас (короткий SHA). Пусто — не удалось узнать (нет сети): тогда ничего не предлагаем.
export const liveVersion = async () => String((await getObj<{ sha?: string }>('/api/health', {})).sha || '')
