import type { TustenClientRoute, TustenNavigationItem } from '../types'

/**
 * Ключ `globalThis`, под которым живёт каталог навигации.
 *
 * Именно `globalThis`, а не модульная переменная: инстансов `@tusten/core`
 * несколько (SSR-бандл, client bundle, загрузка server-модулей через Vite),
 * поэтому модульное состояние разъедется. Так же устроен `getRouter()`.
 */
const NAVIGATION_KEY = '__rootNavigation'

/** Тип `globalThis` с слотом каталога. */
type NavigationGlobal = typeof globalThis & {
    [NAVIGATION_KEY]?: readonly TustenNavigationItem[]
}

/** Предупреждение о незасеянном каталоге выводим один раз за жизнь инстанса. */
let warnedAboutMissingCatalog = false

/**
 * Слот каталога в `globalThis`.
 *
 * @returns `globalThis` с известным ключом.
 */
function navigationSlot(): NavigationGlobal {
    return globalThis as NavigationGlobal
}

/**
 * Включён ли dev-режим (для one-shot `console.warn`).
 *
 * `import.meta.env` подставляет Vite; в чистом Node (prod-сервер) его нет.
 *
 * @returns `true` в dev.
 */
function isDevelopment(): boolean {
    return Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV)
}

/**
 * Строит плоский каталог навигации из маршрутов.
 *
 * Чистая функция без состояния — для тестов, `sitemap.xml` и серверного кода,
 * где есть собственное дерево маршрутов.
 *
 * Правила:
 * - opt-in: пункт появляется только при заданном `route.navigation`;
 * - `href` — дефолт, а не директива: непустой `navigation.href` побеждает,
 *   у динамического маршрута без явного `href` поля нет;
 * - зарезервированные ключи (`id`, `href`, `parentId`, `dynamic`, `slug`)
 *   всегда берутся из маршрута, payload их не подменяет;
 * - порядок — порядок объявления, ядро не сортирует по `order`.
 *
 * @param routes клиентские записи маршрутов (из `routesData` или дерева).
 * @returns замороженные пункты каталога.
 */
export function buildNavigation(routes: readonly TustenClientRoute[]): TustenNavigationItem[] {
    const items: TustenNavigationItem[] = []

    for (const route of routes) {
        const navigation = route.navigation

        // Opt-in: `undefined` / `null` — маршрут не участвует в навигации.
        if (!navigation) continue

        // Regex-slug'и `computePath` уже нормализует в `:slug`, поэтому проверка
        // по сегментам точная и не зависит от скомпилированного regex.
        const dynamic = route.path.split('/').some((segment) => segment.startsWith(':'))
        const explicitHref = typeof navigation.href === 'string' && navigation.href !== '' ? navigation.href : undefined
        const href = explicitHref ?? (dynamic ? undefined : route.path)

        // Payload идёт первым, служебные поля — поверх: так приложение не может
        // перебить `id` / `href` / `parentId` / `dynamic` / `slug`.
        const item = { ...navigation } as TustenNavigationItem
        delete item.href
        delete item.parentId
        delete item.slug

        item.id = route.id
        item.dynamic = dynamic
        if (href !== undefined) item.href = href
        if (route.parentId !== undefined) item.parentId = route.parentId
        if (route.slug !== undefined) item.slug = [...route.slug]

        items.push(Object.freeze(item))
    }

    return items
}

/**
 * Возвращает каталог навигации, засеянный рантаймом.
 *
 * Не путать с `useNavigation()`: тот отвечает «где я сейчас и как перейти»,
 * а `getNavigation()` — «какие пункты есть в приложении». Хук не нужен —
 * каталог статичен и одинаков в SSR, SPA-навигации, гидрации и `reload`.
 *
 * Доступен и на клиенте, и на сервере: в кастомном JSON-RPC-обработчике можно
 * вернуть каталог (при необходимости уже отфильтрованный по правам или `ctx`)
 * клиенту — транспорт остаётся обычным `Service.call`.
 *
 * Возвращается новый массив: сортируйте и фильтруйте на месте, не боясь
 * испортить каталог. Элементы заморожены.
 *
 * @returns пункты навигации (пустой массив, пока каталог не засеян).
 */
export function getNavigation(): TustenNavigationItem[] {
    const catalog = navigationSlot()[NAVIGATION_KEY]

    if (!catalog) {
        // Ошибка здесь была бы ловушкой: пользовательский модуль мог вызвать
        // `getNavigation()` раньше сидинга client-entry. Пустой список безопаснее.
        if (!warnedAboutMissingCatalog && isDevelopment()) {
            warnedAboutMissingCatalog = true
            console.warn(
                '[tusten] getNavigation(): navigation catalog is not seeded yet — returning []. ' +
                    'Call it inside a component or handler, not at module top level.',
            )
        }
        return []
    }

    return [...catalog]
}

/**
 * Засеивает каталог навигации.
 *
 * Для entry points (`client-entry`, `create-server`) и тестов; в прикладном
 * коде не используется.
 *
 * @internal
 * @param items пункты каталога.
 */
export function setNavigationCatalog(items: readonly TustenNavigationItem[]): void {
    navigationSlot()[NAVIGATION_KEY] = Object.freeze(items.slice())
}
