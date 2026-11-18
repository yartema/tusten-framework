import type { FastifyServerOptions } from 'fastify'
import type { UserConfig } from 'vite'
import type { MiddlewareDef } from './middleware'
import type { ResolvedRpcOptions, RpcOptions } from './rpc'

/**
 * Настройки контейнера, в который монтируется приложение.
 *
 * Контейнер нужен React для гидрации/`createRoot`. По умолчанию это
 * `<div id="root" data-tusten-root>`. Тег и id можно поменять, а `id: false`
 * убирает id — клиент найдёт контейнер по `data-tusten-root`.
 */
export interface TustenRootElementConfig {
    /** HTML-тег контейнера. По умолчанию `div`; допускаются `main`, `section`, custom elements. */
    tag?: string
    /** id контейнера. `false` или пустая строка — без id. По умолчанию `root`. */
    id?: string | false
    /** Атрибуты контейнера: `class`, `data-*`, `aria-*`, `style` и т.п. */
    attributes?: Record<string, string | number | boolean>
}

/** Нормализованный контейнер приложения. */
export interface ResolvedRootElement {
    /** HTML-тег. */
    tag: string
    /** id или `null`, если id отключён. */
    id: string | null
    /** Дополнительные атрибуты (без `id` и `data-tusten-root`). */
    attributes: Record<string, string | number | boolean>
}

/**
 * Корень приложения: React-оболочка и DOM-контейнер.
 *
 * Объектная форма:
 * ```ts
 * root: { component: 'Page/Controller:Root', container: { id: 'app' } }
 * ```
 * Строка — короткая форма только для `component`.
 */
export interface TustenRootConfig {
    /** Root controller: `<file>:<export>` относительно `clientDir`, без `./`. */
    component?: string
    /** DOM-контейнер приложения. */
    container?: TustenRootElementConfig
}

/** Нормализованный корень приложения. */
export interface ResolvedRootConfig {
    /** Root controller или `null`, если не задан. */
    component: string | null
    /** DOM-контейнер (всегда с дефолтами). */
    container: ResolvedRootElement
}

/** Поддерживаемые кодировки сжатия. */
export type TustenCompressEncoding = 'br' | 'gzip'

/**
 * Настройки сжатия HTTP-ответов.
 *
 * Сжатие включено по умолчанию; `server.compress: false` полностью выключает
 * его (например, когда сжимает прокси или CDN).
 */
export interface TustenCompressConfig {
    /** Минимальный размер тела, ниже которого сжатие не применяется. По умолчанию 1024. */
    threshold?: number
    /** Кодировки в порядке предпочтения. По умолчанию `['br', 'gzip']`. */
    encodings?: TustenCompressEncoding[]
    /**
     * Сжимать ли стримируемый SSR-документ. По умолчанию `true`.
     *
     * SPA-shell и 404 сжимаются независимо от этого флага: они отдаются готовым
     * телом, а не стримом.
     */
    ssr?: boolean
}

/** Нормализованные настройки сжатия. */
export interface ResolvedCompressOptions {
    /** Минимальный размер тела. */
    threshold: number
    /** Кодировки в порядке предпочтения. */
    encodings: TustenCompressEncoding[]
    /** Сжимать ли SSR-стрим. */
    ssr: boolean
}

/**
 * Конфигурация фреймворка, задаваемая в `tusten.config.ts`
 * через `defineConfig`.
 */
export interface TustenConfig {
    /** Включён ли SSR. Если `false` — приложение работает как SPA. */
    ssr?: boolean
    /**
     * Каталог статики, отдаваемый с корня сайта. По умолчанию `public`
     * (рядом с `client` и `server`).
     *
     * Vite обслуживает его в dev и копирует в `dist/client` при сборке;
     * в prod содержимое каталога раздаётся как есть (файлы с хэшем — immutable,
     * остальные — `no-cache`). `false` отключает каталог.
     */
    publicDir?: string | false
    /** Настройки клиента. */
    client?: {
        /** Каталог клиентского кода. По умолчанию `client`. */
        clientDir?: string
        /**
         * Корень приложения: root controller и DOM-контейнер.
         * Строка — короткая форма для `component`.
         * Не задан — без root controller, контейнер `<div id="root" data-tusten-root>`.
         */
        root?: string | TustenRootConfig
        /**
         * CSS-файлы, подключаемые при запуске приложения (пути относительно `clientDir`).
         * Обычно содержат Tailwind-директивы и глобальные стили.
         */
        css?: string[]
        /**
         * Компоненты-обёртки. Пути от `clientDir` в формате `<file>:<export>`
         * (или `<file>` для default).
         */
        components?: {
            /** Fallback для ErrorBoundary. */
            error?: string
            /** Показывается во время первого SPA-prefetch (`?noSSR` / `ssr: false`). */
            loading?: string
            /** Рендерится при 404 (SSR). */
            notFound?: string
        }
    }
    /** Настройки HTTP-сервера (Fastify). */
    server?: {
        /** Каталог серверного кода. По умолчанию `server`. */
        serverDir?: string
        /** Порт. По умолчанию `3000`. */
        port?: number
        /** Хост. По умолчанию `localhost`. */
        host?: string
        /** Путь до файла с `defineServerRoutes([...])`. */
        routes?: string
        /** Путь до каталога с Fastify-плагинами. */
        plugins?: string
        /** Настройки JSON-RPC 2.0. `false` — отключить. */
        rpc?: false | RpcOptions
        /**
         * Сжатие HTTP-ответов. По умолчанию включено (brotli + gzip).
         * `false` — выключить (если сжимает прокси/CDN).
         */
        compress?: false | TustenCompressConfig
    }
    /** Глобальные middleware (client / server / both). */
    middleware?: MiddlewareDef[]
    /**
     * Мерж в пользовательскую Vite-конфигурацию (dev-сервер и обе сборки).
     *
     * `root`, `configFile`, `appType` и `plugins` (частично) фреймворк
     * задаёт сам — они переопределяются поверх этого объекта.
     */
    vite?: UserConfig
    /** Настройки сборки. */
    build?: {
        outDir?: string
    }
    /** Публичные и приватные переменные окружения (Phase 2). */
    runtimeConfig?: {
        public?: Record<string, unknown>
    }
    /**
     * Прямой проброс в `Fastify(opts)`.
     *
     * Примеры:
     *   - `logger: false` — отключить Fastify-логи;
     *   - `trustProxy: true` — за прокси;
     *   - `bodyLimit: 1048576` — размер тела запроса;
     *   - `disableRequestLogging: true` — тише.
     *
     * Дефолт: `{ logger: { level: 'info' } }`.
     */
    fastify?: FastifyServerOptions
    /**
     * Локализация клиентских модулей (`import rk from 'i18n!<Module>'`). Без этого поля фича
     * отключена: `rk(key)` возвращает `key` без поиска словарей.
     */
    i18n?: TustenI18nConfig
}

/**
 * Настройки i18n, задаваемые в `defineConfig({ i18n: {...} })`.
 */
export interface TustenI18nConfig {
    /** Имя cookie с выбранным языком. По умолчанию `lang`; валидируется при загрузке конфига (RFC 6265). */
    key?: string
    /** Основной язык. Ключи в коде — тексты на этом языке. Обязан входить в `locales`. */
    defaultLocale: string
    /** Все поддерживаемые языки. Словари ищутся по `lang/<locale>/<locale>.json`. */
    locales: string[]
}

/**
 * Конфиг после нормализации: все обязательные поля заполнены дефолтами.
 *
 * Используется внутри фреймворка (сканер, дерево маршрутов, манифест,
 * серверный рантайм) — там, где хочется видеть конкретные значения,
 * а не `undefined`.
 */
export interface ResolvedTustenConfig {
    // Флаг, включен ли SSR
    ssr: boolean
    // Каталог статики относительно корня проекта; null — отключён
    publicDir: string | null
    // Настройки клиента
    client: {
        // Название папки клиента в корне проекта, по умолчанию client
        clientDir: string
        // Массив путей до css файлов, которые подключаются по запуске приложения
        css: string[]
        // Корень приложения: root controller и контейнер
        root: ResolvedRootConfig
        // Пути до общих компонентов
        components: {
            error: string | null
            loading: string | null
            notFound: string | null
        }
    }
    // Настройки сервера
    server: {
        // Название папки сервера в корне проекта, по умолчанию server
        serverDir: string
        // Порт
        port: number
        // Хост
        host: string
        routes: string | null
        plugins: string | null
        rpc: ResolvedRpcOptions
        // Сжатие HTTP-ответов; null — выключено
        compress: ResolvedCompressOptions | null
    }
    middleware: MiddlewareDef[]
    vite: UserConfig
    build: {
        outDir: string
    }
    runtimeConfig: {
        public: Record<string, unknown>
    }
    fastify?: FastifyServerOptions
    /** Нормализованные настройки i18n; `null` — фича отключена. */
    i18n: TustenI18nConfig | null
}
