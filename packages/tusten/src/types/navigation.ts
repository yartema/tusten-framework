/**
 * Пользовательские данные пункта навигации (`route.navigation`).
 *
 * База намеренно открыта: ядро не знает про `title`, `icon`, `order`,
 * `permission` и любые другие ключи приложения. Приложение ужесточает контракт
 * через module augmentation:
 *
 * ```ts
 * declare module '@tusten/core' {
 *     interface TustenRouteNavigation {
 *         title: string
 *         icon?: string
 *         order?: number
 *         permission?: string
 *     }
 * }
 * ```
 *
 * После этого известные ключи проверяются компилятором, а индекс-сигнатура
 * позволяет добавлять новые без правки ядра.
 *
 * Значения должны быть JSON-safe: `navigation` уезжает в `routesData` через
 * `JSON.stringify` (проверка — `buildRouteTree`).
 */
export interface TustenRouteNavigation {
    [key: string]: unknown
}

/**
 * Плоский пункт каталога навигации.
 *
 * Обогащается только фактическими данными маршрута (`id`, `href`, `parentId`,
 * `dynamic`, `slug`), остальное приходит из `navigation` как есть.
 * Зарезервированные ключи ядро перезаписывает — payload не может их подменить.
 */
export type TustenNavigationItem = {
    /** Стабильный id маршрута. */
    id: string
    /**
     * Готовый внутренний путь.
     *
     * Для статического маршрута — `route.path`; для динамического — только явный
     * `navigation.href`, иначе поля нет.
     */
    href?: string
    /** Родительский маршрут (для вложенных меню). */
    parentId?: string
    /** `true` — в пути есть параметры (`:id`, regex-slug). */
    dynamic: boolean
    /** Сегменты slug, как объявлены в маршруте. */
    slug?: string[]
} & TustenRouteNavigation
