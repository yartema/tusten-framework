/**
 * Связь ошибок React-дерева с dev-оверлеем без импорта самого оверлея.
 *
 * Оверлей — отдельная точка входа (`@tusten/core/client/dev-overlay`) и в prod-бандл
 * не попадает. ErrorBoundary не может импортировать его напрямую, иначе весь оверлей
 * оказался бы в production; вместо этого он ищет хук в `globalThis`, который
 * регистрирует `installDevOverlay()`.
 */

/** Ключ глобального хука. Строка нужна и в overlay, и в ErrorBoundary. */
export const DEV_ERROR_HOOK = '__tustenReportDevError__'

/** Откуда пришла ошибка — влияет только на подпись в оверлее. */
export type DevErrorSource = 'ssr' | 'client' | 'navigation' | 'hydration' | 'boundary' | 'prefetch'

/** Сигнатура хука, который регистрирует оверлей. */
export type DevErrorReporter = (error: unknown, source?: DevErrorSource) => void

/**
 * Передаёт ошибку в dev-оверлей, если он установлен.
 *
 * В prod хука нет — вызов превращается в проверку глобальной переменной.
 *
 * @param error брошенное значение.
 * @param source источник ошибки.
 */
export function reportDevError(error: unknown, source: DevErrorSource = 'client'): void {
    const reporter = (globalThis as unknown as Record<string, unknown>)[DEV_ERROR_HOOK]
    if (typeof reporter === 'function') {
        ;(reporter as DevErrorReporter)(error, source)
    }
}
