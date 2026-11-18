import type { TustenRoute } from '../types'

/**
 * Обёртка над массивом маршрутов.
 *
 * Возвращает тот же массив, но даёт типизацию и точку расширения:
 * позже здесь можно добавлять валидацию во время выполнения
 * (например, проверку обязательных полей в dev-режиме).
 *
 * Обязательны только `id` и `contentConfig.workspaceConfig.template`.
 * Остальное опционально: `prefetchConfig` можно не задавать — тогда у страницы
 * нет page-слайсов и шаблон живёт на `templateProps` и глобальных слайсах.
 * Глобальные слайсы (`*.loader.ts`) тоже необязательны.
 *
 * @param routes массив маршрутов, объявленных в `router.ts`.
 * @returns тот же массив, типобезопасно.
 *
 * @example
 * ```ts
 * export default defineRoute([
 *   {
 *     id: 'home',
 *     index: true,
 *     metaConfig: { title: 'Главная' },
 *     contentConfig: {
 *       workspaceConfig: { template: 'HomePage/view:View' },
 *       // необязательно:
 *       prefetchConfig: { configLoader: 'HomePage/Factories/Root' },
 *     },
 *   },
 * ])
 * ```
 */
export function defineRoute(routes: TustenRoute[]): TustenRoute[] {
    return routes
}
