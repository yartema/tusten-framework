/**
 * Объявление middleware.
 *
 * Используется в `TustenRoute.middleware` (страницы), `ServerRoute.middleware`
 * (API) и глобально в `TustenConfig.middleware`.
 */
export interface MiddlewareDef {
    /** Уникальный ключ (отладка, порядок, логи). */
    id: string
    /** Путь до async-функции от `projectDir`. */
    handler: string
    /** Первый аргумент handler'а. */
    params?: Record<string, unknown>
    /** Только для глобальных в `tusten.config.ts`. */
    side?: 'client' | 'server' | 'both'
}
