import { useSyncExternalStore } from 'react'
import { isNavigationPending, subscribeNavigationPending } from '../navigation/status'

/**
 * Серверный снапшот: на сервере навигации нет.
 *
 * @returns всегда `false`.
 */
const serverSnapshot = (): boolean => false

/**
 * Идёт ли сейчас SPA-переход или `router.reload()`.
 *
 * `true` с момента старта навигации (middleware + prefetch) до commit нового
 * дерева. Удобно для индикатора загрузки:
 *
 * ```tsx
 * const pending = useNavigationPending()
 * return pending ? <Spinner /> : null
 * ```
 *
 * @returns `true`, пока переход не завершён.
 */
export function useNavigationPending(): boolean {
    return useSyncExternalStore(subscribeNavigationPending, isNavigationPending, serverSnapshot)
}
