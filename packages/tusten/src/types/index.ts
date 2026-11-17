/**
 * Публичные типы tusten, разнесённые по доменам.
 *
 * Баррель сохраняет привычный импорт `from '../types'`; конкретный домен можно
 * импортировать напрямую (`from '../types/route'`) — так меньше связей.
 */

export type {
    TustenRootElementConfig,
    ResolvedRootElement,
    TustenRootConfig,
    ResolvedRootConfig,
    TustenConfig,
    TustenI18nConfig,
    ResolvedTustenConfig,
} from './config'

export type { HttpMethod, ServerRoute, ServerPluginDef, ServerPluginsOptions } from './server'

export type { MiddlewareDef } from './middleware'

export type {
    TustenRoute,
    TustenClientRoute,
    TustenClientRouter,
    TustenRouter,
    CompiledRoute,
    RouteTree,
} from './route'

export type { MetaTag, MetaResult, MetaConfig, PageMeta } from './meta'

export type { FactoryDef, FactoryMap, FactoryImplementation } from './factory'

export type { ModuleKind, ManifestEntry, Manifest, ScanResult, I18nRegistry } from './manifest'

export type {
    StandardSchemaV1Issue,
    StandardSchemaV1Success,
    StandardSchemaV1Failure,
    StandardSchemaV1Result,
    StandardSchemaV1,
    RpcParamsSchema,
    AuthRequirement,
    RpcMethodDefinition,
    RpcObjectDefinition,
    RpcContext,
    RpcOptions,
    ResolvedRpcOptions,
    RpcExecutor,
} from './rpc'

export type { CrudOp, IBinding, ServiceOptions, ServiceCacheEntry, CallOptions } from './service'
