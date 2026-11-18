import Fastify, { type FastifyInstance } from 'fastify'
import fastifyStatic from '@fastify/static'
import fastifyCompress from '@fastify/compress'
import path from 'node:path'
import { constants } from 'node:zlib'
import { promises as fs } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { createSSRHandler, type SSRI18nRuntime } from './ssr-handler'
import { createDevModuleLoader, createProdModuleLoader } from './module-loader'
import { resolveStaticCacheControl } from './static-cache'
import { buildClientRoutes } from '../core/client-route'
import { buildNavigation, setNavigationCatalog } from '../core/navigation'
import { tustenPlugin } from '../vite/plugin'
import { resolveCssPaths } from '../utils/css'
import { createRpcExecutor } from './rpc-executor'
import { createRpcHandler } from './rpc-handler'
import { getRpcContext } from './rpc/als'
import { currentRequestLocale, recordRequestI18nUse } from './i18n/als'
import type { ComponentType, ReactNode } from 'react'
import type { FactoryMap, Manifest, MiddlewareDef, ResolvedTustenConfig, RouteTree, RpcExecutor } from '../types'
import type { I18nDictionary } from '../client/i18n/create-rk'
import type { RpcRegistry } from './rpc-registry'
import { findClientEntryFile, type ClientManifestEntry } from './ssr/assets/manifest'

/**
 * i18n-часть `tusten/client`, которую использует SSR. Берётся из того же модуля,
 * что и `RootProvider`: резолвер и хук должны попасть в инстанс, которым рендерит `rk`.
 */
interface TustenClientI18nApi {
    setLocaleResolver(fn: () => string | undefined): void
    setI18nUsageHook(hook: ((moduleId: string) => void) | undefined): void
    loadRegisteredDictionaries(locale?: string): Promise<void>
    getRegisteredDictionary(moduleId: string, locale: string): I18nDictionary | undefined
}

/** Режим работы сервера. */
export type TustenServerMode = 'development' | 'production'

/** Опции создания сервера. */
export interface CreateServerOptions {
    config: ResolvedTustenConfig
    projectDir: string
    routeTree: RouteTree
    manifest: Manifest
    globalRegistry: FactoryMap
    factoryModules: string[]
    /** RPC-реестр (null если RPC отключён). */
    rpcRegistry: RpcRegistry | null
    mode?: TustenServerMode
}

/**
 * Создаёт Fastify-сервер.
 *
 * Регистрирует (в порядке):
 *   1. Сжатие ответов (`@fastify/compress`, если не выключено в конфиге).
 *   2. RPC endpoint `POST /service` (если `config.server.rpc.enabled`).
 *   3. Fastify-плагины (`config.server.plugins`).
 *   4. Статику: `dist/client` и `public/` (только prod).
 *   5. API-роуты (`config.server.routes`).
 *   6. SSR/SPA HTML catch-all.
 *
 * @param options опции.
 * @returns Fastify-инстанс.
 */
export async function createServer(options: CreateServerOptions): Promise<FastifyInstance> {
    const { config, projectDir, routeTree, globalRegistry, factoryModules, rpcRegistry, mode = 'development' } = options

    const fastify = Fastify({
        logger: { level: 'info' },
        ...config.fastify,
    })
    const clientDir = path.resolve(projectDir, config.client.clientDir)
    const outDir = path.resolve(projectDir, config.build.outDir)
    const publicDir = config.publicDir ? path.resolve(projectDir, config.publicDir) : null
    const cssFiles = resolveCssPaths(projectDir, clientDir, config)

    // Каталог навигации статичен и не содержит данных запроса — сеять в
    // `globalThis` безопасно (в отличие от пути/прав, которые в глобал не кладём).
    // Это тот же набор, что client-entry соберёт для браузера: обе стороны
    // используют одну проекцию `toClientRoute`.
    setNavigationCatalog(buildNavigation(buildClientRoutes(routeTree)))

    // Сжатие регистрируется до роутов: плагин навешивает onSend-хук, который
    // должен успеть на все обычные ответы (RPC, API, статика). SSR-стрим и
    // готовые HTML-тела ответчика идут мимо хуков — их сжимаем сами.
    if (config.server.compress) {
        await fastify.register(fastifyCompress, {
            global: true,
            threshold: config.server.compress.threshold,
            encodings: config.server.compress.encodings,
            // Brotli quality 11 (дефолт Node) — офлайн-профиль: на каждый запрос
            // `client.js` это десятки миллисекунд CPU. Для рантайма quality 4,
            // gzip — уровень 6: те же параметры, что у SSR-компрессора.
            brotliOptions: { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } },
            zlibOptions: { level: 6 },
        })
    }

    let RootProvider: ComponentType<{
        children?: ReactNode
        sliceRegistry: unknown
        router: unknown
    }>
    let SliceRegistry: new () => unknown
    let renderLayoutChain: (page: ReactNode, layouts: ComponentType[]) => ReactNode
    let RootErrorBoundary: ComponentType<{
        children?: ReactNode
        fallback?: ComponentType<{ error: Error }>
    }>
    let RootNotFound: ComponentType
    let loadModule: (spec: string) => Promise<unknown>
    let fixStacktrace: ((error: unknown) => void) | undefined
    let entryScriptSrc: string
    let i18nClient: TustenClientI18nApi
    let clientManifest: Record<string, ClientManifestEntry> | null = null
    const clientOutPublicPrefix = '/'
    const isDev = mode === 'development'

    if (isDev) {
        const { createServer } = await import('vite')
        const react = (await import('@vitejs/plugin-react')).default
        const userVite = config.vite ?? {}

        const vite = await createServer({
            ...userVite,
            root: projectDir,
            // Каталог статики задаёт tusten: dev и prod должны отдавать одно и то же.
            publicDir: publicDir ?? false,
            server: { ...(userVite.server ?? {}), middlewareMode: true },
            appType: 'custom',
            configFile: false,
            ssr: {
                ...(userVite.ssr ?? {}),
                noExternal: ['@tusten/core', ...((userVite.ssr?.noExternal as string[]) ?? [])],
            },
            optimizeDeps: {
                ...(userVite.optimizeDeps ?? {}),
                exclude: ['@tusten/core', ...((userVite.optimizeDeps?.exclude as string[]) ?? [])],
            },
            plugins: [
                tustenPlugin({
                    projectDir,
                    clientDir,
                    config,
                    routeTree,
                    factoryModules,
                    globalFactories: globalRegistry,
                    cssFiles,
                }),
                react(),
                ...(userVite.plugins ?? []),
            ],
            resolve: { ...(userVite.resolve ?? {}), preserveSymlinks: false },
        })

        // Skip Vite middleware для API/RPC/prefetch — их обрабатывает Fastify.
        fastify.addHook('onRequest', (req, reply, done) => {
            const url = req.url.split('?')[0]
            const isHtml = req.headers.accept?.includes('text/html')
            const isApi = url.startsWith('/api/') || url.startsWith('/__tusten/') || url === config.server.rpc.url
            if (isHtml || isApi) {
                done()
                return
            }
            vite.middlewares(req.raw, reply.raw, done)
        })

        // Vite резолвит `tusten/client` через `exports` пакета → dist/client/index.js.
        // `noExternal: ['@tusten/core']` заставляет Vite трансформировать, а не externalize.
        // Core-safe `SliceRegistry` живёт только в `@tusten/core` (в `/client` его нет).
        const [tustenCore, tustenClient] = (await Promise.all([
            vite.ssrLoadModule('@tusten/core'),
            vite.ssrLoadModule('@tusten/core/client'),
        ])) as [
            { SliceRegistry: new () => unknown },
            {
                RootProvider: typeof RootProvider
                renderLayoutChain: typeof renderLayoutChain
                RootErrorBoundary: typeof RootErrorBoundary
                RootNotFound: typeof RootNotFound
            } & TustenClientI18nApi,
        ]

        i18nClient = tustenClient
        RootProvider = tustenClient.RootProvider
        SliceRegistry = tustenCore.SliceRegistry
        renderLayoutChain = tustenClient.renderLayoutChain
        RootErrorBoundary = tustenClient.RootErrorBoundary
        RootNotFound = tustenClient.RootNotFound
        loadModule = createDevModuleLoader(clientDir, vite)
        // Vite знает sourcemap'ы трансформированных модулей: без этого стек SSR
        // указывал бы на сгенерированный код, а не на исходный `.tsx`.
        fixStacktrace = (error) => {
            if (!(error instanceof Error)) return
            try {
                vite.ssrFixStacktrace(error)
            } catch {
                // Стек мог быть уже изменён (например, ошибка пришла из плагина).
            }
        }
        entryScriptSrc = '/@id/__x00__virtual:tusten/client-entry'
    } else {
        const serverEntry = path.join(outDir, 'server', 'entry.js')
        const clientOut = path.join(outDir, 'client')

        const manifestPath = path.join(clientOut, '.vite', 'manifest.json')
        try {
            const raw = await fs.readFile(manifestPath, 'utf8')
            clientManifest = JSON.parse(raw) as Record<string, ClientManifestEntry>
        } catch (err) {
            fastify.log.warn(
                `[tusten] client manifest not found at ${manifestPath}: ${(err as Error).message}. ` +
                    `CSS for production will not be injected.`,
            )
        }

        const entryMod = (await import(pathToFileURL(serverEntry).href)) as {
            RootProvider: typeof RootProvider
            SliceRegistry: typeof SliceRegistry
            renderLayoutChain: typeof renderLayoutChain
            RootErrorBoundary: typeof RootErrorBoundary
            RootNotFound: typeof RootNotFound
        } & TustenClientI18nApi

        i18nClient = entryMod
        RootProvider = entryMod.RootProvider
        SliceRegistry = entryMod.SliceRegistry
        renderLayoutChain = entryMod.renderLayoutChain
        RootErrorBoundary = entryMod.RootErrorBoundary
        RootNotFound = entryMod.RootNotFound
        loadModule = createProdModuleLoader(serverEntry)
        // Entry хэшируется (`assets/client-entry-<hash>.js`): URL берём из
        // manifest. Без manifest (усечённый деплой) остаётся легаси-имя.
        const entryFile = clientManifest ? findClientEntryFile(clientManifest) : null
        entryScriptSrc = entryFile ? `${clientOutPublicPrefix}${entryFile}` : '/client.js'

        // Артефакты сборки идут первыми: хэшированные чанки не должны
        // перекрываться одноимённым файлом из `public/`. Второй root —
        // исходный `public/`, чтобы файл, добавленный без пересборки, тоже отдавался.
        // Несуществующий каталог не передаём: `@fastify/static` обходит roots
        // через glob ещё на старте.
        const publicDirExists = publicDir
            ? await fs
                  .stat(publicDir)
                  .then((stat) => stat.isDirectory())
                  .catch(() => false)
            : false

        await fastify.register(fastifyStatic, {
            root: publicDirExists && publicDir ? [clientOut, publicDir] : clientOut,
            prefix: '/',
            wildcard: false,
            // `.br`/`.gz` создаёт `build/precompress.ts`; выбирается по
            // `Accept-Encoding`, без сжатия на каждый запрос. `@fastify/static`
            // сам добавляет `Vary: Accept-Encoding` и откатывается на
            // несжатый файл, если варианта нет.
            preCompressed: true,
            setHeaders(reply, filePath) {
                reply.header('Cache-Control', resolveStaticCacheControl(filePath))
            },
        })
    }

    // ---- RPC executor + /service endpoint ----
    let rpcExecutor: RpcExecutor | undefined
    if (config.server.rpc.enabled && rpcRegistry) {
        rpcExecutor = createRpcExecutor(rpcRegistry, config)

        // Прокидываем ALS-геттер в globalThis — server-bridge использует его
        // в client-коде, но не тянет node:async_hooks в браузер.
        ;(globalThis as unknown as { __rootRpcGetContext?: () => unknown }).__rootRpcGetContext = getRpcContext

        const rpcHandler = createRpcHandler({ registry: rpcRegistry, config })
        fastify.post(config.server.rpc.url, rpcHandler)
    }

    // ---- Server plugins ----
    if (config.server.plugins) {
        const { loadServerPlugins } = await import('./server-plugins-loader')
        const { registerServerPlugins } = await import('./api-register')
        const plugins = await loadServerPlugins(projectDir, config.server.plugins)
        await registerServerPlugins(fastify, plugins, projectDir)
    }

    // ---- API routes ----
    if (config.server.routes) {
        const { loadServerRoutes } = await import('./server-routes-loader')
        const { registerServerRoutes } = await import('./api-register')
        const routes = await loadServerRoutes(projectDir, config.server.routes)
        await registerServerRoutes(fastify, routes, projectDir)
    }

    // ---- SSR handler ----
    const globalMiddleware: MiddlewareDef[] = (config.middleware ?? []).filter(
        (m) => m.side === 'server' || m.side === 'both',
    )

    // ---- i18n: locale запроса и словари для SSR ----
    // Резолвер и хук регистрируем один раз: locale и учёт `rk` дальше идут через ALS,
    // поэтому параллельные запросы с разной locale не влияют друг на друга.
    let i18nRuntime: SSRI18nRuntime | null = null
    if (config.i18n) {
        i18nClient.setLocaleResolver(currentRequestLocale)
        i18nClient.setI18nUsageHook(recordRequestI18nUse)
        i18nRuntime = {
            loadDictionaries: (locale) => i18nClient.loadRegisteredDictionaries(locale),
            getDictionary: (moduleId, locale) => i18nClient.getRegisteredDictionary(moduleId, locale),
        }
    }

    const ssrHandler = createSSRHandler({
        config,
        projectDir,
        clientDir,
        routeTree,
        globalRegistry,
        RootProvider,
        SliceRegistry,
        loadModule,
        isDev,
        fixStacktrace,
        entryScriptSrc,
        clientManifest,
        clientOutPublicPrefix,
        globalMiddleware,
        rpcExecutor,
        i18n: i18nRuntime,
        renderLayoutChain,
        RootErrorBoundary,
        RootNotFound,
    })

    fastify.get('/*', ssrHandler)

    return fastify
}
