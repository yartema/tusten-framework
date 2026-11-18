import { Service, Slice } from '@tusten/core'
import type { FactoryImplementation } from '@tusten/core'

/**
 * Ответ `App.Info`.
 *
 * Форма совпадает с `server/app/App.meta.ts`. Тип описан здесь, чтобы клиентский
 * бандл не импортировал серверный модуль даже как тип; общий тип можно вынести
 * в `shared/` и импортировать из обеих сторон.
 */
export interface AppInfo {
    name: string
    stack: string[]
}

/** Слайс страницы: состояние приходит из SSR и живёт в реестре. */
export class AppInfoSlice extends Slice<AppInfo> {}

/**
 * Клиент JSON-RPC.
 *
 * На SSR `Service.call` идёт через ALS-executor напрямую в handler,
 * в браузере — `POST /service`. `cache` включает TTL-кэш: повторный
 * `App.Info` в течение 30 секунд не уходит на сервер.
 */
export const appService = new Service({ endpoint: 'App', cache: 30_000 })

/** Фабрика страницы: `loadData` вызывает метод `App.Info`. */
export const AppInfoLoader: FactoryImplementation<AppInfo> = {
    async loadData() {
        return appService.call<AppInfo>('Info')
    },
    slice: AppInfoSlice,
}
