import type { MetaConfig } from './meta'
import type { MiddlewareDef } from './middleware'

/**
 * Один маршрут, возвращаемый из `router.ts` через `defineRoute([...])`.
 */
export interface TustenRoute {
    /** URL-сегмент и глобальный уникальный идентификатор. */
    id: string
    /** Идентификатор родителя (для иерархии URL). */
    parentId?: string
    /**
     * Цепочка layout'ов маршрута: спека `<file>:<export>` или массив (root → leaf).
     *
     * Не задана — наследуется от `parentId`. `false` или `[]` — без layout'ов.
     * Строка/массив **заменяет** унаследованную цепочку, а не добавляется к ней;
     * для вложенности перечислите layout'ы явно: `['layouts/Main', 'layouts/Admin']`.
     */
    layout?: string | string[] | false
    /**
     * Если `true` — собственный `id` не попадает в URL.
     * Глобально допустим только один такой маршрут.
     */
    index?: boolean
    /** Конфиг meta для маршрута. SEO */
    metaConfig?: MetaConfig
    /** Конфигурация контента: шаблон и prefetch-пайплайн. */
    contentConfig: {
        workspaceConfig: {
            /** Путь до компонента (`<file>:<export>` или `<file>`). */
            template: string
            /** Статические props, передаваемые в компонент. */
            templateProps?: Record<string, unknown>
        }
        prefetchConfig: {
            /** Путь до модуля с `export default function getConfig(configParams, router)`. */
            configLoader: string
            /** Аргументы, передаваемые в `getConfig`. */
            configParams?: Record<string, unknown>
            /** Имена глобальных loaders, от которых зависит страница. */
            dependencies?: string[]
        }
    }
    /** Произвольные пользовательские данные (не SEO). */
    meta?: Record<string, unknown>
    /**
     * Middleware для страницы. Client — `client/middleware/*.ts`,
     * server — `server/middleware/*.ts`. Наследуется по `parentId`.
     */
    middleware?: MiddlewareDef[]
    /**
     * URL-паттерн. Если задан — используется как есть (абсолютный, `/...`),
     * игнорируя цепочку `parentId → id`. `:param` — динамические сегменты.
     */
    path?: string
    /**
     * Сегменты, добавляемые к цепочке `parentId → id`. Взаимоисключающий с `path`.
     *
     * - `':param'` — именованный параметр, `params.param = value`.
     * - `'/regex:body'` — regex (tusten сам оборачивает в `^(body)$`,
     *   захватывающая группа получает имя `slug` или `slug1`, `slug2`...).
     * - `'literal'` — статический сегмент, без параметров.
     */
    slug?: string[]
    /**
     * Переопределяет `config.ssr` для этого маршрута.
     *
     * - `false` — SPA: без SSR-рендера, без server middleware, без prefetch
     *   на сервере. Клиент сам делает `clientPrefetch` + `createRoot`.
     * - `undefined` / `true` — наследует `config.ssr`.
     *
     * `index: true` + `ssr: false` — ошибка (индексная страница должна быть SSR).
     * При `config.ssr: false` игнорируется (весь проект — SPA).
     */
    ssr?: boolean
}

/**
 * Публичный конфиг маршрута для клиента.
 *
 * JSON-safe проекция `TustenRoute`. Одна и та же форма приходит в root controller
 * на сервере и на клиенте — иначе SSR и гидрация разойдутся.
 */
export interface TustenClientRoute {
    /** Идентификатор маршрута. */
    id: string
    /** URL-путь. */
    path: string
    /** Заголовок из `metaConfig.title` (или дефолт). */
    title: string
    /** `description` из `metaConfig.meta` (или `null`). */
    description: string | null
    /** Родительский маршрут. */
    parentId?: string
    /** Цепочка предков от корня к родителю (id). */
    parentIds: string[]
    /** Индексная страница (единственная глобально). */
    index?: boolean
    /** Сегменты URL, если заданы. */
    slug?: string[]
    /** Переопределение SSR для маршрута. */
    ssr?: boolean
    /** Пользовательские данные маршрута. */
    meta: Record<string, unknown>
    /** SEO-конфиг маршрута. */
    metaConfig: MetaConfig | null
    /** Конфиг контента: шаблон и prefetch-пайплайн. */
    contentConfig: TustenRoute['contentConfig']
    /** Унаследованная цепочка middleware. */
    middleware: MiddlewareDef[]
    /** Цепочка layout-спек (root → leaf). */
    layoutChain: string[]
}

/**
 * Роутер-контекст для клиента (state в `RootProvider`).
 *
 * Используется хуками `useRouter`, `useParams`, `useQuery`, `usePathname`.
 */
export interface TustenClientRouter {
    /** Текущий путь. */
    path: string
    /** Динамические сегменты (Phase 2.5, сейчас пусто). */
    params: Record<string, string>
    /** Query-параметры. */
    query: Record<string, string>
    /** id текущего маршрута. */
    routeId: string
}

/**
 * Объект `router`, передаваемый в `getConfig` и `loadData` через `ctx`.
 */
export interface TustenRouter {
    /** Идентификатор текущего маршрута. */
    id: string
    /** Полный URL-путь. */
    path: string
    /** Динамические сегменты URL (Phase 3). */
    params: Record<string, string>
    /** Query-параметры. */
    query: Record<string, string>
    /** Сырой request (FastifyRequest на сервере, обёртка на клиенте). */
    request: unknown
}

/** Скомпилированный паттерн маршрута. */
export interface CompiledRoute {
    /** id маршрута. */
    id: string
    /** Оригинальный паттерн (`/blog/:slug`). */
    path: string
    /** Источник regex без флагов (`^/blog/([^/]+)$`). */
    regexSource: string
    /** Имена параметров в порядке появления. */
    paramNames: string[]
}

/**
 * Построенное дерево маршрутов: карта `id → путь` и индексный маршрут.
 */
export interface RouteTree {
    /** Все маршруты по `id`. */
    byId: Map<string, TustenRoute>
    /** URL-путь для каждого `id`. */
    paths: Map<string, string>
    /** `id` индексного маршрута (единственного глобально), если он есть. */
    indexRouteId: string | null
    /** Скомпилированные паттерны (для `matchRoute`). */
    compiled: CompiledRoute[]
    /** Цепочка layout-спек (root → leaf) для каждого маршрута. */
    layoutChains: Map<string, string[]>
}
