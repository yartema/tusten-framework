import { useMemo } from 'react'
import type { TustenClientRoute } from '../../types'
import { useResourceContextOptional } from '../context/RootProvider'
import { getRouter, type TustenRouterApi } from './useRouter'

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

    return useMemo<TustenNavigation>(
        () => ({
            pathname: ctx ? ctx.router.path : typeof window !== 'undefined' ? window.location.pathname : '',
            params: ctx ? ctx.router.params : {},
            query: ctx ? ctx.router.query : {},
            route: ctx ? ctx.route : null,
            push: router.push,
            replace: router.replace,
            back: router.back,
            prefetch: router.prefetch,
            reload: router.reload,
        }),
        [ctx, router],
    )
}
