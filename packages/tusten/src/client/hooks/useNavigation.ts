import { useMemo } from 'react'
import type { TustenClientRoute } from '../../types'
import { useResourceContextOptional } from '../context/RootProvider'
import { getRouter, type TustenRouterApi } from './useRouter'
import { useNavigationPending } from './useNavigationPending'

/**
 * Единый API навигации: текущее состояние маршрута + действия роутера.
 *
 * Заменяет связку `useRouter()` + `usePathname()` + `useParams()` +
 * `useQuery()` одним хуком:
 *
 * ```tsx
 * const nav = useNavigation()
 *
 * nav.pathname
 * nav.params
 * nav.query
 * nav.route
 * await nav.push('/about')
 * await nav.reload()
 * ```
 */
export interface TustenNavigation extends TustenRouterApi {
    /** Текущий pathname (без query). */
    pathname: string
    /** Динамические сегменты текущего маршрута. */
    params: Record<string, string>
    /** Query-параметры текущего URL. */
    query: Record<string, string>
    /** Конфиг текущего маршрута; `null` — 404 или маршрут не известен. */
    route: TustenClientRoute | null
    /**
     * Идёт ли SPA-переход: `true` от старта навигации до commit нового дерева.
     *
     * Пока `pending` — видна старая страница, а её слайсы ещё живы (уничтожаются
     * после commit). Удобно для полоски загрузки и блокировки повторных кликов.
     */
    pending: boolean
}

/**
 * Хук навигации.
 *
 * Работает и вне `<RootProvider>`: действия берутся из `getRouter()`, а при
 * отсутствии контекста `pathname` читается из `window.location`, `params` и
 * `query` пустые, `route` — `null`. Внутри приложения значения реактивны.
 *
 * @returns состояние маршрута и методы навигации.
 */
export function useNavigation(): TustenNavigation {
    const ctx = useResourceContextOptional()
    const router = getRouter()
    const pending = useNavigationPending()

    return useMemo<TustenNavigation>(
        () => ({
            pathname: ctx ? ctx.router.path : typeof window !== 'undefined' ? window.location.pathname : '',
            params: ctx ? ctx.router.params : {},
            query: ctx ? ctx.router.query : {},
            route: ctx ? ctx.route : null,
            pending,
            push: router.push,
            replace: router.replace,
            back: router.back,
            prefetch: router.prefetch,
            reload: router.reload,
        }),
        [ctx, router, pending],
    )
}
