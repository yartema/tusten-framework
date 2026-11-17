import path from 'node:path'
import type { ResolvedTustenConfig, TustenRoute } from '../../../types'
import { collectDirectCssImports } from './dev-css'
import { createClientManifestIndex, type ClientManifestEntry } from './manifest'
import { resolveVitePath } from './vite-path'

/** Опции создания резолвера ассетов. */
export interface AssetResolverOptions {
    /** Dev-режим: CSS собирается обходом исходников, manifest не нужен. */
    isDev: boolean
    /** Корень проекта. */
    projectDir: string
    /** Каталог клиентского кода. */
    clientDir: string
    /** Нормализованный конфиг. */
    config: ResolvedTustenConfig
    /** Vite client manifest (prod). */
    clientManifest?: Record<string, ClientManifestEntry> | null
    /** Префикс публичных ассетов (по умолчанию `/`). */
    clientOutPublicPrefix?: string
    /** URL entry-скрипта клиента. */
    entryScriptSrc: string
}

/** Общие параметры страницы для ассетов. */
export interface PageAssetsOptions {
    /** Маршрут; `null` — 404/SPA-шелл без маршрута. */
    route: TustenRoute | null
    /** Цепочка layout-спек маршрута (root → leaf). */
    layoutChain?: readonly string[]
}

/** Опции сборки `<link rel="stylesheet">`. */
export interface CssLinksOptions extends PageAssetsOptions {
    /** `spa` — все CSS (404/SPA-шелл), `ssr` — только CSS страницы. */
    mode: 'ssr' | 'spa'
}

/** Опции сборки `<link rel="modulepreload">`. */
export interface ModulePreloadsOptions extends PageAssetsOptions {
    /** Vite-пути модулей слайсов страницы (`/client/...`). */
    sliceModulePaths?: readonly string[]
}

/**
 * Резолвер ассетов для `<head>`.
 */
export interface AssetResolver {
    /**
     * Собирает `<link rel="stylesheet">`.
     *
     * @param options режим и маршрут.
     * @returns HTML-строка.
     */
    cssLinks(options: CssLinksOptions): string
    /**
     * Собирает `<link rel="modulepreload">` (только prod).
     *
     * @param options маршрут и модули слайсов страницы.
     * @returns HTML-строка (пустая в dev и без manifest).
     */
    modulePreloads(options: ModulePreloadsOptions): string
}

/**
 * Путь модуля из спеки `<file>:<export>`.
 *
 * @param spec спека.
 * @returns путь от `clientDir` без `./`.
 */
function fileOfSpec(spec: string): string {
    return spec.split(':')[0].replace(/^\.\//, '')
}

/**
 * Создаёт резолвер ассетов.
 *
 * Индекс manifest и глобальные CSS считаются один раз: от запроса зависят
 * только маршрут и набор слайсов.
 *
 * @param options конфиг, manifest и префикс.
 * @returns резолвер CSS/preload.
 */
export function createAssetResolver(options: AssetResolverOptions): AssetResolver {
    const { isDev, projectDir, clientDir, config, clientManifest, entryScriptSrc } = options
    const publicPrefix = options.clientOutPublicPrefix ?? '/'

    const index = !isDev && clientManifest ? createClientManifestIndex(clientManifest, { projectDir, clientDir }) : null

    const devGlobalCss = isDev
        ? config.client.css.map((rel) => resolveVitePath(projectDir, path.resolve(clientDir, rel)))
        : []

    /**
     * Записи manifest для шаблона и цепочки layout маршрута.
     *
     * @param route маршрут.
     * @param layoutChain цепочка layout-спек (root → leaf).
     * @returns записи manifest (шаблон, затем layouts).
     */
    const routeEntries = (
        route: TustenRoute | null,
        layoutChain: readonly string[] | undefined,
    ): readonly ClientManifestEntry[] => {
        if (!index || !route) return []

        const found: ClientManifestEntry[] = []
        found.push(...index.forSpec(route.contentConfig.workspaceConfig.template.split(':')[0]))
        for (const spec of layoutChain ?? []) found.push(...index.forSpec(fileOfSpec(spec)))
        return found
    }

    /**
     * CSS страницы в prod.
     *
     * @param mode режим.
     * @param route маршрут.
     * @param layoutChain цепочка layout-спек.
     * @returns HTML-строка.
     */
    const cssLinksProd = (
        mode: 'ssr' | 'spa',
        route: TustenRoute | null,
        layoutChain: readonly string[] | undefined,
    ): string => {
        if (!index) return ''

        const hrefs: string[] = []
        const add = (files: readonly string[] | undefined): void => {
            if (!files) return
            for (const file of files) {
                const href = publicPrefix + file
                if (!hrefs.includes(href)) hrefs.push(href)
            }
        }

        // CSS общих чанков лежит не в `entry.css` самого шаблона/layout, а в
        // чанках из `imports`: без обхода они не попадают в `<head>` (FOUC).
        const seen = new Set<string>()
        const addWithImports = (entry: ClientManifestEntry | undefined): void => {
            if (!entry || seen.has(entry.file)) return
            seen.add(entry.file)
            add(entry.css)
            for (const key of entry.imports ?? []) addWithImports(index.byKey.get(key))
        }

        for (const entry of index.entryEntries) add(entry.css)

        // Root controller статически импортируется entry, но его CSS может оказаться
        // в отдельной записи manifest — добавляем явно.
        const rootSpec = config.client.root.component
        if (rootSpec) for (const entry of index.forSpec(fileOfSpec(rootSpec))) addWithImports(entry)

        if (mode === 'spa') {
            for (const entry of index.entries) add(entry.css)
        } else {
            for (const entry of routeEntries(route, layoutChain)) addWithImports(entry)
        }

        return hrefs.map((href) => `<link rel="stylesheet" href="${href}">`).join('')
    }

    /**
     * CSS страницы в dev: обход исходников от шаблона, layouts и root controller.
     *
     * @param route маршрут.
     * @param layoutChain цепочка layout-спек.
     * @returns HTML-строка.
     */
    const cssLinksDev = (route: TustenRoute | null, layoutChain: readonly string[] | undefined): string => {
        const hrefs = [...devGlobalCss]

        // Root controller рендерится на всех страницах (включая 404), поэтому его
        // CSS нужен даже когда `route` ещё неизвестен.
        const directFiles: string[] = []
        const rootSpec = config.client.root.component
        if (rootSpec) directFiles.push(path.resolve(clientDir, fileOfSpec(rootSpec)))

        if (route) {
            directFiles.push(path.resolve(clientDir, route.contentConfig.workspaceConfig.template.split(':')[0]))
            for (const spec of layoutChain ?? []) directFiles.push(path.resolve(clientDir, fileOfSpec(spec)))
        }

        for (const cssPath of collectDirectCssImports(directFiles, projectDir)) {
            if (!hrefs.includes(cssPath)) hrefs.push(cssPath)
        }
        return hrefs.map((href) => `<link rel="stylesheet" href="${href}">`).join('')
    }

    /**
     * Preload entry и чанков страницы в prod.
     *
     * @param route маршрут.
     * @param layoutChain цепочка layout-спек.
     * @param sliceModulePaths Vite-пути модулей слайсов.
     * @returns HTML-строка.
     */
    const modulePreloadsProd = (
        route: TustenRoute | null,
        layoutChain: readonly string[] | undefined,
        sliceModulePaths: readonly string[],
    ): string => {
        if (!index) return ''

        const hrefs: string[] = [entryScriptSrc]
        const seen = new Set<string>()

        const visit = (entry: ClientManifestEntry | undefined): void => {
            if (!entry || seen.has(entry.file) || entry.isEntry) return
            seen.add(entry.file)
            const href = publicPrefix + entry.file
            if (!hrefs.includes(href)) hrefs.push(href)
            for (const key of entry.imports ?? []) visit(index.byKey.get(key))
        }

        // Статические зависимости самого entry (runtime-чанк): без них `client.js`
        // упирается в ещё один запрос.
        for (const entry of index.entryEntries) {
            for (const key of entry.imports ?? []) visit(index.byKey.get(key))
        }
        for (const entry of routeEntries(route, layoutChain)) visit(entry)

        // Классы слайсов из `__ROOT_STATE_STR__`: иначе они качаются уже после
        // выполнения `client.js` — ещё один RTT перед `hydrateRoot`.
        for (const modulePath of sliceModulePaths) {
            const src = modulePath.replace(/^\//, '')
            for (const entry of index.bySrc.get(src) ?? []) visit(entry)
        }

        // Кастомный Error-компонент грузится до гидратации (client-entry).
        const errorSpec = config.client.components.error
        if (errorSpec) for (const entry of index.forSpec(fileOfSpec(errorSpec))) visit(entry)

        // Root controller нужен до первого рендера/гидрации.
        const rootSpec = config.client.root.component
        if (rootSpec) for (const entry of index.forSpec(fileOfSpec(rootSpec))) visit(entry)

        return hrefs.map((href) => `<link rel="modulepreload" href="${href}">`).join('')
    }

    return {
        cssLinks({ mode, route, layoutChain }) {
            if (isDev) return cssLinksDev(route, layoutChain)
            return cssLinksProd(mode, route, layoutChain)
        },

        modulePreloads({ route, layoutChain, sliceModulePaths = [] }) {
            if (isDev) return ''
            return modulePreloadsProd(route, layoutChain, sliceModulePaths)
        },
    }
}
