import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    getLocale,
    setLocale,
    setLocaleCookieKey,
    setLocaleResolver,
} from '../../../../packages/tusten/src/client/i18n/locale'
import { TustenError } from '../../../../packages/tusten/src/core/errors'

afterEach(() => {
    setLocaleResolver(() => undefined)
    setLocaleCookieKey(undefined)
    vi.unstubAllGlobals()
})

describe('getLocale / setLocaleResolver', () => {
    it('по умолчанию locale неизвестна', () => {
        expect(getLocale()).toBeUndefined()
    })

    it('резолвер задаёт locale', () => {
        setLocaleResolver(() => 'ru')
        expect(getLocale()).toBe('ru')
    })
})

describe('setLocale', () => {
    it('некорректная locale — TustenError (до обращения к браузеру)', () => {
        expect(() => setLocale('../etc')).toThrow(TustenError)
        expect(() => setLocale('')).toThrow(/Invalid locale/)
    })

    it('вне браузера — TustenError', () => {
        expect(() => setLocale('en')).toThrow(/only be called in the browser/)
    })

    it('в браузере — пишет cookie и перезагружает страницу', () => {
        const reload = vi.fn()
        const doc = { cookie: '' }
        vi.stubGlobal('document', doc)
        vi.stubGlobal('window', { location: { reload } })

        setLocale('pt-BR')

        expect(doc.cookie).toMatch(/^lang=pt-BR; path=\/; max-age=\d+; SameSite=Lax$/)
        expect(reload).toHaveBeenCalledOnce()
    })
})

describe('setLocaleCookieKey', () => {
    /**
     * Готовит браузерное окружение и возвращает объект `document`.
     *
     * @returns поддельный `document` для проверки `document.cookie`.
     */
    function stubBrowser(): { cookie: string } {
        const doc = { cookie: '' }
        vi.stubGlobal('document', doc)
        vi.stubGlobal('window', { location: { reload: vi.fn() } })
        return doc
    }

    it('кастомный key — cookie пишется под этим именем', () => {
        const doc = stubBrowser()
        setLocaleCookieKey('my_locale')

        setLocale('en')

        expect(doc.cookie).toMatch(/^my_locale=en; path=\/; max-age=\d+; SameSite=Lax$/)
    })

    it('undefined возвращает дефолтное имя cookie', () => {
        const doc = stubBrowser()
        setLocaleCookieKey('my_locale')
        setLocaleCookieKey(undefined)

        setLocale('en')

        expect(doc.cookie).toMatch(/^lang=en; path=\/; max-age=\d+; SameSite=Lax$/)
    })

    it('невалидный key игнорируется — остаётся дефолт', () => {
        const doc = stubBrowser()
        setLocaleCookieKey('my_locale')
        setLocaleCookieKey('bad key;path=/')

        setLocale('en')

        expect(doc.cookie).toMatch(/^lang=en; path=\/; max-age=\d+; SameSite=Lax$/)
    })

    it('key обрезается по краям', () => {
        const doc = stubBrowser()
        setLocaleCookieKey('  my_locale  ')

        setLocale('en')

        expect(doc.cookie).toMatch(/^my_locale=en; path=\/; max-age=\d+; SameSite=Lax$/)
    })
})
