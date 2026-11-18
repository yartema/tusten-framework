import path from 'node:path'
import fs from 'node:fs'
import type { Plugin, ViteDevServer } from 'vite'
import type {
    CompiledRoute,
    FactoryMap,
    MiddlewareDef,
    TustenClientRoute,
    ResolvedRootElement,
    ResolvedTustenConfig,
    RouteTree,
} from '../types'
import { collectParentIds, toClientRoute } from '../core/client-route'
import { toVitePath } from '../utils/fs'
import { scanI18n } from '../core/scanner'
import {
    I18N_DICT_PREFIX,
    I18N_USER_PREFIX,
    I18N_VIRTUAL_PREFIX,
    generateI18nDictModule,
    generateI18nModule,
    parseDictionary,
} from './i18n'

/** Опции Vite-плагина tusten. */
export interface TustenVitePluginOptions {
    projectDir: string
    clientDir: string
    config: ResolvedTustenConfig
    routeTree: RouteTree
    /** Спеки factory-модулей (`dataFactoryName`). */
    factoryModules?: string[]
    /** Глобальный реестр фабрик (`*.loader.ts`). */
    globalFactories?: FactoryMap
    /** Vite-пути до глобальных CSS (`config.css`). */
    cssFiles?: string[]
}

const VIRTUAL_ROUTES = 'virtual:tusten/routes'
const RESOLVED_ROUTES = '\0' + VIRTUAL_ROUTES
const VIRTUAL_ENTRY = 'virtual:tusten/client-entry'
const RESOLVED_ENTRY = '\0' + VIRTUAL_ENTRY
const VIRTUAL_SSR_ENTRY = 'virtual:tusten/ssr-entry'
const RESOLVED_SSR_ENTRY = '\0' + VIRTUAL_SSR_ENTRY

/**
 * Vite-плагин tusten.
 *
 * @param options опции.
 * @returns Vite-плагин.
 */
export function tustenPlugin(options: TustenVitePluginOptions): Plugin {
    const {
        projectDir,
        clientDir,
        config,
        routeTree,
        factoryModules = [],
        globalFactories = {},
        cssFiles = [],
    } = options

    /**
     * Резолвит спеку клиентского модуля в Vite-путь.
     *
     * @param spec спека.
     * @returns Vite-путь.
     */
    function resolveSpec(spec: string): string {
        const [rawFile] = spec.split(':')
        const file = rawFile.replace(/^\.\//, '')
        const abs = path.resolve(clientDir, file)
        let finalAbs = abs
        for (const ext of ['.tsx', '.ts', '.jsx', '.js', '']) {
            if (fs.existsSync(abs + ext)) {
                finalAbs = abs + ext
                break
            }
        }
        return toVitePath(projectDir, finalAbs)
    }

    /**
     * Резолвит путь middleware в Vite-путь.
     *
     * @param handler спека.
     * @returns Vite-путь.
     */
    function resolveMiddlewarePath(handler: string): string {
        const [rawFile] = handler.split(':')
        const file = rawFile.replace(/^\.\//, '')
        const abs = path.resolve(projectDir, file)
        let finalAbs = abs
        for (const ext of ['.ts', '.tsx', '.js', '.jsx', '']) {
            if (fs.existsSync(abs + ext)) {
                finalAbs = abs + ext
                break
            }
        }
        return toVitePath(projectDir, finalAbs)
    }

    /**
     * Определяет, серверный ли middleware.
     *
     * @param def middleware.
     * @returns `true` если не должен попадать в client bundle.
     */
    function isServerOnly(def: MiddlewareDef): boolean {
        if (def.side === 'server') return true
        if (def.side === 'client' || def.side === 'both') return false
        return def.handler.startsWith('server/')
    }

    // ---- 1. Данные маршрутов ----
    const routesData = Array.from(routeTree.byId.entries()).map(([id, route]) => {
        const urlPath = routeTree.paths.get(id)!
        const templatePath = resolveSpec(route.contentConfig.workspaceConfig.template)
        const templateExport = route.contentConfig.workspaceConfig.template.split(':')[1] ?? 'default'
        // Публичная проекция: та же функция используется SSR-handler'ом,
        // поэтому root controller видит одинаковую форму на сервере и клиенте.
        const clientRoute = toClientRoute(route, {
            path: urlPath,
            parentIds: collectParentIds(id, routeTree.byId),
            layoutChain: routeTree.layoutChains.get(id) ?? [],
        })

        return {
            ...clientRoute,
            templatePath,
            templateExport,
        }
    })

    // Root controller — обычный пользовательский компонент в client bundle,
    // но грузится один раз и оборачивает все состояния.
    const rootSpec = config.client.root.component
    const rootMeta = rootSpec ? { path: resolveSpec(rootSpec), export: rootSpec.split(':')[1] ?? 'default' } : null

    // ---- 3. specToPath (client bundle) ----
    const specToPath = new Map<string, string>()

    const addSpec = (spec: string): void => {
        const file = spec.split(':')[0].replace(/^\.\//, '')
        if (specToPath.has(file)) return
        specToPath.set(file, resolveSpec(spec))
    }

    for (const route of routeTree.byId.values()) {
        addSpec(route.contentConfig.workspaceConfig.template)
        for (const layoutSpec of routeTree.layoutChains.get(route.id) ?? []) addSpec(layoutSpec)
        const configLoader = route.contentConfig.prefetchConfig?.configLoader
        if (configLoader) addSpec(configLoader)
    }
    for (const spec of factoryModules) addSpec(spec)
    for (const def of Object.values(globalFactories)) {
        addSpec(def.dataFactoryName)
    }

    // getMetaCallback — должен быть доступен в клиентском bundle
    for (const route of routeTree.byId.values()) {
        if (route.metaConfig?.getMetaCallback) {
            addSpec(route.metaConfig.getMetaCallback)
        }
    }

    // Компоненты (error / loading / notFound) — в client bundle.
    for (const key of ['error', 'loading', 'notFound'] as const) {
        const spec = config.client.components[key]
        if (spec) addSpec(spec)
    }
    if (rootSpec) addSpec(rootSpec)

    // ---- 4. allSsrSpecs (SSR bundle) ----
    const allSsrSpecs = new Set<string>()
    for (const route of routeTree.byId.values()) {
        allSsrSpecs.add(route.contentConfig.workspaceConfig.template)
        for (const layoutSpec of routeTree.layoutChains.get(route.id) ?? []) allSsrSpecs.add(layoutSpec)
        const configLoader = route.contentConfig.prefetchConfig?.configLoader
        if (configLoader) allSsrSpecs.add(configLoader)
    }

    for (const spec of factoryModules) allSsrSpecs.add(spec)

    for (const def of Object.values(globalFactories)) {
        allSsrSpecs.add(def.dataFactoryName)
    }

    // getMetaCallback (SSR)
    for (const route of routeTree.byId.values()) {
        if (route.metaConfig?.getMetaCallback) {
            allSsrSpecs.add(route.metaConfig.getMetaCallback)
        }
    }

    // Компоненты (error / loading / notFound) — в SSR bundle.
    for (const key of ['error', 'loading', 'notFound'] as const) {
        const spec = config.client.components[key]
        if (spec) allSsrSpecs.add(spec)
    }
    if (rootSpec) allSsrSpecs.add(rootSpec)

    const ssrModulePaths = new Map<string, string>()
    for (const spec of allSsrSpecs) {
        ssrModulePaths.set(spec, resolveSpec(spec))
    }

    // ---- 5. Middleware-пути (client-safe) ----
    const middlewareHandlers = new Set<string>()
    for (const mw of config.middleware ?? []) {
        if (isServerOnly(mw)) continue
        middlewareHandlers.add(mw.handler.split(':')[0])
    }
    for (const route of routeTree.byId.values()) {
        for (const mw of route.middleware ?? []) {
            if (isServerOnly(mw)) continue
            middlewareHandlers.add(mw.handler.split(':')[0])
        }
    }
    const middlewarePaths = new Map<string, string>()
    for (const handler of middlewareHandlers) {
        middlewarePaths.set(handler, resolveMiddlewarePath(handler))
    }

    // ---- 6. componentsMeta ----
    const componentsMeta: Record<string, { path: string; export: string } | null> = {}
    for (const key of ['error', 'loading', 'notFound'] as const) {
        const spec = config.client.components[key]
        if (spec) {
            const [, exportName = 'default'] = spec.split(':')
            componentsMeta[key] = {
                path: resolveSpec(spec),
                export: exportName,
            }
        } else {
            componentsMeta[key] = null
        }
    }

    // Реестр словарей снимаем один раз на старте: новые словари подхватятся
    // после перезапуска dev-сервера (так же, как маршруты из router.ts).
    const i18nRegistry = scanI18n(clientDir, config.i18n)
    // Нормализованные пути для сравнения в handleHotUpdate (watcher отдаёт forward-slash).
    const i18nDictFiles = new Set(
        Object.values(i18nRegistry)
            .flatMap((dicts) => Object.values(dicts))
            .map(toPosix),
    )

    return {
        name: 'tusten',
        resolveId(id) {
            // Префикс `\0` — соглашение Vite для virtual-модулей: такой id не должен
            // резолвиться на диск, поэтому резолвим сразу в `\0`-вариант.
            if (id === VIRTUAL_ROUTES) return RESOLVED_ROUTES
            if (id === VIRTUAL_ENTRY) return RESOLVED_ENTRY
            if (id === VIRTUAL_SSR_ENTRY) return RESOLVED_SSR_ENTRY
            // Пользовательский импорт — только `i18n!<Module>`. `i18n:` без `!` сюда не попадает:
            // внутренний `i18n:` доступен лишь через `\0`-id, который генерирует сам плагин.
            if (id.startsWith(I18N_USER_PREFIX)) return '\0' + I18N_VIRTUAL_PREFIX + id.slice(I18N_USER_PREFIX.length)
            // `i18n-dict:` приходит только из сгенерированного кода модуля (динамический import).
            if (id.startsWith(I18N_DICT_PREFIX)) return '\0' + id
            return null
        },
        async load(id) {
            if (id === RESOLVED_ROUTES) {
                return generateRoutesModule(
                    routesData,
                    routeTree.compiled,
                    specToPath,
                    middlewarePaths,
                    globalFactories,
                    componentsMeta,
                    rootMeta,
                    config.client.root.container,
                )
            }
            if (id === RESOLVED_ENTRY) return generateEntryModule(cssFiles)
            if (id === RESOLVED_SSR_ENTRY) {
                return generateSsrEntryModule(ssrModulePaths)
            }
            if (id.startsWith('\0' + I18N_VIRTUAL_PREFIX)) {
                const moduleName = id.slice(('\0' + I18N_VIRTUAL_PREFIX).length)
                return generateI18nModule(moduleName, i18nRegistry[moduleName] ?? {})
            }
            if (id.startsWith('\0' + I18N_DICT_PREFIX)) {
                // id вида `<Module>:<locale>`; locale не содержит `:` (валидируется в config.ts),
                // поэтому делим по последнему двоеточию.
                const rest = id.slice(('\0' + I18N_DICT_PREFIX).length)
                const sep = rest.lastIndexOf(':')
                const file = i18nRegistry[rest.slice(0, sep)]?.[rest.slice(sep + 1)]
                if (!file) return generateI18nDictModule({})
                this.addWatchFile(file)
                const source = fs.readFileSync(file, 'utf8')
                return generateI18nDictModule(parseDictionary(source, file))
            }
            return null
        },
        handleHotUpdate({ file, server }) {
            if (!i18nDictFiles.has(toPosix(file))) return
            // Словарь подгружается динамическим import() из virtual-модуля, который не является
            // HMR-границей. Проще и надёжнее сбросить кэш i18n-модулей и перезагрузить страницу.
            invalidateI18nModules(server)
            server.ws.send({ type: 'full-reload' })
            return []
        },
    }
}

/**
 * Приводит путь к forward-slash: Vite и watcher используют такой формат на всех ОС.
 *
 * @param p путь.
 * @returns путь с `/`.
 */
function toPosix(p: string): string {
    return p.replace(/\\/g, '/')
}

/**
 * Сбрасывает трансформ-кэш всех i18n virtual-модулей во всех окружениях
 * (клиент и SSR), чтобы следующий запрос перечитал JSON с диска.
 *
 * @param server dev-сервер Vite.
 */
function invalidateI18nModules(server: ViteDevServer): void {
    for (const env of Object.values(server.environments)) {
        for (const mod of env.moduleGraph.idToModuleMap.values()) {
            if (mod.id?.startsWith('\0' + I18N_VIRTUAL_PREFIX) || mod.id?.startsWith('\0' + I18N_DICT_PREFIX)) {
                env.moduleGraph.invalidateModule(mod)
            }
        }
    }
}

/** Запись маршрута для генерации: публичная проекция + внутренние поля загрузчика. */
interface RouteEntry extends TustenClientRoute {
    templatePath: string
    templateExport: string
}

/**
 * Генерирует `virtual:tusten/routes`.
 *
 * @param routesData маршруты.
 * @param compiledRoutes скомпилированные паттерны.
 * @param specToPath spec → Vite-путь.
 * @param middlewarePaths handler → Vite-путь.
 * @param globalFactories глобальный реестр.
 * @param componentsMeta метаданные `error` / `loading` / `notFound`.
 * @param rootMeta метаданные root controller (`null`, если не задан).
 * @param rootElement настройки контейнера приложения (тег, id, атрибуты).
 * @returns код модуля.
 */
function generateRoutesModule(
    routesData: RouteEntry[],
    compiledRoutes: CompiledRoute[],
    specToPath: Map<string, string>,
    middlewarePaths: Map<string, string>,
    globalFactories: FactoryMap,
    componentsMeta: Record<string, { path: string; export: string } | null>,
    rootMeta: { path: string; export: string } | null,
    rootElement: ResolvedRootElement,
): string {
    const uniquePaths = new Set<string>()
    for (const p of specToPath.values()) uniquePaths.add(p)
    for (const p of middlewarePaths.values()) uniquePaths.add(p)

    const moduleLoaders = Array.from(uniquePaths)
        .map((p) => `  ${JSON.stringify(p)}: () => import(${JSON.stringify(p)})`)
        .join(',\n')

    const specToPathObj: Record<string, string> = {}
    for (const [spec, p] of specToPath) specToPathObj[spec] = p

    const middlewareLoaders = Array.from(middlewarePaths)
        .map(([h, p]) => `  ${JSON.stringify(h)}: () => import(${JSON.stringify(p)})`)
        .join(',\n')

    return `
const moduleLoaders = {
${moduleLoaders}
}

const specToPath = ${JSON.stringify(specToPathObj, null, 2)}

const middlewareLoaders = {
${middlewareLoaders}
}

export const components = ${JSON.stringify(componentsMeta, null, 2)}

export const root = ${JSON.stringify(rootMeta, null, 2)}

export const rootElement = ${JSON.stringify(rootElement, null, 2)}

export const routes = ${JSON.stringify(routesData, null, 2)}

export const globalFactories = ${JSON.stringify(globalFactories, null, 2)}

export const compiled = ${JSON.stringify(compiledRoutes, null, 2)}

/**
 * Находит маршрут по URL с матчингом параметров.
 *
 * @param {string} url путь.
 * @returns {{routeId: string, params: object} | null}
 */
export function matchRoute(url) {
  for (const r of compiled) {
    const m = new RegExp(r.regexSource).exec(url)
    if (m) {
      const params = {}
      for (let i = 0; i < r.paramNames.length; i++) {
        params[r.paramNames[i]] = decodeURIComponent(m[i + 1])
      }
      return { routeId: r.id, params }
    }
  }
  return null
}

/**
 * Находит запись маршрута по id.
 *
 * @param {string} id id.
 * @returns {object | null}
 */
export function findRouteById(id) {
  for (const r of routes) {
    if (r.id === id) return r
  }
  return null
}

export function findRouteByPath(path) {
  for (const r of routes) {
    if (r.path === path) return r
  }
  return null
}

export async function loadRouteModules(route) {
  // Шаблон и все layout грузим одним залпом: каждый последовательный
  // await — это отдельный RTT (на 3G сотни мс).
  const layoutSpecs = route.layoutChain || []
  const [templateMod, ...layoutValues] = await Promise.all([
    moduleLoaders[route.templatePath](),
    ...layoutSpecs.map((spec) => resolveModule(spec)),
  ])

  const Template = templateMod[route.templateExport]
  if (!Template) {
    throw new Error('Export "' + route.templateExport + '" not found in ' + route.templatePath)
  }

  const Layouts = layoutValues.filter((Layout) => typeof Layout === 'function')

  return { Template, Layouts }
}

/**
 * Резолвит спеку в значение (default или именованный экспорт).
 *
 * @param {string} spec спека.
 * @returns {Promise<unknown>}
 */
export async function resolveModule(spec) {
  const [file, exportName = 'default'] = spec.split(':')
  const p = specToPath[file.replace(/^\\.\\//, '')]
  if (!p) {
    throw new Error('Module not found in client bundle: ' + file)
  }
  const mod = await moduleLoaders[p]()
  const value = mod[exportName]
  if (value === undefined) {
    throw new Error('Export "' + exportName + '" not found in ' + p)
  }
  return value
}

/**
 * Резолвит компонент по componentsMeta.
 *
 * @param {{path: string, export: string} | null} info метаданные.
 * @returns {Promise<Function | null>}
 */
export async function resolveComponent(info) {
  if (!info) return null
  const loader = moduleLoaders[info.path]
  if (!loader) throw new Error('Component not in bundle: ' + info.path)
  const mod = await loader()
  return mod[info.export] || null
}

/**
 * Загружает прикладной класс слайса.
 *
 * @param {string} modulePath Vite-путь.
 * @param {string} exportName имя экспорта.
 * @returns {Promise<new () => any>}
 */
export async function loadSliceClass(modulePath, exportName) {
  const loader = moduleLoaders[modulePath]
  if (!loader) {
    throw new Error('Module not in client bundle: ' + modulePath)
  }
  const mod = await loader()
  const impl = mod[exportName]
  if (!impl || typeof impl.slice !== 'function') {
    throw new Error('Invalid factory impl at ' + modulePath + ':' + exportName)
  }
  return impl.slice
}

/**
 * Загружает модуль middleware.
 *
 * @param {string} handler ключ.
 * @returns {Promise<Function>}
 */
export async function loadMiddlewareModule(handler) {
  const loader = middlewareLoaders[handler]
  if (!loader) {
    throw new Error('Middleware not in client bundle: ' + handler)
  }
  const mod = await loader()
  const fn = mod.client || mod.default
  if (typeof fn !== 'function') {
    throw new Error('Middleware "' + handler + '" is not a function')
  }
  return fn
}
`
}

/**
 * Генерирует `virtual:tusten/client-entry`.
 *
 * @param cssFiles Vite-пути до глобальных CSS (`config.css`).
 * @returns код модуля.
 */
function generateEntryModule(cssFiles: string[] = []): string {
    const cssImport = cssFiles.map((file) => `import '${file}'`).join('\n')

    return `
${cssImport}
import { createElement, Fragment, startTransition, useEffect } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import {
  resolveMeta,
  Slice,
  SliceRegistry,
  Service,
  runGlobalPrefetch,
  runPagePrefetch,
  pickClientRoute,
  buildNavigation,
  setNavigationCatalog,
} from '@tusten/core'
import {
  RootProvider,
  RootErrorBoundary,
  RootLoading,
  RootNotFound,
  renderLayoutChain,
  devalueParse,
  initI18n,
  loadRegisteredDictionaries,
  setNavigationPending,
} from '@tusten/core/client'
import {
  findRouteById,
  matchRoute,
  loadRouteModules,
  loadSliceClass,
  loadMiddlewareModule,
  resolveModule,
  resolveComponent,
  routes,
  globalFactories,
  components,
  root as rootMeta,
  rootElement,
} from '${VIRTUAL_ROUTES}'

// Root controller не задан — оболочка прозрачная.
function RootPassthrough(props) {
  return props.children
}

// Контейнер приложения: data-tusten-root — служебный маркер, поэтому смена
// id/тега в конфиге не ломает клиент. Старый #root оставлен для совместимости.
function findRootEl() {
  return (
    document.querySelector('[data-tusten-root]') ||
    (rootElement && rootElement.id ? document.getElementById(rootElement.id) : null) ||
    document.getElementById('root')
  )
}

// Устанавливается в dev-блоке ниже. В production остается no-op: сам оверлей
// импортируется динамически внутри \`if (import.meta.env.DEV)\` и в бандл не попадает.
let reportDevError = () => {}

async function hydrateSlicesFromState(stateObj, registry) {
  if (!stateObj || !stateObj.slices) return
  const entries = Object.entries(stateObj.slices)
  await Promise.all(entries.map(async ([name, info]) => {
    let slice
    try {
      const SliceClass = await loadSliceClass(info.modulePath, info.exportName)
      slice = new SliceClass()
    } catch (err) {
      console.warn('[tusten] slice class not loaded for "' + name + '":', err)
      slice = new Slice()
    }
    slice.hydrate(info.state, info.config)
    if (info.scope === 'global') registry.setGlobal(name, slice)
    else registry.setPage(name, slice)
  }))
}

/**
 * Строит NavTarget: pathname для матчинга, query отдельно.
 *
 * @param {string} path полный путь (с query, если есть).
 * @returns {object} NavTarget.
 */
function buildNavTarget(path) {
  const url = new URL(path, window.location.origin)
  const matched = matchRoute(url.pathname)
  const route = matched ? findRouteById(matched.routeId) : null
  const params = matched ? matched.params : {}
  const query = {}
  url.searchParams.forEach((v, k) => { query[k] = v })
  return { path, pathname: url.pathname, params, query, route }
}

async function runClientMiddlewareChain(chain, to, from) {
  for (const def of chain) {
    const fn = await loadMiddlewareModule(def.handler)
    const result = await fn(def.params || {}, { to, from })
    if (result && typeof result === 'object' && 'redirect' in result) {
      return result
    }
  }
  return undefined
}

const globalClientMiddleware = (window.__ROOT_MIDDLEWARE__ || []).filter(
  (m) => !m.side || m.side === 'client' || m.side === 'both',
)

function isServerOnly(def) {
  if (def.side === 'server') return true
  if (def.side === 'client' || def.side === 'both') return false
  return def.handler.startsWith('server/')
}

function fullMiddlewareChain(route) {
  return [
    ...globalClientMiddleware,
    ...((route && route.middleware) || []),
  ].filter((def) => !isServerOnly(def))
}

/**
 * Release-функции слайсов, вытесненных adoptPage/adoptGlobal.
 *
 * Складываем их сюда, а не уничтожаем сразу: новый рендер идёт в
 * startTransition и коммитится отложенно — старая страница ещё смонтирована
 * и до commit должна видеть живые слайсы. У каждой записи свой navId: при
 * commit более старого перехода нельзя уничтожать слайсы, вытесненные более
 * новым (он ещё может быть смонтирован до своего commit).
 */
const pendingReleases = []

/**
 * Уничтожает вытесненные слайсы переходов не новее commit'нутого.
 *
 * @param {number} navId номер закоммиченного перехода.
 */
function flushPendingReleases(navId) {
  for (let i = 0; i < pendingReleases.length;) {
    const item = pendingReleases[i]
    if (item.navId > navId) {
      i++
      continue
    }
    pendingReleases.splice(i, 1)
    try {
      item.release()
    } catch (err) {
      console.error('[tusten] slice release failed:', err)
    }
  }
}

/**
 * Маркер commit нового дерева.
 *
 * useEffect выполняется после монтирования нового дерева. Компонент получает
 * новый key на каждую навигацию, поэтому effect срабатывает ровно один раз
 * на переход (а не на каждый ре-рендер).
 *
 * @param {object} props пропсы.
 * @param {Function} props.onCommit колбэк после commit.
 * @returns {null} ничего не рендерит.
 */
function CommitMarker(props) {
  useEffect(() => {
    props.onCommit()
    // Пустые зависимости осознанно: маркер перемонтируется по key.
  }, [])
  return null
}

/**
 * Клиентский prefetch: выполняет loadData через TustenService.
 *
 * @param {object} route маршрут.
 * @param {SliceRegistry} registry реестр слайсов.
 * @param {object} navTarget навигационный target.
 * @param {boolean} skipExisting пропустить загруженные глобальные.
 * @param {SliceRegistry} [pageRegistry] куда класть page-слайсы (по умолчанию — registry).
 */
async function clientPrefetch(route, registry, navTarget, skipExisting, pageRegistry) {
  const ctx = {
    route,
    globalRegistry: globalFactories,
    loadModule: resolveModule,
    registry,
    router: {
      id: route.id,
      path: navTarget.pathname,
      params: navTarget.params,
      query: navTarget.query,
      request: null,
    },
  }
  const globalStates = await runGlobalPrefetch(ctx, { skipExisting })
  await runPagePrefetch(
    pageRegistry ? { ...ctx, registry: pageRegistry } : ctx,
    globalStates,
  )
}

/**
 * Перезапускает только page-лоадеры (reload({ global: false })).
 *
 * Глобальные состояния не перезагружаем, но они нужны runPagePrefetch
 * как зависимости — берём их из текущего реестра.
 */
async function clientPrefetchPage(route, registry, pageRegistry, navTarget) {
  const ctx = {
    route,
    globalRegistry: globalFactories,
    loadModule: resolveModule,
    registry: pageRegistry,
    router: {
      id: route.id,
      path: navTarget.pathname,
      params: navTarget.params,
      query: navTarget.query,
      request: null,
    },
  }
  const globalStates = new Map()
  for (const name of Object.keys(globalFactories)) {
    const slice = registry.get(name)
    if (slice) globalStates.set(name, slice.state)
  }
  await runPagePrefetch(ctx, globalStates)
}

async function main() {
  // Dev-оверлей должен стоять до первого рендера: ошибки гидрации и prefetch
  // случаются раньше, чем пользователь успел бы что-то увидеть.
  if (import.meta.env.DEV) {
    try {
      const overlay = await import('@tusten/core/client/dev-overlay')
      overlay.installDevOverlay()
      reportDevError = overlay.showErrorOverlay
    } catch (err) {
      console.warn('[tusten] dev overlay failed to load:', err)
    }
  }

  // Каталог навигации статичен: собираем один раз до гидрации, чтобы SSR,
  // клиент и reload видели одинаковый список. Не в \`__ROOT_STATE_STR__\` —
  // сериализовать его на каждый запрос незачем.
  setNavigationCatalog(buildNavigation(routes))

  const rootEl = findRootEl()
  if (!rootEl) {
    throw new Error(
      'tusten: root element not found (expected <' +
        ((rootElement && rootElement.tag) || 'div') +
        ' data-tusten-root>)',
    )
  }

  // Locale и словари из HTML — до импорта модулей маршрута: их createRk-инстансы
  // создаются именно при импорте и сразу берут свой словарь.
  if (window.__ROOT_I18N__) initI18n(window.__ROOT_I18N__)

  const isSsr = window.__ROOT_SSR__ === true

  const initialPath = window.location.pathname
  const initialMatch = matchRoute(initialPath)
  const initialRoute = initialMatch ? findRouteById(initialMatch.routeId) : null

  // Root controller резолвится один раз: его state и контекст должны переживать
  // SPA-навигацию. Не задан в конфиге — прозрачная обёртка.
  const RootControllerComp = (await resolveComponent(rootMeta)) || RootPassthrough

  // 404: SSR уже отрендерил кастомную NotFound через renderToString.
  if (!initialRoute) {
    const NotFoundComp =
      (await resolveComponent(components.notFound)) || RootNotFound
    const notFoundRouter = {
      path: initialPath,
      params: {},
      query: Object.fromEntries(new URLSearchParams(window.location.search)),
      routeId: '__not-found__',
    }
    const nfRegistry = new SliceRegistry()
    const nfTree = createElement(
      RootProvider,
      { sliceRegistry: nfRegistry, router: notFoundRouter, route: null },
      createElement(
        RootControllerComp,
        { route: null, router: notFoundRouter, status: 'not-found' },
        createElement(NotFoundComp),
      ),
    )
    if (isSsr) {
      hydrateRoot(rootEl, nfTree)
    } else {
      createRoot(rootEl).render(nfTree)
    }
    return
  }

  // Независимые чанки стартуют сразу, а не цепочкой: на 3G каждый
  // последовательный await — отдельный RTT. Loading нужен только в SPA:
  // при SSR его чанк не качаем. Ошибка загрузки кастомного Error не должна
  // ронять гидратацию — уходим на дефолтный boundary.
  const errorCompP = resolveComponent(components.error)
    .then((c) => c || undefined)
    .catch((err) => {
      console.warn('[tusten] failed to load custom error component:', err)
      return undefined
    })
  const loadingCompP = isSsr
    ? null
    : resolveComponent(components.loading).then((c) => c || RootLoading)

  const initialParams = initialMatch ? initialMatch.params : {}

  const sliceRegistry = new SliceRegistry()

  let currentRouter = {
    path: initialPath,
    params: initialParams,
    query: Object.fromEntries(new URLSearchParams(window.location.search)),
    routeId: initialRoute.id,
  }

  let rootRef
  let navSeq = 0
  // Key страницы: сохраняется при reload без remount и меняется при навигации
  // и remount-reload. Иначе reload после remount менял бы key обратно и снова
  // перемонтировал страницу.
  let currentPageKey = initialPath

  // Единая точка сборки дерева: provider → root controller → состояние.
  // Root controller не перемонтируется — меняются только props.
  // Параметр commit добавляет маркер, который срабатывает после commit нового
  // дерева (нужен, чтобы уничтожить слайсы старой страницы не раньше времени).
  const renderRoot = (children, router, route, status, error, commit) => {
    const content = commit
      ? createElement(
          Fragment,
          null,
          children,
          createElement(CommitMarker, { key: commit.key, onCommit: commit.onCommit }),
        )
      : children
    return createElement(
      RootProvider,
      { sliceRegistry, router, route },
      createElement(RootControllerComp, { route, router, status, error }, content),
    )
  }

  /**
   * Колбэк commit для перехода: уничтожает вытесненные слайсы и снимает pending.
   *
   * @param {number} navId номер навигации.
   * @returns {object} пропсы маркера.
   */
  const makeCommit = (navId) => ({
    key: 'nav:' + navId,
    onCommit: () => {
      flushPendingReleases(navId)
      // Пока transition рендерился, могла начаться более новая навигация:
      // pending принадлежит ей, снимать его нельзя.
      if (navId === navSeq) setNavigationPending(false)
    },
  })

  // Видимая ошибка вместо молчаливого \`return\`: иначе падение навигации выглядит
  // как «клик не сработал». В dev параллельно поднимается оверлей со стеком.
  const renderErrorPage = async (err, source) => {
    reportDevError(err, source || 'navigation')
    const ErrorComp = await errorCompP
    const message = err && err.message ? err.message : String(err)
    const errorNode = ErrorComp
      ? createElement(ErrorComp, { error: err })
      : createElement(
          'div',
          { style: { padding: '1rem', color: 'crimson' } },
          'Error: ' + message,
        )
    const currentRoute = findRouteById(currentRouter.routeId)
    rootRef.render(
      renderRoot(
        errorNode,
        currentRouter,
        currentRoute ? pickClientRoute(currentRoute) : null,
        'error',
        err,
      ),
    )
  }

  const renderTree = async (route, locationKey) => {
    const [{ Template, Layouts }, ErrorComp] = await Promise.all([
      loadRouteModules(route),
      errorCompP,
    ])
    // Словари после импорта модулей: только тогда известно, какие rk-функции существуют.
    // Уже засеянные из HTML словари сетевых запросов не вызывают.
    await loadRegisteredDictionaries()
    // Ключ по URL: страница перемонтируется при смене пути/параметров,
    // layouts и root controller — нет (их state сохраняется).
    const child = createElement(Template, { key: locationKey })
    const content = createElement(
      RootErrorBoundary,
      { fallback: ErrorComp, resetKey: locationKey },
      renderLayoutChain(child, Layouts),
    )
    return { content, route: pickClientRoute(route) }
  }

  const navigate = async (path, mode) => {
    const to = buildNavTarget(path)
    if (!to.route) {
      window.location[mode === 'replace' ? 'replace' : 'assign'](path)
      return
    }
    const from = buildNavTarget(window.location.pathname + window.location.search)
    // Токен берём до middleware: иначе медленная цепочка первой навигации
    // получила бы номер позже более свежей и перезаписала её результат.
    const navId = ++navSeq
    setNavigationPending(true)

    try {
      const redirect = await runClientMiddlewareChain(
        fullMiddlewareChain(to.route), to, from,
      )
      if (redirect && redirect.redirect) {
        await navigate(redirect.redirect, 'replace')
        return
      }
    } catch (err) {
      console.error('[tusten] client middleware failed:', err)
      reportDevError(err, 'navigation')
      if (navId === navSeq) setNavigationPending(false)
      return
    }

    // Пока шёл middleware, пользователь мог уйти на другую страницу.
    if (navId !== navSeq) return

    // Готовим page-слайсы новой страницы в отдельном реестре: старую
    // страницу убиваем только после успешного prefetch + загрузки шаблона,
    // иначе при ошибке пользователь остался бы на живой странице
    // с мёртвыми слайсами.
    const nextPages = new SliceRegistry()
    let newTree
    let newRoute
    const nextPageKey = to.pathname
    try {
      // Данные и чанки шаблона/layout независимы — грузим параллельно.
      let built
      ;[, built] = await Promise.all([
        clientPrefetch(to.route, sliceRegistry, to, true, nextPages),
        renderTree(to.route, nextPageKey),
      ])
      newTree = built.content
      newRoute = built.route
    } catch (err) {
      nextPages.disposePage()
      // Пока грузились данные, началась другая навигация — её результат
      // важнее, страницу ошибки не показываем.
      if (navId !== navSeq) return
      setNavigationPending(false)
      console.error('[tusten] client prefetch failed:', err)
      await renderErrorPage(err, 'navigation')
      return
    }
    if (navId !== navSeq) {
      nextPages.disposePage()
      return
    }
    // Слайсы старой страницы не уничтожаем сразу — только после commit.
    pendingReleases.push({ navId, release: sliceRegistry.adoptPage(nextPages) })
    currentPageKey = nextPageKey

    if (mode === 'replace') {
      window.history.replaceState({}, '', path)
    } else {
      window.history.pushState({}, '', path)
    }
    document.title = to.route.title || 'tusten'
    const newRouter = {
      path: to.pathname,
      params: to.params,
      query: to.query,
      routeId: to.route.id,
    }
    currentRouter = newRouter

    // startTransition: старый экран остаётся отзывчивым, пока новое дерево
    // не готово. pending снимется маркером после commit (см. makeCommit).
    startTransition(() => {
      rootRef.render(
        renderRoot(newTree, newRouter, newRoute, 'ready', undefined, makeCommit(navId)),
      )
    })

    // Meta (может быть RPC) не блокирует переход: страница уже показана.
    // Только для маршрутов с metaConfig — иначе title из route не затирается
    // дефолтным заголовком. Устаревший ответ (юзер ушёл дальше) игнорируем.
    if (to.route.metaConfig) {
      void resolveMeta(
        to.route,
        { id: to.route.id, path: to.pathname, params: to.params, query: to.query, request: null },
        window.location.href,
        resolveModule,
      )
        .then((meta) => {
          if (navId === navSeq) document.title = meta.title
        })
        .catch((err) => console.debug('[tusten] meta skipped:', err))
    }
  }

  /**
   * Перезапускает лоадеры текущего маршрута, не меняя URL и history.
   *
   * В отличие от navigate(), ошибка не заменяет страницу на components.error:
   * пользователь остаётся на текущей странице, Promise реджектится.
   */
  const reload = async (options) => {
    const opts = options || {}
    const reloadGlobals = opts.global !== false
    const useCache = opts.cache === true
    const remount = opts.remount === true
    const runMiddleware = opts.middleware !== false

    const path = window.location.pathname + window.location.search
    const to = buildNavTarget(path)
    // 404: лоадеров нет, а history трогать нельзя. Полная перезагрузка тоже
    // ничего не изменит — это осознанный no-op.
    if (!to.route) return

    // Токен берём до middleware: побеждает последняя операция, а не та,
    // чья middleware-цепочка завершилась позже.
    const navId = ++navSeq
    setNavigationPending(true)

    if (runMiddleware) {
      try {
        const redirect = await runClientMiddlewareChain(
          fullMiddlewareChain(to.route), to, to,
        )
        if (redirect && redirect.redirect) {
          // Редирект — это уже смена страницы, а не обновление данных.
          await navigate(redirect.redirect, 'replace')
          return
        }
      } catch (err) {
        console.error('[tusten] client middleware failed:', err)
        reportDevError(err, 'reload')
        if (navId === navSeq) setNavigationPending(false)
        throw err
      }
      // Пока шёл middleware, пользователь мог начать навигацию.
      if (navId !== navSeq) return
    }

    // loadData не должен вернуть закэшированные значения: reload — явное
    // действие пользователя «покажи свежие данные».
    if (!useCache) Service.invalidateAll()

    const nextRegistry = new SliceRegistry()
    // Без remount — тот же key, что у смонтированной страницы (state живёт);
    // с remount — новый, чтобы React пересоздал шаблон.
    const nextPageKey = remount
      ? to.pathname + '#reload:' + navId
      : currentPageKey
    let built
    try {
      // Слайсы и чанки независимы — грузим параллельно.
      ;[built] = await Promise.all([
        renderTree(to.route, nextPageKey),
        reloadGlobals
          ? clientPrefetch(to.route, nextRegistry, to, false)
          : clientPrefetchPage(to.route, sliceRegistry, nextRegistry, to),
      ])
    } catch (err) {
      // nextRegistry содержит и global, и page (при global: false — только page):
      // удаляем всё, текущая страница остаётся нетронутой.
      nextRegistry.disposeAll()
      if (navId === navSeq) setNavigationPending(false)
      console.error('[tusten] reload failed:', err)
      reportDevError(err, 'reload')
      throw err
    }
    if (navId !== navSeq) {
      nextRegistry.disposeAll()
      return
    }

    // Атомарная подмена: только после успешной загрузки всех лоадеров.
    // Уничтожение вытесненных слайсов — после commit (startTransition).
    if (reloadGlobals) {
      pendingReleases.push({ navId, release: sliceRegistry.adoptGlobal(nextRegistry) })
    }
    pendingReleases.push({ navId, release: sliceRegistry.adoptPage(nextRegistry) })
    currentPageKey = nextPageKey

    // Тот же key (без remount) → React сохраняет локальный state страницы,
    // но перерисовывает дерево и подписывается на новые слайсы.
    startTransition(() => {
      rootRef.render(
        renderRoot(built.content, currentRouter, built.route, 'ready', undefined, makeCommit(navId)),
      )
    })

    document.title = to.route.title || 'tusten'
    if (to.route.metaConfig) {
      void resolveMeta(
        to.route,
        { id: to.route.id, path: to.pathname, params: to.params, query: to.query, request: null },
        window.location.href,
        resolveModule,
      )
        .then((meta) => {
          if (navId === navSeq) document.title = meta.title
        })
        .catch((err) => console.debug('[tusten] meta skipped:', err))
    }
  }

  window.__rootNavigate = {
    push: (p) => navigate(p, 'push'),
    replace: (p) => navigate(p, 'replace'),
    back: () => window.history.back(),
    reload: (options) => reload(options),
    prefetch: async (p) => {
      const to = buildNavTarget(p)
      if (!to.route) return
      // Временный реестр: реальная работа идёт в TustenService cache.
      // При клике clientPrefetch выполнится снова, но service-вызовы
      // возьмутся из кэша → мгновенно. Сами слайсы-заготовки не нужны.
      const tempRegistry = new SliceRegistry()
      try {
        // Греем и данные, и чанки шаблона/layout: иначе клик всё равно
        // ждёт загрузки шаблона.
        await Promise.all([
          clientPrefetch(to.route, tempRegistry, to, false),
          loadRouteModules(to.route),
        ])
      } catch (err) {
        // Prefetch — best-effort. Ошибки не блокируют клик.
        console.debug('[tusten] prefetch skipped:', err)
      } finally {
        tempRegistry.disposePage()
      }
    },
  }

  window.addEventListener('popstate', () => {
    // query обязателен: иначе back с /about?tab=router уходит на /about
    // и replaceState затирает предыдущие записи истории.
    void navigate(window.location.pathname + window.location.search, 'replace')
  })

  const initialRouter = currentRouter

  if (isSsr) {
    let stateObj
    try {
      stateObj = window.__ROOT_STATE_STR__
        ? devalueParse(window.__ROOT_STATE_STR__)
        : undefined
    } catch (err) {
      console.warn('[tusten] failed to parse __ROOT_STATE_STR__:', err)
      stateObj = undefined
    }
    // Чанки шаблона/layout и классы слайсов грузятся параллельно:
    // это последний водопад перед hydrateRoot.
    const [{ content, route: clientRoute }] = await Promise.all([
      renderTree(initialRoute, initialPath),
      hydrateSlicesFromState(stateObj, sliceRegistry),
    ])
    rootRef = hydrateRoot(
      rootEl,
      renderRoot(content, initialRouter, clientRoute, 'ready'),
      {
        // Mismatch React чинит клиентским рендером (со скачком вёрстки):
        // делаем его заметным, а не молчаливым.
        onRecoverableError: (err) => {
          console.error('[tusten] hydration mismatch (client re-render):', err)
          reportDevError(err, 'hydration')
        },
      },
    )
  } else {
    // Шаблон и Loading грузятся параллельно; Loading показываем, пока идёт prefetch.
    const [{ content, route: clientRoute }, LoadingComp] = await Promise.all([
      renderTree(initialRoute, initialPath),
      loadingCompP,
    ])
    rootRef = createRoot(rootEl)
    rootRef.render(
      renderRoot(createElement(LoadingComp), initialRouter, clientRoute, 'loading'),
    )

    try {
      await clientPrefetch(initialRoute, sliceRegistry, {
        path: initialPath, pathname: initialPath, params: initialParams, query: initialRouter.query,
      }, false)
      document.title = initialRoute.title || 'tusten'
      rootRef.render(
        renderRoot(content, initialRouter, clientRoute, 'ready'),
      )
    } catch (err) {
      console.error('[tusten] initial prefetch failed:', err)
      await renderErrorPage(err, 'prefetch')
    }
  }
}

main().catch((err) => {
  console.error('[tusten] hydration failed:', err)
  reportDevError(err, 'client')
  // SPA без SSR: если упало до первого hydrateRoot, экран остался бы пустым.
  // В SSR-режиме серверный HTML уже виден — не затираем его.
  if (!import.meta.env.DEV && window.__ROOT_SSR__ !== true) {
    const rootEl = findRootEl()
    if (rootEl && rootEl.childElementCount === 0) {
      const message = document.createElement('p')
      message.style.cssText = 'padding:1rem;font:15px/1.5 system-ui,sans-serif;color:#b91c1c'
      message.textContent = 'Не удалось загрузить страницу. Обновите её.'
      rootEl.appendChild(message)
    }
  }
})
`
}

/**
 * Генерирует `virtual:tusten/ssr-entry`.
 *
 * @param modulePaths карта spec → Vite-путь.
 * @returns код модуля.
 */
function generateSsrEntryModule(modulePaths: Map<string, string>): string {
    const byFile = new Map<string, string>()
    for (const [spec, vitePath] of modulePaths) {
        const file = spec.split(':')[0].replace(/^\.\//, '')
        if (!byFile.has(file)) byFile.set(file, vitePath)
    }

    const imports: string[] = []
    const entries: string[] = []
    let i = 0
    for (const [file, vitePath] of byFile) {
        const varName = `m_${i++}`
        imports.push(`import * as ${varName} from ${JSON.stringify(vitePath)}`)
        entries.push(`  ${JSON.stringify(file)}: ${varName}`)
    }

    return `
${imports.join('\n')}

export {
  RootProvider,
  renderLayoutChain,
  RootErrorBoundary,
  RootLoading,
  RootNotFound,
  setLocaleResolver,
  setI18nUsageHook,
  loadRegisteredDictionaries,
  getRegisteredDictionary,
} from '@tusten/core/client'

export { SliceRegistry } from '@tusten/core'

export const modules = {
${entries.join(',\n')}
}
`
}
