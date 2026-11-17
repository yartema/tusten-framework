import type { MiddlewareDef } from './middleware'

/** HTTP-метод API-роута. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS'

/** API-роут (Phase 2.1). */
export interface ServerRoute {
    /** HTTP-метод. */
    method: HttpMethod
    /** URL-путь (Fastify `url`). */
    path: string
    /** Путь до async-функции-handler'а. */
    handler: string
    /** Статические параметры (первый аргумент handler'а). */
    params?: Record<string, unknown>
    /** API-middleware-цепочка. */
    middleware?: MiddlewareDef[]
}

/** Fastify-плагин из `server/plugins/`. */
export interface ServerPluginDef {
    /** Имя (из имени файла). */
    name: string
    /** Абсолютный путь. */
    path: string
}

/** Опции `defineServerPlugins`. */
export interface ServerPluginsOptions {
    /** Явный порядок регистрации (по именам). Остальные — в конце, алфавитно. */
    order?: string[]
}
