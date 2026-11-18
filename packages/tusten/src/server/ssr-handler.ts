import { createElement, type ComponentType, type ReactNode } from 'react'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { parseCookieHeader, runWithRpcContext } from './rpc/als'
import { runWithI18nContext } from './i18n/als'
import { buildDevErrorsScript } from './error-page'
import {
    buildEntryScript,
    buildHead,
    buildMiddlewareScript,
    buildViteClientScript,
    createDocumentTail,
} from './ssr/html'
import { createResponder, createStackFixer } from './ssr/response'
import { createAssetResolver, type ClientManifestEntry } from './ssr/assets'
import { createI18nRequest, type SSRI18nRuntime } from './ssr/i18n-request'
import { DEFAULT_PAGE_META, loadPageComponents, loadPageData } from './ssr/page-data'
import { renderNotFoundBody } from './ssr/not-found'
import { renderSpaShell } from './ssr/spa-shell'
import { pipeSsrDocument } from './ssr/ssr-stream'
import { queryToObject } from './ssr/query'
import type { RootProviderComponent, SliceRegistryConstructor } from './ssr/contracts'
import { collectParentIds, toClientRoute } from '../core/client-route'
import { matchRoute } from '../core/url'
import type {
    FactoryMap,
    MiddlewareDef,
    TustenClientRouter,
    TustenRouter,
    ResolvedRootElement,
    ResolvedTustenConfig,
    RouteTree,
    RpcExecutor,
} from '../types'
import type { PageMeta } from '../types'

// Обратная совместимость: `SSRI18nRuntime` импортирует `create-server.ts`.
export type { SSRI18nRuntime }

/** Опции SSR-обработчика. */
export interface SSRHandlerOptions {
    config: ResolvedTustenConfig
    projectDir: string
    clientDir: string
    routeTree: RouteTree
    globalRegistry: FactoryMap
    RootProvider: RootProviderComponent
    SliceRegistry: SliceRegistryConstructor
    loadModule: (spec: string) => Promise<unknown>
    isDev: boolean
    /**
     * Правит `Error.stack` по sourcemap (dev). В Vite это `vite.ssrFixStacktrace`:
     * без него стек указывает на результат трансформации, а не на исходный `.tsx`.
     */
    fixStacktrace?: (error: unknown) => void
    entryScriptSrc: string
    clientManifest?: Record<string, ClientManifestEntry> | null
    clientOutPublicPrefix?: string
    globalMiddleware: MiddlewareDef[]
    /** JSON-RPC executor для SSR. */
    rpcExecutor?: RpcExecutor
    /** i18n-рантайм; `null` — i18n выключен в конфиге, тогда ни locale, ни словари не трогаем. */
    i18n?: SSRI18nRuntime | null
    /** Оборачивает страницу цепочкой layouts (root → leaf). */
    renderLayoutChain: (page: ReactNode, layouts: ComponentType[]) => ReactNode
    /** Error Boundary фреймворка. */
    RootErrorBoundary: ComponentType<{
        children?: ReactNode
        fallback?: ComponentType<{ error: Error }>
    }>
    /** Дефолтный 404 (если `config.client.components.notFound` не задан). */
    RootNotFound: ComponentType
}

/**
 * Создаёт обработчик SSR-запросов.
 *
 * Режимы:
 *   - SSR: React-рендер, `hydrateRoot` на клиенте.
 *   - SPA (`config.ssr === false` / `route.ssr === false` / `?noSSR=true`):
 *     пустой каркас, `createRoot` на клиенте.
 *
 * `__ROOT_STATE_STR__` — JSON-строка от `devalue.stringify`.
 *
 * @param options опции.
 * @returns async-обработчик.
 */
export function createSSRHandler(options: SSRHandlerOptions) {
    const {
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
        clientOutPublicPrefix = '/',
        globalMiddleware,
        rpcExecutor,
        i18n: i18nRuntime = null,
        renderLayoutChain,
        RootErrorBoundary,
        RootNotFound,
    } = options

    // Всё ниже зависит только от конфига и режима, а не от запроса,
    // поэтому считаем один раз при создании обработчика.
    const viteClientScript = buildViteClientScript(isDev)
    const entryScript = buildEntryScript(entryScriptSrc)

    // Контейнер приложения: настройки приходят из конфига, поэтому закрывающий
    // тег и атрибуты одинаковы для SSR, 404 и SPA-shell.
    const rootElement: ResolvedRootElement = config.client.root.container

    const middlewareScript = buildMiddlewareScript(config.middleware)
    const documentTail = createDocumentTail({ rootElement, entryScript, middlewareScript })

    const debugState = Boolean(process.env.TUSTEN_DEBUG)

    /** Правка стека по sourcemap (dev), безопасная для вызова в `catch`. */
    const fixStack = createStackFixer(fixStacktrace)

    /**
     * `<script>` для клиентского оверлея с ошибками, случившимися после отправки shell.
     *
     * @param errors ошибки стрима.
     * @returns HTML-строка или пустая (prod/без ошибок).
     */
    const devErrorsScript = (errors: readonly unknown[]): string => (isDev ? buildDevErrorsScript([...errors]) : '')

    /**
     * Кэш загруженных SSR-модулей.
     *
     * Только prod: в dev `vite.ssrLoadModule` сам инвалидирует граф при HMR,
     * собственный кэш вернул бы устаревший компонент.
     */
    const moduleCache = new Map<string, Promise<unknown>>()

    /**
     * Загружает модуль по спеке, кэшируя результат в prod.
     *
     * @param spec спека (`<file>` или `<file>:<export>`).
     * @returns значение экспорта.
     */
    const loadModuleCached = (spec: string): Promise<unknown> => {
        if (isDev) return loadModule(spec)

        const cached = moduleCache.get(spec)
        if (cached) return cached

        const pending = loadModule(spec)
        // Ошибку не кэшируем: следующий запрос может прийти уже после фикса.
        void pending.catch(() => moduleCache.delete(spec))
        moduleCache.set(spec, pending)
        return pending
    }

    /** CSS/preload для `<head>`: manifest-индекс считается один раз. */
    const assets = createAssetResolver({
        isDev,
        projectDir,
        clientDir,
        config,
        clientManifest,
        clientOutPublicPrefix,
        entryScriptSrc,
    })

    return async function handler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
        reply.hijack()

        const compression = config.server.compress
        const acceptEncoding =
            typeof req.headers['accept-encoding'] === 'string' ? req.headers['accept-encoding'] : undefined
        const responder = createResponder(req, reply, {
            isDev,
            projectDir,
            fixStack,
            compression,
            acceptEncoding,
        })
        const i18n = createI18nRequest({
            runtime: i18nRuntime,
            config,
            cookie: req.headers.cookie,
            acceptLanguage: req.headers['accept-language'],
        })

        const runHandler = async (): Promise<void> => {
            const url = req.url.split('?')[0]
            const query = queryToObject(req.url)
            const matched = matchRoute(url, routeTree.compiled)
            const route = matched ? (routeTree.byId.get(matched.routeId) ?? null) : null
            const params = matched?.params ?? {}

            // ---- 404 ----
            if (!route) {
                const accept = req.headers.accept ?? ''
                const wantsJson = accept.includes('application/json') && !accept.includes('text/html')

                if (wantsJson) {
                    // `Vary` обязателен: по одному URL два разных представления.
                    responder.send(
                        404,
                        'application/json; charset=utf-8',
                        JSON.stringify({ error: 'Not Found', path: url }),
                        { Vary: 'Accept' },
                    )
                    return
                }

                try {
                    const body = await renderNotFoundBody({
                        url,
                        query,
                        config,
                        SliceRegistry,
                        RootProvider,
                        RootNotFound,
                        loadModuleCached,
                        i18n,
                    })

                    responder.send(
                        404,
                        'text/html; charset=utf-8',
                        buildHead(
                            { title: '404', meta: [], microdata: {} },
                            {
                                cssLinksHtml: assets.cssLinks({ mode: 'spa', route: null }),
                                viteClientScript,
                                locale: i18n.locale,
                                rootElement,
                            },
                        ) +
                            body +
                            documentTail(true, '', i18n.bootScript(i18n.collectUsedDictionaries())),
                        { Vary: i18n.varyFor('Accept') },
                    )
                } catch (err) {
                    // Root controller нужен и на 404: без него гидрация разойдётся с сервером.
                    responder.fail('Root controller error', err)
                }
                return
            }

            // ---- Режим (per-route + глобальный + ?noSSR) ----
            const globalSSR = config.ssr !== false
            const routeSSR = globalSSR ? route.ssr !== false : false
            const shouldSSR = routeSSR && query.noSSR !== 'true'

            // Цепочка layout нужна CSS, preload, рендеру и проекции маршрута —
            // считаем один раз на запрос.
            const layoutChain = routeTree.layoutChains.get(route.id)
            const cssLinksHtml = assets.cssLinks({
                mode: shouldSSR ? 'ssr' : 'spa',
                route,
                layoutChain,
            })

            // ---- SPA ----
            if (!shouldSSR) {
                // В SPA-режиме `readMethod`/`getMetaCallback` не вызываем:
                // клиент подхватит meta через `usePageMeta`, если нужно.
                const spaMeta: PageMeta = {
                    title: route.metaConfig?.title ?? DEFAULT_PAGE_META.title,
                    meta: route.metaConfig?.meta ?? [],
                    microdata: route.metaConfig?.microdata ?? {},
                }

                // Словарей нет: клиент догрузит их перед рендером, а locale сообщаем уже здесь.
                responder.send(
                    200,
                    'text/html; charset=utf-8',
                    renderSpaShell({
                        meta: spaMeta,
                        cssLinksHtml,
                        viteClientScript,
                        locale: i18n.locale,
                        rootElement,
                        documentTail,
                        i18nBoot: i18n.bootScript(),
                    }),
                    i18n.headers,
                )
                return
            }

            // ---- SSR ----
            const rootSpec = config.client.root.component
            let components
            try {
                components = await loadPageComponents({ route, layoutChain, rootSpec, loadModuleCached, i18n })
            } catch (err) {
                responder.fail('SSR error', err)
                return
            }

            const sliceRegistry = new SliceRegistry()
            const router: TustenRouter = {
                id: route.id,
                path: url,
                params,
                query,
                request: req,
            }

            // Абсолютный URL для `readMethod` / `getMetaCallback`.
            const origin = (req.headers['x-forwarded-proto'] as string | undefined) ?? req.protocol
            const host = (req.headers['x-forwarded-host'] as string | undefined) ?? req.hostname

            let data
            try {
                data = await loadPageData({
                    route,
                    router,
                    registry: sliceRegistry as object,
                    globalRegistry,
                    loadModule,
                    loadModuleCached,
                    globalMiddleware,
                    clientDir,
                    projectDir,
                    fullUrl: `${origin}://${host}${req.url}`,
                    errorComponentSpec: config.client.components.error,
                })
            } catch (err) {
                responder.fail('Prefetch error', err)
                return
            }

            if (data.kind === 'redirect') {
                responder.redirect(data.location)
                return
            }

            if (debugState) {
                console.log(`[tusten] __ROOT_STATE_STR__ length=${data.stateJson.length}`)
            }

            const initialRouter: TustenClientRouter = {
                path: url,
                params,
                query,
                routeId: route.id,
            }

            // Та же проекция, что и в клиентском routesData: root controller
            // обязан видеть одинаковый route на сервере и при гидрации.
            const clientRoute = toClientRoute(route, {
                path: url,
                parentIds: collectParentIds(route.id, routeTree.byId),
                layoutChain: layoutChain ?? [],
            })

            const content = createElement(
                RootErrorBoundary,
                { fallback: data.errorComponent },
                renderLayoutChain(createElement(components.Template), components.Layouts),
            )
            const tree = components.RootController
                ? createElement(
                      components.RootController,
                      { route: clientRoute, router: initialRouter, status: 'ready' },
                      content,
                  )
                : content

            // Preload entry и чанков маршрута в `<head>`: загрузка идёт параллельно
            // с HTML, а не после выполнения `client.js` (водопад перед гидратацией).
            // CSS стоит ПЕРВЫМ: он render-blocking, и на узком канале preload JS,
            // запрошенный раньше стилей, оттягивает на себя полосу и задерживает FCP/LCP.
            const prefix = buildHead(data.pageMeta, {
                cssLinksHtml:
                    cssLinksHtml +
                    assets.modulePreloads({ route, layoutChain, sliceModulePaths: data.sliceModulePaths }),
                viteClientScript,
                locale: i18n.locale,
                rootElement,
            })

            pipeSsrDocument({
                element: createElement(
                    RootProvider,
                    { sliceRegistry, router: initialRouter, route: clientRoute },
                    tree,
                ),
                prefix,
                responder,
                headers: i18n.headers,
                fixStack,
                compression: compression?.ssr ? compression : null,
                acceptEncoding,
                // Суффикс собираем в flush: к концу стрима `ctx.used` содержит
                // все модули, которые реально вызвали `rk`.
                buildTail: (streamErrors) =>
                    documentTail(
                        true,
                        data.stateJson,
                        i18n.bootScript(i18n.collectUsedDictionaries()),
                        devErrorsScript(streamErrors),
                    ),
            })
        }

        const runRequest = async (): Promise<void> => {
            // ALS-контекст (executor для SSR `Service.call`).
            if (rpcExecutor) {
                const headers: Record<string, string> = {}
                for (const [k, v] of Object.entries(req.headers)) {
                    if (typeof v === 'string') headers[k] = v
                    else if (Array.isArray(v)) headers[k] = v.join(', ')
                }
                const cookies = parseCookieHeader(headers.cookie)
                await runWithRpcContext(
                    {
                        headers,
                        cookies,
                        executor: rpcExecutor,
                        cache: new Map(), // per-request кэш Service
                    },
                    runHandler,
                )
            } else {
                await runHandler()
            }
        }

        try {
            // i18n-ALS поверх RPC-ALS: locale и учёт `rk` видны всему рендеру этого запроса.
            await (i18n.ctx ? runWithI18nContext(i18n.ctx, runRequest) : runRequest())
        } catch (err) {
            // Всё, что вылетело до `reply.raw.end()` (парсинг URL, 404-рендер,
            // middleware), иначе оставило бы запрос висеть до таймаута.
            responder.fail('Handler error', err)
        }
    }
}
