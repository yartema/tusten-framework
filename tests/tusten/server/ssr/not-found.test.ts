import { createElement, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { RootProviderProps } from '../../../../packages/tusten/src/server/ssr/contracts'
import type { I18nRequest } from '../../../../packages/tusten/src/server/ssr/i18n-request'
import { renderNotFoundBody } from '../../../../packages/tusten/src/server/ssr/not-found'
import type { ResolvedTustenConfig } from '../../../../packages/tusten/src/types'

/** Конфиг с опциональными компонентами. */
function makeConfig(options: { root?: string | null; notFound?: string | null } = {}): ResolvedTustenConfig {
    return {
        ssr: true,
        client: {
            clientDir: 'client',
            css: [],
            root: { component: options.root ?? null, container: { tag: 'div', id: 'root', attributes: {} } },
            components: { error: null, loading: null, notFound: options.notFound ?? null },
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
        i18n: null,
    }
}

/** Прозрачная оболочка вместо RootProvider. */
function RootProvider(props: RootProviderProps) {
    return props.children
}

/** Дефолтная 404-страница. */
function RootNotFound() {
    return createElement('h1', null, 'default-404')
}

/** Реестр-заглушка. */
class FakeRegistry {}

const i18n = { loadDictionaries: vi.fn(() => Promise.resolve()) } as unknown as I18nRequest

describe('renderNotFoundBody', () => {
    it('рендерит дефолтный 404 без root controller', async () => {
        const html = await renderNotFoundBody({
            url: '/nope',
            query: {},
            config: makeConfig(),
            SliceRegistry: FakeRegistry,
            RootProvider,
            RootNotFound,
            loadModuleCached: vi.fn(),
            i18n,
        })

        expect(html).toContain('default-404')
        expect(i18n.loadDictionaries).toHaveBeenCalled()
    })

    it('рендерит кастомный notFound', async () => {
        const loadModuleCached = vi.fn(() => Promise.resolve(() => createElement('h1', null, 'custom-404')))

        const html = await renderNotFoundBody({
            url: '/nope',
            query: { a: '1' },
            config: makeConfig({ notFound: 'shared/NotFound' }),
            SliceRegistry: FakeRegistry,
            RootProvider,
            RootNotFound,
            loadModuleCached,
            i18n,
        })

        expect(html).toContain('custom-404')
    })

    it('откатывается на дефолт, если кастомный notFound не компонент', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const loadModuleCached = vi.fn(() => Promise.resolve({ broken: true }))

        const html = await renderNotFoundBody({
            url: '/nope',
            query: {},
            config: makeConfig({ notFound: 'shared/NotFound' }),
            SliceRegistry: FakeRegistry,
            RootProvider,
            RootNotFound,
            loadModuleCached,
            i18n,
        })

        expect(html).toContain('default-404')
        expect(warn).toHaveBeenCalled()
        warn.mockRestore()
    })

    it('root controller оборачивает 404', async () => {
        const loadModuleCached = vi.fn((spec: string) => {
            if (spec === 'shared/root') {
                return Promise.resolve((props: { children?: ReactNode }) =>
                    createElement('div', { 'data-root': 'yes' }, props.children),
                )
            }
            return Promise.resolve(undefined)
        })

        const html = await renderNotFoundBody({
            url: '/nope',
            query: {},
            config: makeConfig({ root: 'shared/root' }),
            SliceRegistry: FakeRegistry,
            RootProvider,
            RootNotFound,
            loadModuleCached,
            i18n,
        })

        expect(html).toContain('data-root="yes"')
        expect(html).toContain('default-404')
    })

    it('root controller не компонент — ошибка', async () => {
        const loadModuleCached = vi.fn(() => Promise.resolve('nope'))

        await expect(
            renderNotFoundBody({
                url: '/nope',
                query: {},
                config: makeConfig({ root: 'shared/root' }),
                SliceRegistry: FakeRegistry,
                RootProvider,
                RootNotFound,
                loadModuleCached,
                i18n,
            }),
        ).rejects.toThrow('Root controller is not a component: shared/root')
    })
})
