/** Опции `router.reload()`. */
export interface RouterReloadOptions {
    /**
     * Перезапускать глобальные loaders (`defineGlobalLoader`).
     *
     * По умолчанию `true`: «обновить страницу» означает обновить все данные.
     * `false` — только page-лоадеры текущего маршрута; глобальные состояния
     * остаются прежними.
     */
    global?: boolean
    /**
     * Использовать клиентский кэш `Service`.
     *
     * По умолчанию `false`: кэш сбрасывается перед reload, чтобы `loadData`
     * действительно сходил за свежими данными. `true` — разрешить кэш
     * (полезно, когда свежесть не нужна и важна скорость).
     */
    cache?: boolean
    /**
     * Перемонтировать страницу.
     *
     * По умолчанию `false`: локальный React-state (формы, табы) сохраняется,
     * меняются только слайсы. `true` — полный ремоунт шаблона страницы;
     * root controller и layouts остаются.
     */
    remount?: boolean
    /**
     * Прогонять клиентскую middleware-цепочку.
     *
     * По умолчанию `true` — reload семантически ближе к повторному переходу.
     * `false` — только перезагрузка данных.
     */
    middleware?: boolean
}

/** Результат `useRouter` и `getRouter`. */
export interface TustenRouterApi {
    /** Перейти на путь, добавить в history. */
    push: (path: string) => Promise<void>
    /** Заменить текущий путь без записи в history. */
    replace: (path: string) => Promise<void>
    /** Назад. */
    back: () => void
    /** Прогреть данные для маршрута (без навигации). */
    prefetch: (path: string) => Promise<void>
    /**
     * Перезапустить лоадеры текущего маршрута без смены URL.
     *
     * Это **не** `window.location.reload()`: history не меняется, SPA-сессия
     * продолжается. По умолчанию обновляются глобальные и page-слайсы,
     * кэш `Service` сбрасывается, локальный state компонентов сохраняется.
     *
     * @param options опции перезагрузки.
     * @returns промис завершения (для индикатора «обновляю…»).
     */
    reload: (options?: RouterReloadOptions) => Promise<void>
}

/**
 * Запасной навигатор до инициализации client-entry.
 *
 * Использует полную перезагрузку, а не SPA-переход. На сервере `window` нет,
 * поэтому все методы — no-op.
 */
const fallbackRouter: TustenRouterApi = {
    push: async (p) => {
        if (typeof window !== 'undefined') window.location.href = p
    },
    replace: async (p) => {
        if (typeof window !== 'undefined') window.location.replace(p)
    },
    back: () => {
        if (typeof window !== 'undefined') window.history.back()
    },
    prefetch: async () => undefined,
    reload: async () => {
        // До инициализации client-entry данных и маршрутов нет — остаётся
        // единственный честный вариант: перезагрузить документ целиком.
        if (typeof window !== 'undefined') window.location.reload()
    },
}

/**
 * Навигатор без React-контекста: работает в обработчиках, сервисах и таймерах.
 *
 * Реализацию ставит client-entry в `globalThis.__rootNavigate`. Используется
 * `globalThis`, а не модульная переменная: при двух инстансах `tusten/client`
 * (SSR-бандл и клиент) модульное состояние расходится, а `globalThis` общий.
 *
 * @returns API роутера.
 */
export function getRouter(): TustenRouterApi {
    return (globalThis as { __rootNavigate?: TustenRouterApi }).__rootNavigate ?? fallbackRouter
}

/**
 * Хук для компонентов — обёртка над `getRouter`. Не требует `<RootProvider>`.
 *
 * @deprecated Используйте `useNavigation()`: тот же набор методов плюс
 * `pathname` / `params` / `query` / `route`.
 * @returns API роутера.
 */
export function useRouter(): TustenRouterApi {
    return getRouter()
}
