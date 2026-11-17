import { describe, expect, it, vi } from 'vitest'
import { buildRouteTree } from '../../../packages/tusten/src/core/route-tree'
import type { MiddlewareDef, ResolvedTustenConfig, TustenRoute } from '../../../packages/tusten/src/types'

/**
 * Переопределения конфига: верхний уровень — shallow, `client`/`server` — частично.
 */
type ConfigOverrides = Partial<Omit<ResolvedTustenConfig, 'client' | 'server'>> & {
    client?: Partial<ResolvedTustenConfig['client']>
    server?: Partial<ResolvedTustenConfig['server']>
}

/**
 * Минимальный `ResolvedTustenConfig` для тестов.
 *
 * Поля, которые не важны для `buildRouteTree`, заполнены дефолтами.
 * Если `ResolvedTustenConfig` расширится — добавьте поля сюда.
 *
 * @param overrides переопределения.
 * @returns конфиг.
 */
function makeConfig(overrides: ConfigOverrides = {}): ResolvedTustenConfig {
    const base: ResolvedTustenConfig = {
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
            host: '0.0.0.0',
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

    return {
        ...base,
        ...overrides,
        client: { ...base.client, ...overrides.client },
        server: { ...base.server, ...overrides.server },
    }
}

/**
 * Фабрика маршрута с дефолтами.
 *
 * @param partial обязательные поля + override.
 * @returns полный `TustenRoute`.
 */
function makeRoute(partial: Partial<TustenRoute> & { id: string; type?: string }): TustenRoute {
    return {
        contentConfig: {
            workspaceConfig: { template: `${partial.id}/view:View` },
            prefetchConfig: { configLoader: `${partial.id}/Factories/Root` },
        },
        ...partial,
    }
}

/**
 * Обёртка `buildRouteTree` — принимает массив маршрутов и config.
 *
 * @param routes маршруты.
 * @param config конфиг (по умолчанию — минимальный).
 * @param loaderModules global loaders (для A3).
 * @returns дерево.
 */
function build(
    routes: TustenRoute[],
    config: ResolvedTustenConfig = makeConfig(),
    loaderModules: Array<{ file: string; map: Record<string, unknown> }> = [],
) {
    return buildRouteTree([{ file: 'test/router.ts', routes }], loaderModules, config)
}

describe('buildRouteTree', () => {
    describe('базовые случаи', () => {
        it('пустой массив маршрутов — пустое дерево', () => {
            const tree = build([])
            expect(tree.byId.size).toBe(0)
            expect(tree.paths.size).toBe(0)
            expect(tree.indexRouteId).toBeNull()
            expect(tree.compiled).toEqual([])
        })

        it('один index-маршрут', () => {
            const route = makeRoute({ id: 'home', index: true })
            const tree = build([route])
            expect(tree.byId.size).toBe(1)
            expect(tree.indexRouteId).toBe('home')
            expect(tree.paths.get('home')).toBe('/')
        })

        it('статический маршрут', () => {
            const route = makeRoute({ id: 'about' })
            const tree = build([route])
            expect(tree.paths.get('about')).toBe('/about')
        })

        it('вложенный по parentId', () => {
            const parent = makeRoute({ id: 'admin' })
            const child = makeRoute({ id: 'users', parentId: 'admin' })
            const tree = build([parent, child])
            expect(tree.paths.get('users')).toBe('/admin/users')
        })
    })

    describe('валидация: id', () => {
        it('бросает на дубле id', () => {
            const a = makeRoute({ id: 'x' })
            const b = makeRoute({ id: 'x' })
            expect(() => build([a, b])).toThrow(/Duplicate route id "x"/)
        })
    })

    describe('валидация: parentId', () => {
        it('бросает на неизвестный parentId', () => {
            const route = makeRoute({ id: 'x', parentId: 'ghost' })
            expect(() => build([route])).toThrow(/references unknown parentId "ghost"/)
        })

        it('бросает на цикл из 2 маршрутов', () => {
            const a = makeRoute({ id: 'a', parentId: 'b' })
            const b = makeRoute({ id: 'b', parentId: 'a' })
            expect(() => build([a, b])).toThrow(/Cycle detected/)
        })

        it('бросает на цикл из 3 маршрутов', () => {
            const a = makeRoute({ id: 'a', parentId: 'c' })
            const b = makeRoute({ id: 'b', parentId: 'a' })
            const c = makeRoute({ id: 'c', parentId: 'b' })
            expect(() => build([a, b, c])).toThrow(/Cycle detected/)
        })
    })

    describe('валидация: index', () => {
        it('бросает на несколько index', () => {
            const a = makeRoute({ id: 'a', index: true })
            const b = makeRoute({ id: 'b', index: true })
            expect(() => build([a, b])).toThrow(/Multiple index routes/)
        })
    })

    describe('валидация: layout', () => {
        it('пустая спека — TustenError', () => {
            const route = makeRoute({ id: 'x', layout: '   ' })
            expect(() => build([route])).toThrow(/layout spec must be a non-empty string/)
        })

        it('удалённый type — warning и пустая цепочка', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
            const route = { ...makeRoute({ id: 'legacy' }), type: 'main' } as TustenRoute

            const tree = build([route])

            expect(tree.layoutChains.get('legacy')).toEqual([])
            expect(warn).toHaveBeenCalledWith(expect.stringContaining('"type" is removed'))
            warn.mockRestore()
        })
    })

    describe('валидация: ssr + index', () => {
        it('бросает на index + ssr: false', () => {
            const route = makeRoute({
                id: 'home',
                index: true,
                ssr: false,
            })
            expect(() => build([route])).toThrow(/"index: true" cannot have "ssr: false"/)
        })
    })

    describe('валидация: path + slug', () => {
        it('бросает на path + slug одновременно', () => {
            const route = makeRoute({
                id: 'x',
                path: '/x',
                slug: ['y'],
            })
            expect(() => build([route])).toThrow(/cannot have both "path" and "slug"/)
        })
    })

    describe('валидация: URL-коллизии', () => {
        it('бросает на дубль URL-паттерна', () => {
            const a = makeRoute({ id: 'a', path: '/same' })
            const b = makeRoute({ id: 'b', path: '/same' })
            expect(() => build([a, b])).toThrow(/Duplicate URL pattern/)
        })

        it('бросает на regex-коллизию', () => {
            const a = makeRoute({ id: 'a', path: '/:id' })
            const b = makeRoute({ id: 'b', path: '/:slug' })
            // Оба ^/([^/]+)$ — та же regex, но разные имена параметров
            expect(() => build([a, b])).toThrow(/Ambiguous URL regex/)
        })
    })

    describe('layoutChains', () => {
        it('одиночный layout', () => {
            const route = makeRoute({ id: 'home', layout: 'Page/Layout:Main', index: true })
            const tree = build([route])
            expect(tree.layoutChains.get('home')).toEqual(['Page/Layout:Main'])
        })

        it('без layout — пустая цепочка', () => {
            const route = makeRoute({ id: 'plain' })
            const tree = build([route])
            expect(tree.layoutChains.get('plain')).toEqual([])
        })

        it('child наследует layout родителя', () => {
            const parent = makeRoute({ id: 'home', layout: 'Page/Layout:Main', index: true })
            const child = makeRoute({ id: 'about', parentId: 'home' })
            const tree = build([parent, child])
            expect(tree.layoutChains.get('about')).toEqual(['Page/Layout:Main'])
        })

        it('строка заменяет унаследованную цепочку', () => {
            const parent = makeRoute({ id: 'home', layout: 'Page/Layout:Main', index: true })
            const child = makeRoute({ id: 'admin', parentId: 'home', layout: 'Admin/Layout:Admin' })
            const tree = build([parent, child])
            expect(tree.layoutChains.get('admin')).toEqual(['Admin/Layout:Admin'])
        })

        it('массив задаёт вложенность', () => {
            const parent = makeRoute({ id: 'home', layout: 'Page/Layout:Main', index: true })
            const child = makeRoute({
                id: 'admin',
                parentId: 'home',
                layout: ['Page/Layout:Main', 'Admin/Layout:Admin'],
            })
            const tree = build([parent, child])
            expect(tree.layoutChains.get('admin')).toEqual(['Page/Layout:Main', 'Admin/Layout:Admin'])
        })

        it('false сбрасывает унаследованный layout', () => {
            const parent = makeRoute({ id: 'home', layout: 'Page/Layout:Main', index: true })
            const child = makeRoute({ id: 'plain', parentId: 'home', layout: false })
            const tree = build([parent, child])
            expect(tree.layoutChains.get('plain')).toEqual([])
        })

        it('layout с ./ нормализуется', () => {
            const route = makeRoute({ id: 'home', layout: './layouts/Main:Main' })
            const tree = build([route])
            expect(tree.layoutChains.get('home')).toEqual(['layouts/Main:Main'])
        })

        it('дубликаты подряд удаляются', () => {
            const route = makeRoute({
                id: 'home',
                layout: ['Page/Layout:Main', 'Page/Layout:Main', 'Admin/Layout:Admin'],
            })
            const tree = build([route])
            expect(tree.layoutChains.get('home')).toEqual(['Page/Layout:Main', 'Admin/Layout:Admin'])
        })

        it('трёхуровневая цепочка', () => {
            const root = makeRoute({ id: 'root', layout: 'l/Main', index: true })
            const mid = makeRoute({ id: 'admin', parentId: 'root', layout: ['l/Main', 'l/Admin'] })
            const leaf = makeRoute({
                id: 'users',
                parentId: 'admin',
                layout: ['l/Main', 'l/Admin', 'l/Panel'],
            })
            const tree = build([root, mid, leaf])
            expect(tree.layoutChains.get('users')).toEqual(['l/Main', 'l/Admin', 'l/Panel'])
        })
    })

    describe('compiled', () => {
        it('компилирует статический маршрут', () => {
            const route = makeRoute({ id: 'home', index: true })
            const tree = build([route])
            expect(tree.compiled).toEqual([{ id: 'home', path: '/', regexSource: '^/$', paramNames: [] }])
        })

        it('компилирует slug-паттерн', () => {
            const route = makeRoute({
                id: 'blog',
                slug: ['/regex:[a-z]+'],
            })
            const tree = build([route])
            expect(tree.compiled[0].regexSource).toBe('^/blog/([a-z]+)$')
            expect(tree.compiled[0].paramNames).toEqual(['slug'])
        })
    })

    describe('middleware inheritance', () => {
        const authMw: MiddlewareDef = {
            id: 'auth',
            handler: 'client/middleware/auth',
        }
        const loggerMw: MiddlewareDef = {
            id: 'logger',
            handler: 'shared/middleware/logger',
            side: 'both',
        }

        it('родитель без middleware — у ребёнка пусто', () => {
            const parent = makeRoute({ id: 'home', index: true })
            const child = makeRoute({ id: 'admin', parentId: 'home' })
            const tree = build([parent, child])
            expect(tree.byId.get('home')?.middleware).toEqual([])
            expect(tree.byId.get('admin')?.middleware).toEqual([])
        })

        it('middleware родителя наследуется ребёнком', () => {
            const parent = makeRoute({
                id: 'home',
                index: true,
                middleware: [authMw],
            })
            const child = makeRoute({ id: 'admin', parentId: 'home' })
            const tree = build([parent, child])
            expect(tree.byId.get('home')?.middleware).toEqual([authMw])
            expect(tree.byId.get('admin')?.middleware).toEqual([authMw])
        })

        it('локальные middleware добавляются к наследованным', () => {
            const parent = makeRoute({
                id: 'home',
                index: true,
                middleware: [authMw],
            })
            const child = makeRoute({
                id: 'admin',
                parentId: 'home',
                middleware: [loggerMw],
            })
            const tree = build([parent, child])
            expect(tree.byId.get('admin')?.middleware).toEqual([authMw, loggerMw])
        })

        it('пустой массив отключает наследование', () => {
            const parent = makeRoute({
                id: 'home',
                index: true,
                middleware: [authMw],
            })
            const child = makeRoute({
                id: 'admin',
                parentId: 'home',
                middleware: [],
            })
            const tree = build([parent, child])
            expect(tree.byId.get('admin')?.middleware).toEqual([])
        })

        it('трёхуровневое наследование', () => {
            const root = makeRoute({
                id: 'root',
                index: true,
                middleware: [authMw],
            })
            const mid = makeRoute({
                id: 'mid',
                parentId: 'root',
                middleware: [loggerMw],
            })
            const leaf = makeRoute({
                id: 'leaf',
                parentId: 'mid',
            })
            const tree = build([root, mid, leaf])
            expect(tree.byId.get('leaf')?.middleware).toEqual([authMw, loggerMw])
        })
    })

    describe('A3 — коллизии global vs page', () => {
        it('бросает на дубли global loader-имени', () => {
            const loaderModules = [
                {
                    file: 'client/A.loader.ts',
                    map: { userInfo: { dataFactoryName: 'a:x' } },
                },
                {
                    file: 'client/B.loader.ts',
                    map: { userInfo: { dataFactoryName: 'b:y' } },
                },
            ]
            const route = makeRoute({ id: 'home', index: true })
            expect(() => buildRouteTree([{ file: 'r.ts', routes: [route] }], loaderModules, makeConfig())).toThrow(
                /Global loader "userInfo" is declared in both/,
            )
        })

        it('разные имена — ок', () => {
            const loaderModules = [
                {
                    file: 'client/A.loader.ts',
                    map: { userInfo: { dataFactoryName: 'a:x' } },
                },
                {
                    file: 'client/B.loader.ts',
                    map: { permissions: { dataFactoryName: 'b:y' } },
                },
            ]
            const route = makeRoute({ id: 'home', index: true })
            expect(() => buildRouteTree([{ file: 'r.ts', routes: [route] }], loaderModules, makeConfig())).not.toThrow()
        })
    })
})
