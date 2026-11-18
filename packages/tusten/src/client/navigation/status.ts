/**
 * Статус навигации для индикатора загрузки.
 *
 * Состояние живёт в `globalThis`, а не в модульной переменной: клиентский
 * бандл и SSR-бандл могут загрузить разные инстансы `@tusten/core/client`,
 * и тогда модульное состояние разъехалось бы (как у `getRouter()`).
 */

/** Ключ `globalThis` со стором статуса. */
const STATUS_KEY = '__tustenNavigationStatus'

/** Стор статуса навигации. */
interface NavigationStatusStore {
    /** Идёт переход (middleware / prefetch / commit нового дерева). */
    pending: boolean
    /** Подписчики `useSyncExternalStore`. */
    listeners: Set<() => void>
}

/** Тип `globalThis` со слотом статуса. */
type NavigationStatusGlobal = typeof globalThis & {
    [STATUS_KEY]?: NavigationStatusStore
}

/**
 * Слот статуса в `globalThis`.
 *
 * @returns стор статуса (создаётся при первом обращении).
 */
function statusStore(): NavigationStatusStore {
    const global = globalThis as NavigationStatusGlobal
    let store = global[STATUS_KEY]
    if (!store) {
        store = { pending: false, listeners: new Set() }
        global[STATUS_KEY] = store
    }
    return store
}

/**
 * Устанавливает статус перехода.
 *
 * Вызывается client-entry: `true` — в начале навигации/reload, `false` — после
 * commit нового дерева (или ошибки). Лишние вызовы не нотифицируют подписчиков.
 *
 * @param pending идёт ли переход.
 */
export function setNavigationPending(pending: boolean): void {
    const store = statusStore()
    if (store.pending === pending) return
    store.pending = pending
    for (const listener of [...store.listeners]) listener()
}

/**
 * Текущий статус перехода.
 *
 * @returns `true`, если навигация ещё не завершена.
 */
export function isNavigationPending(): boolean {
    return statusStore().pending
}

/**
 * Подписка на изменение статуса (для `useSyncExternalStore`).
 *
 * @param listener колбэк.
 * @returns функция отписки.
 */
export function subscribeNavigationPending(listener: () => void): () => void {
    const store = statusStore()
    store.listeners.add(listener)
    return () => {
        store.listeners.delete(listener)
    }
}
