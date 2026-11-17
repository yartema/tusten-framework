import { buildI18nBootScript } from '../i18n/boot'
import { resolveRequestLocale } from '../i18n/negotiate'
import type { I18nRequestContext } from '../i18n/als'
import type { I18nDictionary } from '../../client/i18n/create-rk'
import type { ResolvedTustenConfig } from '../../types'

/**
 * i18n-рантайм `tusten/client` для SSR. Берётся из того же инстанса модуля, что
 * и `RootProvider`: иначе `rk` в рендере и резолвер locale окажутся в разных копиях.
 */
export interface SSRI18nRuntime {
    /** Загружает словари всех известных `createRk`-модулей для locale. */
    loadDictionaries(locale: string): Promise<void>
    /** Словарь модуля для locale, если уже загружен. */
    getDictionary(moduleId: string, locale: string): I18nDictionary | undefined
}

/** Опции i18n-контекста запроса. */
export interface I18nRequestOptions {
    /** Рантайм; `null` — i18n выключен в конфиге. */
    runtime: SSRI18nRuntime | null
    /** Нормализованный конфиг (нужен `i18n` и его cookie-ключ). */
    config: ResolvedTustenConfig
    /** Заголовок `Cookie` запроса. */
    cookie?: string
    /** Заголовок `Accept-Language` запроса. */
    acceptLanguage?: string
}

/**
 * i18n-состояние одного запроса.
 *
 * Locale определяется один раз: cookie и заголовки не меняются посреди рендера,
 * а весь HTML (SSR, 404, SPA) должен быть на одном языке.
 */
export interface I18nRequest {
    /** Locale запроса; `undefined` — i18n выключен. */
    readonly locale: string | undefined
    /** ALS-контекст для `runWithI18nContext`; `undefined` — i18n выключен. */
    readonly ctx: I18nRequestContext | undefined
    /** `Vary` для i18n-ответов; `undefined` — i18n выключен. */
    readonly headers: Record<string, string> | undefined
    /**
     * Boot-скрипт `window.__ROOT_I18N__`: locale страницы и встроенные словари.
     *
     * @param dicts словари модулей, которые нужны гидрации этой страницы.
     * @returns HTML-строка или пустая, если i18n выключен.
     */
    bootScript(dicts?: Record<string, I18nDictionary>): string
    /**
     * Словари модулей, у которых `rk` был вызван во время рендера этого запроса.
     *
     * Вызывать только после рендера: до него набор неполный.
     *
     * @returns `moduleId → словарь` для locale запроса.
     */
    collectUsedDictionaries(): Record<string, I18nDictionary>
    /**
     * Загружает словари всех известных модулей для locale.
     *
     * Нужно до рендера: `rk` синхронный и без словаря отдаст ключи.
     *
     * @returns промис завершения загрузки.
     */
    loadDictionaries(): Promise<void>
    /**
     * `Vary` для HTML с учётом i18n.
     *
     * @param base уже существующее значение (например `Accept`).
     * @returns итоговое значение заголовка.
     */
    varyFor(base: string): string
}

/** Значение `Vary` для i18n-ответов: без него кэш вернёт чужой язык. */
const I18N_VARY = 'Accept-Language, Cookie'

/**
 * Создаёт i18n-состояние запроса.
 *
 * @param options рантайм, конфиг и заголовки запроса.
 * @returns состояние с boot-скриптом и сбором использованных словарей.
 */
export function createI18nRequest(options: I18nRequestOptions): I18nRequest {
    const { runtime, config } = options
    const locale =
        runtime && config.i18n
            ? resolveRequestLocale({ cookie: options.cookie, acceptLanguage: options.acceptLanguage }, config.i18n)
            : undefined
    const ctx: I18nRequestContext | undefined = locale !== undefined ? { locale, used: new Set<string>() } : undefined

    return {
        locale,
        ctx,
        headers: runtime ? { Vary: I18N_VARY } : undefined,

        bootScript(dicts = {}) {
            return locale !== undefined ? buildI18nBootScript(locale, dicts, config.i18n?.key) : ''
        },

        collectUsedDictionaries() {
            const out: Record<string, I18nDictionary> = {}
            if (!runtime || locale === undefined || !ctx) return out
            for (const moduleId of ctx.used) {
                const dict = runtime.getDictionary(moduleId, locale)
                if (dict) out[moduleId] = dict
            }
            return out
        },

        async loadDictionaries() {
            if (!runtime || locale === undefined) return
            await runtime.loadDictionaries(locale)
        },

        varyFor(base) {
            return runtime ? `${base}, ${I18N_VARY}` : base
        },
    }
}
