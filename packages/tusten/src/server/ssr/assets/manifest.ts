import path from 'node:path'
import { resolveVitePath } from './vite-path'

/**
 * Запись Vite client manifest (используемое подмножество).
 */
export interface ClientManifestEntry {
    /** Имя файла в `outDir` (с хешем). */
    file: string
    /** Исходный путь модуля от корня Vite (без ведущего `/`). */
    src?: string
    /** Entry-чанк клиента. */
    isEntry?: boolean
    /** Чанки, импортированные статически (их CSS нужен до гидрации). */
    imports?: string[]
    /** CSS-файлы чанка. */
    css?: string[]
}

/** Опции построения индекса manifest. */
export interface ClientManifestIndexOptions {
    /** Корень проекта. */
    projectDir: string
    /** Каталог клиентского кода. */
    clientDir: string
}

/**
 * Предвычисленный индекс Vite client manifest.
 *
 * Manifest не меняется между запросами: гонять `Object.values()` и линейный
 * `filter` на каждый спек (root, error, template, layouts) незачем. Индекс
 * строится один раз при создании обработчика, а результаты поиска по спекам
 * кэшируются.
 */
export interface ClientManifestIndex {
    /** Все записи в порядке manifest. */
    readonly entries: readonly ClientManifestEntry[]
    /** Entry-чанки клиента. */
    readonly entryEntries: readonly ClientManifestEntry[]
    /** Запись по ключу manifest (для обхода `imports`). */
    readonly byKey: ReadonlyMap<string, ClientManifestEntry>
    /** Записи по точному `src` (для preload модулей слайсов). */
    readonly bySrc: ReadonlyMap<string, readonly ClientManifestEntry[]>
    /**
     * Записи manifest для модуля (`<file>` без экспорта).
     *
     * `src` в manifest — путь от корня Vite без ведущего `/`, поэтому сравниваем
     * по границе расширения (`View` не должен цеплять `ViewFoo.tsx`).
     *
     * @param rel путь модуля от `clientDir` (с расширением или без).
     * @returns записи manifest в порядке manifest.
     */
    forSpec(rel: string): readonly ClientManifestEntry[]
}

/**
 * Строит индекс manifest.
 *
 * @param manifest Vite client manifest.
 * @param options корень проекта и `clientDir`.
 * @returns индекс с кэшем поиска по спекам.
 */
export function createClientManifestIndex(
    manifest: Record<string, ClientManifestEntry>,
    options: ClientManifestIndexOptions,
): ClientManifestIndex {
    const entries = Object.values(manifest)
    const entryEntries = entries.filter((entry) => entry.isEntry)

    const byKey = new Map<string, ClientManifestEntry>()
    const bySrc = new Map<string, ClientManifestEntry[]>()
    for (const [key, entry] of Object.entries(manifest)) {
        byKey.set(key, entry)
        if (entry.src === undefined) continue
        const bucket = bySrc.get(entry.src)
        if (bucket) bucket.push(entry)
        else bySrc.set(entry.src, [entry])
    }

    const specCache = new Map<string, readonly ClientManifestEntry[]>()

    return {
        entries,
        entryEntries,
        byKey,
        bySrc,
        forSpec(rel) {
            const base = resolveVitePath(options.projectDir, path.resolve(options.clientDir, rel)).replace(/^\//, '')

            const cached = specCache.get(base)
            if (cached) return cached

            const found = entries.filter(
                (entry) => entry.src !== undefined && (entry.src === base || entry.src.startsWith(base + '.')),
            )
            specCache.set(base, found)
            return found
        },
    }
}
