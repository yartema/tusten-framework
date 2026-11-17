// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DEV_ERROR_HOOK } from '../../../packages/tusten/src/client/dev-report'

/** Идентификатор host-элемента оверлея (совпадает с `HOST_ID` в модуле). */
const HOST_ID = '__tusten_dev_overlay__'

interface OverlayApi {
    installDevOverlay(): void
    showErrorOverlay(error: unknown, source?: string): void
}

const store = globalThis as unknown as Record<string, unknown>

/**
 * Перезагружает модуль, чтобы сбросить `installed`/`seen` между тестами.
 *
 * @returns свежий API оверлея.
 */
async function loadOverlay(): Promise<OverlayApi> {
    vi.resetModules()
    return (await import('../../../packages/tusten/src/client/dev-overlay')) as unknown as OverlayApi
}

/**
 * Shadow root текущего оверлея.
 *
 * @returns root или `null`, если оверлея нет.
 */
function overlayShadow(): ShadowRoot | null {
    return document.getElementById(HOST_ID)?.shadowRoot ?? null
}

/**
 * Устанавливает оверлей и возвращает хук, который регистрирует `installDevOverlay`.
 *
 * @returns функция показа ошибки.
 */
async function install(): Promise<(error: unknown, source?: string) => void> {
    const overlay = await loadOverlay()
    overlay.installDevOverlay()
    return store[DEV_ERROR_HOOK] as (error: unknown, source?: string) => void
}

beforeEach(() => {
    document.body.innerHTML = ''
    delete store[DEV_ERROR_HOOK]
    delete store.__TUSTEN_SSR_ERRORS__
    vi.resetModules()
})

describe('dev-overlay', () => {
    it('показывает ошибки, переданные SSR после flush', async () => {
        store.__TUSTEN_SSR_ERRORS__ = [
            {
                name: 'TypeError',
                message: 'boom',
                stack: 'TypeError: boom\n    at View (http://127.0.0.1:3000/client/View.tsx:10:2)',
            },
        ]

        const { installDevOverlay } = await loadOverlay()
        installDevOverlay()

        const shadow = overlayShadow()
        expect(shadow).not.toBeNull()
        expect(shadow?.textContent).toContain('TypeError')
        expect(shadow?.textContent).toContain('boom')
        expect(shadow?.textContent).toContain('SSR')
    })

    it('дедуплицирует одинаковые ошибки', async () => {
        const show = await install()
        const error = new Error('same')

        show(error, 'boundary')
        show(error, 'boundary')

        expect(overlayShadow()?.querySelectorAll('.card')).toHaveLength(1)
    })

    it('строит ссылку на редактор из URL модуля', async () => {
        const show = await install()
        const error = new Error('boom')
        error.stack = 'Error: boom\n    at View (http://127.0.0.1:3000/client/HomePage/View.tsx:41:17)'

        show(error, 'navigation')

        const link = overlayShadow()?.querySelector('a.loc')
        expect(link?.getAttribute('href')).toBe(
            '/__open-in-editor?file=' + encodeURIComponent('client/HomePage/View.tsx:41:17'),
        )
    })

    it('закрывается кнопкой и по Esc', async () => {
        let show = await install()
        show(new Error('one'), 'client')
        ;(overlayShadow()?.querySelector('[data-close]') as HTMLElement).dispatchEvent(
            new MouseEvent('click', { bubbles: true }),
        )
        expect(document.getElementById(HOST_ID)).toBeNull()

        show = await install()
        show(new Error('two'), 'client')
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
        expect(document.getElementById(HOST_ID)).toBeNull()
    })

    it('экранирует текст ошибки', async () => {
        const show = await install()
        show(new Error('<img src=x onerror="alert(1)">'), 'client')

        const shadow = overlayShadow()
        expect(shadow?.querySelector('img')).toBeNull()
        expect(shadow?.textContent).toContain('<img src=x')
    })

    it('показывает не-Error значения', async () => {
        const show = await install()
        show({ code: 42 }, 'client')
        show(undefined, 'client')

        expect(overlayShadow()?.textContent).toContain('42')
        expect(overlayShadow()?.textContent).toContain('undefined')
    })

    it('подсказывает про остановленный dev-сервер при сбое динамического импорта', async () => {
        const show = await install()
        show(
            new TypeError(
                'Failed to fetch dynamically imported module: http://localhost:3000/client/shared/middleware/logger.ts',
            ),
            'navigation',
        )

        expect(overlayShadow()?.textContent).toContain('dev-сервер запущен')
    })
})
