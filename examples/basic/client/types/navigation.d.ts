import '@tusten/core'

/**
 * Приложение ужесточает контракт `navigation` под себя: известные ключи
 * проверяются компилятором, индекс-сигнатура базы остаётся.
 */
declare module '@tusten/core' {
    interface TustenRouteNavigation {
        title: string
        icon?: string
        order?: number
        permission?: string
    }
}
