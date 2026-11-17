import { describe, expect, it, vi } from 'vitest'
import type { I18nDictionary } from '../../../../packages/tusten/src/client/i18n/create-rk'
import { createI18nRequest, type SSRI18nRuntime } from '../../../../packages/tusten/src/server/ssr/i18n-request'
import type { ResolvedTustenConfig } from '../../../../packages/tusten/src/types'

/** Минимальный нормализованный конфиг (i18n включается опционально). */
function makeConfig(i18n: ResolvedTustenConfig['i18n'] = null): ResolvedTustenConfig {
    return {
        ssr: true,
        client: {
            clientDir: 'client',
            css: [],
            root: { component: null, container: { tag: 'div', id: 'root', attributes: {} } },
            components: { error: null, loading: null, notFound: null },
        },
        server: {
            serverDir: 'server',
            port: 3000,
            host: 'localhost',
            routes: null,
            plugins: null,
            rpc: { enabled: true, url: '/service', describe: true },
        },
        middleware: [],
        vite: {},
        build: { outDir: 'dist' },
        runtimeConfig: { public: {} },
        i18n,
    }
}

/** Рантайм-заглушка с одним словарём. */
function makeRuntime(dicts: Record<string, I18nDictionary> = {}) {
    const loadDictionaries = vi.fn<(locale: string) => Promise<void>>(() => Promise.resolve())

    const runtime: SSRI18nRuntime = {
        loadDictionaries,
        getDictionary: (moduleId, locale) => dicts[`${moduleId}:${locale}`],
    }
    return { runtime, loadDictionaries }
}

describe('createI18nRequest: i18n выключен', () => {
    const request = createI18nRequest({
        runtime: null,
        config: makeConfig(),
        cookie: 'lang=en',
        acceptLanguage: 'en',
    })

    it('нет locale, ALS-контекста и Vary', () => {
        expect(request.locale).toBeUndefined()
        expect(request.ctx).toBeUndefined()
        expect(request.headers).toBeUndefined()
    })

    it('boot-скрипт пустой, словари не собираются', () => {
        expect(request.bootScript()).toBe('')
        expect(request.collectUsedDictionaries()).toEqual({})
    })

    it('varyFor возвращает базовое значение', () => {
        expect(request.varyFor('Accept')).toBe('Accept')
    })

    it('loadDictionaries — no-op', async () => {
        await expect(request.loadDictionaries()).resolves.toBeUndefined()
    })
})

describe('createI18nRequest: i18n включён', () => {
    const i18n = { defaultLocale: 'ru', locales: ['ru', 'en'] }

    it('locale из cookie важнее Accept-Language', () => {
        const { runtime } = makeRuntime()
        const request = createI18nRequest({
            runtime,
            config: makeConfig(i18n),
            cookie: 'lang=en',
            acceptLanguage: 'ru-RU',
        })
        expect(request.locale).toBe('en')
    })

    it('fallback на Accept-Language и defaultLocale', () => {
        const { runtime } = makeRuntime()
        const byHeader = createI18nRequest({
            runtime,
            config: makeConfig(i18n),
            acceptLanguage: 'en-US,en;q=0.9',
        })
        expect(byHeader.locale).toBe('en')

        const byDefault = createI18nRequest({ runtime, config: makeConfig(i18n) })
        expect(byDefault.locale).toBe('ru')
    })

    it('boot-скрипт содержит locale и переданные словари', () => {
        const { runtime } = makeRuntime()
        const request = createI18nRequest({ runtime, config: makeConfig(i18n), cookie: 'lang=en' })
        const html = request.bootScript({ HomePage: { hi: 'Hi' } })

        expect(html).toContain('"locale":"en"')
        expect(html).toContain('"HomePage":{"hi":"Hi"}')
    })

    it('собирает словари только использованных модулей', () => {
        const { runtime } = makeRuntime({ 'HomePage:en': { hi: 'Hi' }, 'Other:en': { x: 'X' } })
        const request = createI18nRequest({ runtime, config: makeConfig(i18n), cookie: 'lang=en' })

        request.ctx?.used.add('HomePage')

        expect(request.collectUsedDictionaries()).toEqual({ HomePage: { hi: 'Hi' } })
    })

    it('Vary учитывает locale-зависимые заголовки', () => {
        const { runtime } = makeRuntime()
        const request = createI18nRequest({ runtime, config: makeConfig(i18n) })

        expect(request.headers).toEqual({ Vary: 'Accept-Language, Cookie' })
        expect(request.varyFor('Accept')).toBe('Accept, Accept-Language, Cookie')
    })

    it('loadDictionaries грузит словари locale запроса', async () => {
        const { runtime, loadDictionaries } = makeRuntime()
        const request = createI18nRequest({ runtime, config: makeConfig(i18n), cookie: 'lang=en' })

        await request.loadDictionaries()

        expect(loadDictionaries).toHaveBeenCalledWith('en')
    })
})
