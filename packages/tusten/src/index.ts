/**
 * Публичный API tusten — client-safe.
 *
 * Всё, что экспортируется из этого файла, безопасно грузить в браузер.
 * Не тянет jiti, fastify, vite и другие node-only зависимости.
 *
 * Server-only API — в `tusten/server`.
 * React-хуки и провайдер — в `tusten/client`.
 */

// Конфиг (pure, без jiti).
export { defineConfig } from './core/define-config'

// Маршруты и глобальные загрузчики.
export { defineRoute } from './core/define-route'
export { defineGlobalLoader } from './core/define-global-loader'

// Классы слайсов (pure TS, без React).
export { AbstractSlice } from './client/slices/AbstractSlice'
export { Slice } from './client/slices/Slice'
export { SliceRegistry } from './client/slices/SliceRegistry'
export type { SliceListener, SlicePatch, SliceUpdater } from './client/slices/AbstractSlice'

// URL-билдер.
export { computePath } from './core/url'

// Ошибки.
export { TustenError } from './core/errors'

// Типы.
export type {
    TustenConfig,
    ResolvedTustenConfig,
    TustenCompressConfig,
    TustenCompressEncoding,
    ResolvedCompressOptions,
    TustenRoute,
    TustenRouter,
    FactoryDef,
    FactoryMap,
    FactoryImplementation,
    RouteTree,
    Manifest,
    ManifestEntry,
    ModuleKind,
    ScanResult,
    HttpMethod,
    MiddlewareDef,
    ServerRoute,
    ServerPluginDef,
    ServerPluginsOptions,
    TustenClientRouter,
    TustenClientRoute,
    TustenRouteNavigation,
    TustenNavigationItem,
    ServiceOptions,
    CrudOp,
    IBinding,
} from './types'
export { RpcError } from './core/errors'
export type { JsonRpcErrorPayload } from './core/errors'
export { Service } from './client/rpc/Service'

// Prefetch (изоморфный).
export { runGlobalPrefetch, runPagePrefetch, runPrefetch } from './core/prefetch'
export type { PrefetchContext, PrefetchRegistry, PrefetchResult, PrefetchSliceInfo } from './core/prefetch'
export { resolveMeta } from './core/meta-resolver'
export { toClientRoute, pickClientRoute, collectParentIds, buildClientRoutes } from './core/client-route'
export type { ClientRouteContext } from './core/client-route'

// Каталог навигации (client-safe).
export { buildNavigation, getNavigation, setNavigationCatalog } from './core/navigation'
export type { TustenRootConfig, ResolvedRootConfig, TustenRootElementConfig, ResolvedRootElement } from './types'
export type { MetaTag, MetaResult, MetaConfig, PageMeta } from './types'
