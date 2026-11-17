import { describe, expect, it, vi } from 'vitest'
import type { ComponentType } from 'react'
import { loadPageComponents } from '../../../../packages/tusten/src/server/ssr/page-data'
import type { I18nRequest } from '../../../../packages/tusten/src/server/ssr/i18n-request'
import type { TustenRoute } from '../../../../packages/tusten/src/types'

/** Маршрут с заданным шаблоном. */
function makeRoute(template = 'Page/View'): TustenRoute {
    return {
        id: 'home',
        contentConfig: {
            workspaceConfig: { template },
            prefetchConfig: { configLoader: 'Page/config' },
        },
    }
}

/** i18n-заглушка: важен только факт загрузки словарей. */
function makeI18n() {
    const loadDictionaries = vi.fn(() => Promise.resolve())
    return { i18n: { loadDictionaries } as unknown as I18nRequest, loadDictionaries }
}

/** Загрузчик, который возвращает компоненты по спеке. */
function makeLoader(overrides: Record<string, unknown> = {}) {
    const loadModuleCached = vi.fn((spec: string) => {
        if (spec in overrides) return Promise.resolve(overrides[spec])
        return Promise.resolve((() => null) as ComponentType)
    })
    return loadModuleCached
}

describe('loadPageComponents', () => {
    it('грузит шаблон, root и layouts, сохраняя порядок', async () => {
        const { i18n, loadDictionaries } = makeI18n()
        const loadModuleCached = makeLoader({
            'shared/root': () => 'root',
        })

        const result = await loadPageComponents({
            route: makeRoute(),
            layoutChain: ['layouts/Main', 'layouts/Admin'],
            rootSpec: 'shared/root',
            loadModuleCached,
            i18n,
        })

        expect(loadModuleCached.mock.calls.map(([spec]) => spec)).toEqual([
            'Page/View',
            'shared/root',
            'layouts/Main',
            'layouts/Admin',
        ])
        expect(result.Layouts).toHaveLength(2)
        expect(result.RootController).toBeTypeOf('function')
        expect(loadDictionaries).toHaveBeenCalledOnce()
    })

    it('без root controller — null и без лишней загрузки', async () => {
        const { i18n } = makeI18n()
        const loadModuleCached = makeLoader()

        const result = await loadPageComponents({
            route: makeRoute(),
            rootSpec: null,
            loadModuleCached,
            i18n,
        })

        expect(result.RootController).toBeNull()
        expect(loadModuleCached.mock.calls.map(([spec]) => spec)).toEqual(['Page/View'])
    })

    it('шаблон не компонент — понятная ошибка', async () => {
        const { i18n } = makeI18n()
        const loadModuleCached = makeLoader({ 'Page/View': { default: 1 } })

        await expect(
            loadPageComponents({ route: makeRoute(), rootSpec: null, loadModuleCached, i18n }),
        ).rejects.toThrow('Template is not a component: Page/View')
    })

    it('root controller не компонент — понятная ошибка', async () => {
        const { i18n } = makeI18n()
        const loadModuleCached = makeLoader({ 'shared/root': 'nope' })

        await expect(
            loadPageComponents({ route: makeRoute(), rootSpec: 'shared/root', loadModuleCached, i18n }),
        ).rejects.toThrow('Root controller is not a component: shared/root')
    })

    it('не-функции в layouts пропускаются', async () => {
        const { i18n } = makeI18n()
        const loadModuleCached = makeLoader({ 'layouts/Main': { not: 'a component' } })

        const result = await loadPageComponents({
            route: makeRoute(),
            layoutChain: ['layouts/Main', 'layouts/Admin'],
            rootSpec: null,
            loadModuleCached,
            i18n,
        })

        expect(result.Layouts).toHaveLength(1)
    })
})
