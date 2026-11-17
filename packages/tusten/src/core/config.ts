import path from 'node:path'
import { createJiti } from 'jiti'
import type {
    TustenConfig,
    ResolvedTustenConfig,
    TustenI18nConfig,
    TustenRootConfig,
    TustenRootElementConfig,
    ResolvedRootConfig,
    ResolvedRootElement,
} from '../types'
import { TustenError } from './errors'
import { fileExists } from '../utils/fs'
import { isValidCookieName, isValidLocale, LOCALE_COOKIE } from './locale'

/**
 * Нормализует имя cookie с выбранным языком.
 *
 * `undefined` / `null` — дефолт `LOCALE_COOKIE`. Строка обрезается по краям:
 * случайные пробелы в конфиге не должны ломать запись `document.cookie`.
 *
 * @param key значение `i18n.key`.
 * @returns валидное имя cookie.
 * @throws {TustenError} если `key` задан, но не является валидным именем cookie.
 */
function normalizeI18nKey(key: unknown): string {
    if (key === undefined || key === null) return LOCALE_COOKIE

    const value = typeof key === 'string' ? key.trim() : key
    if (!isValidCookieName(value)) {
        throw new TustenError(
            `i18n.key must be a valid cookie name (RFC 6265 token, e.g. "lang"), got "${String(key)}"`,
        )
    }
    return value
}

/**
 * Нормализует секцию `i18n`. Отсутствие секции — не ошибка, а выключенная фича.
 *
 * @param raw сырой объект из `tusten.config.ts`.
 * @returns нормализованные настройки или `null`.
 * @throws {TustenError} если `locales` пуст, содержит некорректный формат,
 *   `defaultLocale` не входит в `locales` или `key` не является валидным именем cookie.
 */
export function normalizeI18n(raw: TustenI18nConfig | undefined): TustenI18nConfig | null {
    if (raw === undefined) return null

    const { defaultLocale, locales } = raw
    if (!Array.isArray(locales) || locales.length === 0) {
        throw new TustenError('i18n.locales must be a non-empty array of locale codes')
    }
    for (const locale of locales) {
        if (!isValidLocale(locale)) {
            throw new TustenError(
                `i18n.locales contains invalid locale "${String(locale)}" (expected e.g. "en", "pt-BR")`,
            )
        }
    }
    if (!locales.includes(defaultLocale)) {
        throw new TustenError(
            `i18n.defaultLocale "${defaultLocale}" must be one of i18n.locales [${locales.join(', ')}]`,
        )
    }

    // Дубликаты не несут смысла и могли бы породить двойные записи в реестре словарей.
    return { defaultLocale, locales: [...new Set(locales)], key: normalizeI18nKey(raw.key) }
}

/**
 * Убирает необязательный `./` у путей относительно `clientDir`.
 *
 * В конфиге пути задаются от клиентского каталога (`App:Root`,
 * `layouts/Main.tsx`), поэтому `./` — лишний шум. Оставляем поддержку
 * старого вида, чтобы существующие конфиги не ломались.
 *
 * @param value путь из конфига.
 * @returns путь без ведущего `./`.
 */
function normalizeClientRelativePath(value: string): string {
    return value.replace(/^\.\//, '')
}

/** Теги, которые нельзя использовать как контейнер приложения. */
const FORBIDDEN_ROOT_TAGS = new Set(['html', 'head', 'body', 'script', 'style', 'title', 'meta', 'link', 'base'])

/** Имя HTML-атрибута. */
const ATTRIBUTE_NAME_RE = /^[a-zA-Z_:][a-zA-Z0-9_:.-]*$/

/**
 * Нормализует настройки контейнера приложения.
 *
 * Контейнер — обычный DOM-элемент, в который `hydrateRoot`/`createRoot`
 * монтирует React. Менять можно тег, id и атрибуты; `data-tusten-root`
 * зарезервирован — по нему клиент находит контейнер, если id отключён.
 *
 * @param raw сырые настройки `client.root.container`.
 * @returns нормализованный контейнер.
 * @throws {TustenError} при недопустимом теге, id или имени/значении атрибута.
 */
function normalizeRootElement(raw: TustenRootElementConfig | undefined): ResolvedRootElement {
    const tag = (raw?.tag ?? 'div').trim().toLowerCase()
    if (!/^[a-z][a-z0-9-]*$/.test(tag) || FORBIDDEN_ROOT_TAGS.has(tag)) {
        throw new TustenError(
            `client.root.container.tag must be a regular/custom HTML tag (e.g. "div", "main", "app-root"), got "${String(raw?.tag)}"`,
        )
    }

    const rawId = raw?.id
    const id = rawId === false ? null : (rawId ?? 'root').trim() || null
    if (id !== null && /[\s"'<>]/.test(id)) {
        throw new TustenError(`client.root.container.id contains invalid characters: "${id}"`)
    }

    const attributes: Record<string, string | number | boolean> = {}
    for (const [name, value] of Object.entries(raw?.attributes ?? {})) {
        // `id` задаётся отдельным полем, `data-tusten-root` — служебный маркер.
        if (name === 'id' || name === 'data-tusten-root') {
            throw new TustenError(`client.root.container.attributes: "${name}" is reserved`)
        }
        if (!ATTRIBUTE_NAME_RE.test(name)) {
            throw new TustenError(`client.root.container.attributes: invalid attribute name "${name}"`)
        }
        // Обработчики событий в статичном HTML — источник XSS, а не «атрибут».
        if (/^on/i.test(name)) {
            throw new TustenError(`client.root.container.attributes: event handler "${name}" is not allowed`)
        }
        if (value === undefined || value === null || value === false) continue
        if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
            throw new TustenError(`client.root.container.attributes["${name}"] must be string, number or boolean`)
        }
        attributes[name] = value
    }

    // Детерминированный HTML: одинаковый порядок атрибутов между запросами.
    const sorted = Object.fromEntries(Object.entries(attributes).sort(([a], [b]) => a.localeCompare(b)))
    return { tag, id, attributes: sorted }
}

/**
 * Нормализует корень приложения: root controller и DOM-контейнер.
 *
 * Поддерживается короткая форма `root: 'Page/Controller:Root'`; объектная форма
 * позволяет отдельно настроить контейнер.
 *
 * @param raw значение `client.root`.
 * @returns нормализованный root.
 * @throws {TustenError} при некорректном контейнере.
 */
function normalizeRoot(raw: string | TustenRootConfig | undefined): ResolvedRootConfig {
    const short = typeof raw === 'string' ? raw : undefined
    const object = typeof raw === 'object' && raw !== null ? raw : undefined
    const component = short
        ? normalizeClientRelativePath(short)
        : object?.component
          ? normalizeClientRelativePath(object.component)
          : null
    const container = normalizeRootElement(object?.container)
    return { component, container }
}

/**
 * Загружает `tusten.config.ts` из указанного каталога.
 *
 * Использует `jiti` для поддержки TypeScript без предварительной сборки.
 *
 * @param projectDir корень проекта (где лежит `tusten.config.ts`).
 * @returns нормализованный конфиг с дефолтами.
 * @throws {TustenError} если конфиг не найден или не экспортирует объект.
 */
export async function loadConfig(projectDir: string): Promise<ResolvedTustenConfig> {
    const configPath = path.join(projectDir, 'tusten.config.ts')
    const altPath = path.join(projectDir, 'tusten.config.js')

    // Ищем .ts, потом .js.
    const target = (await fileExists(configPath)) ? configPath : (await fileExists(altPath)) ? altPath : null

    if (!target) {
        throw new TustenError(`Config not found: expected "tusten.config.ts" or "tusten.config.js" in ${projectDir}`)
    }

    // jiti грузит TS/ESM и возвращает default export.
    const jiti = createJiti(import.meta.url, {
        interopDefault: true,
        jsx: true,
    })

    // jiti с `export default null` может упасть внутри (Cannot read 'then').
    // Ловим и превращаем в понятную ошибку.
    let mod: TustenConfig | undefined
    try {
        const moduleNs = (await jiti.import(target)) as { default?: TustenConfig } | null | undefined
        mod = moduleNs?.default
    } catch {
        mod = undefined
    }

    if (!mod || typeof mod !== 'object' || Array.isArray(mod)) {
        throw new TustenError(`Config at ${target} must export a default object`)
    }

    // Нормализуем дефолты — единая точка, где заданы значения по умолчанию.
    const rpcConfig = mod.server?.rpc

    // Удалённые настройки: не поддерживаем, но подсказываем, куда переехали.
    const legacyClient = mod.client as { layouts?: unknown; rootElement?: unknown } | undefined
    if (legacyClient?.layouts !== undefined) {
        console.warn(
            '[tusten] client.layouts is removed and ignored. ' +
                'Declare layout in defineRoute(...): { layout: "Page/Layout:Main" }.',
        )
    }
    if (legacyClient?.rootElement !== undefined) {
        console.warn('[tusten] client.rootElement is removed and ignored. ' + 'Use client.root.container instead.')
    }

    return {
        ssr: mod.ssr ?? true,
        client: {
            clientDir: mod.client?.clientDir ?? 'client',
            css: mod.client?.css ?? [],
            root: normalizeRoot(mod.client?.root),
            components: {
                error: mod.client?.components?.error ?? null,
                loading: mod.client?.components?.loading ?? null,
                notFound: mod.client?.components?.notFound ?? null,
            },
        },
        server: {
            serverDir: mod.server?.serverDir ?? 'server',
            port: mod.server?.port ?? 3000,
            host: mod.server?.host ?? 'localhost',
            routes: mod.server?.routes ?? null,
            plugins: mod.server?.plugins ?? null,
            rpc:
                rpcConfig === false
                    ? {
                          enabled: false,
                          url: '/service',
                          describe: false,
                          extendContext: undefined,
                      }
                    : {
                          enabled: rpcConfig?.enabled ?? true,
                          url: rpcConfig?.url ?? '/service',
                          describe: rpcConfig?.describe ?? true,
                          extendContext: rpcConfig?.extendContext,
                      },
        },
        middleware: mod.middleware ?? [],
        vite: mod.vite ?? {},
        build: { outDir: mod.build?.outDir ?? 'dist' },
        runtimeConfig: { public: mod.runtimeConfig?.public ?? {} },
        fastify: mod.fastify ?? {},
        i18n: normalizeI18n(mod.i18n),
    }
}
