import type { MetaConfig, RouteTree, TustenClientRoute, TustenRoute } from '../types'

/**
 * Источник проекции: серверный `TustenRoute` или клиентская запись,
 * где `metaConfig` может быть `null`.
 */
export type ClientRouteSource = Omit<TustenRoute, 'metaConfig'> & {
    metaConfig?: MetaConfig | null
}

/** Значения, которых нет в самом `TustenRoute`, но они нужны клиентской проекции. */
export interface ClientRouteContext {
    /** URL-путь маршрута. */
    path: string
    /** Цепочка предков (id) от корня к родителю. */
    parentIds?: string[]
    /** Цепочка layout-типов (root → leaf). */
    layoutChain?: string[]
}

/**
 * Собирает цепочку `parentId` от корня к родителю маршрута.
 *
 * Защита от циклов не лишняя: `buildRouteTree` валидирует их на старте, но
 * проекция может вызываться и на частичном дереве (тесты, инструменты).
 *
 * @param routeId id маршрута.
 * @param byId все маршруты по id.
 * @returns id предков, от корня к родителю.
 */
export function collectParentIds(routeId: string, byId: ReadonlyMap<string, TustenRoute>): string[] {
    const ids: string[] = []
    const seen = new Set<string>([routeId])
    let cursor = byId.get(routeId)?.parentId

    while (cursor) {
        if (seen.has(cursor)) break
        seen.add(cursor)

        const parent = byId.get(cursor)
        if (!parent) break

        ids.unshift(parent.id)
        cursor = parent.parentId
    }

    return ids
}

/**
 * Строит публичную клиентскую проекцию маршрута.
 *
 * Сервер (`TustenRoute`) и клиентская запись `routesData` — разные объекты:
 * у сервера нет `title`, у клиента — `type`. Если root controller рендерит
 * данные маршрута, обе стороны обязаны видеть одинаковую форму, иначе
 * гидрация даст mismatch. Поэтому и сервер, и `routesData` используют эту функцию.
 *
 * @param route маршрут (серверный или клиентская запись).
 * @param context путь, предки и цепочка layouts.
 * @returns JSON-safe проекция для клиента.
 */
export function toClientRoute(route: ClientRouteSource, context: ClientRouteContext): TustenClientRoute {
    return {
        id: route.id,
        path: context.path,
        title: route.metaConfig?.title ?? 'Страница',
        description: route.metaConfig?.meta?.find((tag) => tag.name === 'description')?.content ?? null,
        parentId: route.parentId,
        parentIds: context.parentIds ?? [],
        index: route.index,
        slug: route.slug,
        ssr: route.ssr,
        meta: route.meta ?? {},
        navigation: route.navigation,
        metaConfig: route.metaConfig ?? null,
        contentConfig: route.contentConfig,
        middleware: route.middleware ?? [],
        layoutChain: context.layoutChain ?? [],
    }
}

/**
 * Проецирует всё дерево маршрутов в клиентские записи.
 *
 * Одна и та же форма нужна и Vite-плагину (`routesData`), и серверному
 * сидингу каталога навигации — иначе SSR и клиент разойдутся.
 *
 * @param routeTree построенное дерево маршрутов.
 * @returns клиентские записи в порядке объявления (`byId` — `Map`).
 */
export function buildClientRoutes(routeTree: RouteTree): TustenClientRoute[] {
    return Array.from(routeTree.byId.values()).map((route) =>
        toClientRoute(route, {
            path: routeTree.paths.get(route.id) ?? '/',
            parentIds: collectParentIds(route.id, routeTree.byId),
            layoutChain: routeTree.layoutChains.get(route.id) ?? [],
        }),
    )
}

/**
 * Отрезает от клиентской записи внутренние поля загрузчика (`templatePath`, `templateExport`).
 *
 * Нужно, чтобы в root controller уходила ровно та же форма, что и на сервере.
 *
 * @param route клиентская запись маршрута.
 * @returns публичная проекция.
 */
export function pickClientRoute(route: TustenClientRoute): TustenClientRoute {
    return toClientRoute(route, {
        path: route.path,
        parentIds: route.parentIds,
        layoutChain: route.layoutChain,
    })
}
