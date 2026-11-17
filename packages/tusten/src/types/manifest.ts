import type { FactoryMap } from './factory'
import type { TustenRoute } from './route'

/**
 * Вид модуля в манифесте — определяет, как его резолвить и подключать.
 */
export type ModuleKind = 'component' | 'routes' | 'config' | 'factory' | 'layout' | 'globalLoader'

/**
 * Запись манифеста для одного модуля.
 */
export interface ManifestEntry {
    /** Вид модуля. */
    kind: ModuleKind
    /** Путь до JS/TS-модуля (для загрузки). */
    js: string
    /** CSS-файлы, ассоциированные с модулем (Phase 1b). */
    css?: string[]
}

/**
 * Манифест всех модулей, сгенерированный на этапе сканирования.
 */
export interface Manifest {
    /** Версия манифеста (хеш от содержимого). */
    version: string
    /** Записи модулей по их именам. */
    modules: Record<string, ManifestEntry>
}

/**
 * Результат сканирования клиентского каталога.
 */
export interface ScanResult {
    /** Найденные модули `router.ts` и их содержимое (вызовы `defineRoute`). */
    routeModules: Array<{ file: string; routes: TustenRoute[] }>
    /** Найденные `*.loader.ts` и их карты глобальных загрузчиков. */
    loaderModules: Array<{ file: string; map: FactoryMap }>
}

/**
 * Реестр словарей i18n: имя модуля (папка в `clientDir`) → locale → абсолютный
 * путь к `lang/<locale>/<locale>.json`. Записываются только существующие файлы.
 */
export type I18nRegistry = Record<string, Record<string, string>>
