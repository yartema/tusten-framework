import type { ComponentType } from 'react'
import { runGlobalPrefetch, runPagePrefetch } from '../prefetch'
import { serializeState, stringifyState } from '../serialize'
import { runServerMiddleware } from '../run-server-middleware'
import { resolveMeta } from '../../core/meta-resolver'
import type { RootControllerProps } from '../../client/root-controller'
import type { FactoryMap, MiddlewareDef, PageMeta, TustenRoute, TustenRouter } from '../../types'
import type { I18nRequest } from './i18n-request'

/** Дефолтная meta — используется как fallback для `<title>` и при ошибках. */
export const DEFAULT_PAGE_META: PageMeta = { title: 'Страница', meta: [], microdata: {} }

/** Загруженные компоненты страницы. */
export interface PageComponents {
    /** Компонент шаблона страницы. */
    Template: ComponentType
    /** Root controller (или `null`, если не задан). */
    RootController: ComponentType<RootControllerProps> | null
    /** Цепочка layout'ов (root → leaf). */
    Layouts: ComponentType[]
}

/** Опции загрузки компонентов страницы. */
export interface PageComponentsOptions {
    /** Текущий маршрут. */
    route: TustenRoute
    /** Цепочка layout-спек маршрута (root → leaf). */
    layoutChain?: readonly string[]
    /** Root controller из конфига (или `null`). */
    rootSpec: string | null
    /** Загрузчик модулей с кэшем prod. */
    loadModuleCached: (spec: string) => Promise<unknown>
    /** i18n-состояние запроса. */
    i18n: I18nRequest
}

/**
 * Загружает шаблон, root controller и layouts страницы.
 *
 * Шаблон, root controller и layouts независимы: грузим параллельно, порядок
 * `Layouts` сохраняется (root → leaf). Словари i18n грузятся после импорта:
 * только тогда known-список `createRk`-модулей полон.
 *
 * @param options маршрут и загрузчики.
 * @returns компоненты страницы.
 * @throws если спек не резолвится в React-компонент.
 */
export async function loadPageComponents(options: PageComponentsOptions): Promise<PageComponents> {
    const { route, layoutChain, rootSpec, loadModuleCached, i18n } = options
    const templateSpec = route.contentConfig.workspaceConfig.template
    const layoutSpecs = layoutChain ?? []

    const [templateValue, rootValue, ...layoutValues] = await Promise.all([
        loadModuleCached(templateSpec),
        rootSpec ? loadModuleCached(rootSpec) : Promise.resolve(null),
        ...layoutSpecs.map((spec) => loadModuleCached(spec)),
    ])

    if (typeof templateValue !== 'function') {
        throw new Error(`Template is not a component: ${templateSpec}`)
    }

    let RootController: ComponentType<RootControllerProps> | null = null
    if (typeof rootValue === 'function') {
        RootController = rootValue as ComponentType<RootControllerProps>
    } else if (rootSpec) {
        throw new Error(`Root controller is not a component: ${rootSpec}`)
    }

    const Layouts: ComponentType[] = []
    for (const layoutValue of layoutValues) {
        if (typeof layoutValue === 'function') Layouts.push(layoutValue as ComponentType)
    }

    // Импорт шаблона и layouts создаёт `createRk`-инстансы; только после этого
    // known-список модулей полон и можно загрузить их словари до рендера.
    await i18n.loadDictionaries()

    return { Template: templateValue as ComponentType, RootController, Layouts }
}

/** Опции загрузки данных страницы. */
export interface PageDataOptions {
    /** Текущий маршрут. */
    route: TustenRoute
    /** Контекст `router` для фабрик. */
    router: TustenRouter
    /** Реестр слайсов запроса (`SliceRegistry`). */
    registry: object
    /** Глобальные фабрики. */
    globalRegistry: FactoryMap
    /** Загрузчик SSR-модулей (без кэша). */
    loadModule: (spec: string) => Promise<unknown>
    /** Загрузчик модулей с кэшем prod (для Error-компонента). */
    loadModuleCached: (spec: string) => Promise<unknown>
    /** Серверные middleware (глобальные). */
    globalMiddleware: MiddlewareDef[]
    /** Каталог клиентского кода (для `serializeState`). */
    clientDir: string
    /** Корень проекта. */
    projectDir: string
    /** Абсолютный URL запроса (для `readMethod` / `getMetaCallback`). */
    fullUrl: string
    /** Спек кастомного Error-компонента (или `null`). */
    errorComponentSpec: string | null
}

/** Данные успешно подготовленной страницы. */
export interface PageDataOk {
    kind: 'ok'
    /** Готовая meta страницы. */
    pageMeta: PageMeta
    /** `__ROOT_STATE_STR__` (JSON-строка от devalue). */
    stateJson: string
    /** Vite-пути модулей слайсов — для preload перед гидрацией. */
    sliceModulePaths: string[]
    /** Кастомный Error-компонент (fallback boundary). */
    errorComponent: ComponentType<{ error: Error }> | undefined
}

/** Результат данных страницы. */
export type PageData = PageDataOk | { kind: 'redirect'; location: string }

/**
 * Собирает данные страницы: глобальный prefetch, middleware, meta, state.
 *
 * Кастомный Error-компонент грузится параллельно с prefetch: он не зависит от
 * данных, а ошибка его загрузки не должна ломать страницу (fallback boundary).
 *
 * @param options маршрут, реестр и загрузчики.
 * @returns данные страницы или редирект из middleware.
 * @throws если prefetch/meta/serialize завершились ошибкой.
 */
export async function loadPageData(options: PageDataOptions): Promise<PageData> {
    const {
        route,
        router,
        registry,
        globalRegistry,
        loadModule,
        loadModuleCached,
        globalMiddleware,
        clientDir,
        projectDir,
        fullUrl,
        errorComponentSpec,
    } = options

    const errorComponentPromise: Promise<ComponentType<{ error: Error }> | undefined> = errorComponentSpec
        ? loadModuleCached(errorComponentSpec).then(
              (mod) => mod as ComponentType<{ error: Error }>,
              (err) => {
                  console.warn('[tusten] failed to load config.client.components.error, fallback to default:', err)
                  return undefined
              },
          )
        : Promise.resolve(undefined)

    const globalStates = await runGlobalPrefetch({
        route,
        globalRegistry,
        loadModule,
        registry: registry as never,
        router,
    })

    const mwResult = await runServerMiddleware(
        globalMiddleware,
        route,
        { router, route, globalSlices: registry as never },
        projectDir,
    )
    if (mwResult && 'redirect' in mwResult) {
        return { kind: 'redirect', location: mwResult.redirect }
    }

    const [prefetchResult, pageMeta] = await Promise.all([
        runPagePrefetch(
            {
                route,
                globalRegistry,
                loadModule,
                registry: registry as never,
                router,
            },
            globalStates,
        ),
        resolveMeta(route, router, fullUrl, loadModule),
    ])

    const serialized = await serializeState(prefetchResult.slices, projectDir, clientDir)

    return {
        kind: 'ok',
        pageMeta,
        stateJson: stringifyState(serialized),
        sliceModulePaths: Object.values(serialized.slices).map((s) => s.modulePath),
        errorComponent: await errorComponentPromise,
    }
}
