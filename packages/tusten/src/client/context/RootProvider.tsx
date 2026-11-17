import { createContext, createElement, useContext, useMemo, type PropsWithChildren, type ReactNode } from 'react'
import { TustenError } from '../../core/errors'
import type { SliceRegistry } from '../slices/SliceRegistry'
import type { TustenClientRoute, TustenClientRouter } from '../../types'

/** Значение контекста tusten (клиент). */
export interface TustenContextValue {
    /** Реестр слайсов. */
    sliceRegistry: SliceRegistry
    /** Текущий роутер (controlled из client-entry). */
    router: TustenClientRouter
    /** Конфиг текущего маршрута; `null` — 404 или маршрут не известен. */
    route: TustenClientRoute | null
}

/** Внутренний Context. */
const TustenContext = createContext<TustenContextValue | null>(null)

/** Пропсы провайдера. */
export type RootProviderProps = PropsWithChildren<{
    /** Реестр слайсов. */
    sliceRegistry: SliceRegistry
    /** Текущий роутер (controlled — обновляется через повторный render). */
    router: TustenClientRouter
    /** Публичный конфиг маршрута для `useRoute()`. */
    route?: TustenClientRoute | null
}>

/**
 * Провайдер фреймворка: прокидывает реестр слайсов, router и конфиг маршрута
 * в дерево React.
 *
 * `router` — **controlled prop**. Не хранит собственный state. При навигации
 * client-entry делает `rootRef.render(<RootProvider router={newRouter} ...>)`,
 * и `usePathname`/`useParams`/`useQuery` сразу видят новое значение.
 *
 * @param props пропсы.
 * @returns элемент провайдера.
 */
export function RootProvider(props: RootProviderProps): ReactNode {
    const value = useMemo<TustenContextValue>(
        () => ({ sliceRegistry: props.sliceRegistry, router: props.router, route: props.route ?? null }),
        [props.sliceRegistry, props.router, props.route],
    )
    return createElement(TustenContext.Provider, { value }, props.children)
}

/**
 * Достаёт контекст tusten.
 *
 * @returns значение контекста.
 * @throws {TustenError} если провайдера нет.
 */
export function useResourceContext(): TustenContextValue {
    const ctx = useContext(TustenContext)
    if (!ctx) {
        throw new TustenError('useResourceContext must be used within <RootProvider>')
    }
    return ctx
}

/**
 * Достаёт контекст tusten или `null`.
 *
 * Нужен хукам, которые умеют работать и вне `<RootProvider>` (например,
 * `useNavigation()`: навигатор доступен через `getRouter()`, а pathname —
 * только из контекста).
 *
 * @returns значение контекста или `null`.
 */
export function useResourceContextOptional(): TustenContextValue | null {
    return useContext(TustenContext)
}
