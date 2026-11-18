import type { FactoryMap, TustenRouter } from '@tusten/core'

/**
 * `getConfig` страницы: карта фабрик, которые prefetch загружает до рендера.
 *
 * Ключ (`AppInfo`) — имя слайса в реестре; `dataFactoryName` — модуль и экспорт
 * реализации. `loadData` этой фабрики вызывает JSON-RPC `App.Info`.
 *
 * @param _configParams статические аргументы из `router.ts`.
 * @param _router контекст маршрута.
 * @returns карта фабрик.
 */
export default function getConfig(_configParams: Record<string, unknown>, _router: TustenRouter): FactoryMap {
    return {
        AppInfo: {
            dataFactoryName: 'Page/Factories/appInfo:AppInfoLoader',
        },
    }
}
