import { describe, expect, it } from 'vitest'
import { buildManifest } from '../../../packages/tusten/src/core/manifest'
import type { ResolvedTustenConfig, TustenRoute, ScanResult } from '../../../packages/tusten/src/types'

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
 * @param overrides переопределения.
 * @returns конфиг.
 */
function makeConfig(overrides: ConfigOverrides = {}): ResolvedTustenConfig {
    const base: ResolvedTustenConfig = {
        ssr: true,
        publicDir: 'public',
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
            compress: null,
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
 * Фабрика маршрута.
 *
 * @param partial обязательные + override.
 * @returns маршрут.
 */
function makeRoute(partial: Partial<TustenRoute> & { id: string }): TustenRoute {
    return {
        contentConfig: {
            workspaceConfig: { template: `${partial.id}/view:View` },
            prefetchConfig: { configLoader: `${partial.id}/Factories/Root` },
        },
        ...partial,
    }
}

/**
 * Фабрика `ScanResult` с дефолтами.
 *
 * @param overrides переопределения.
 * @returns scan.
 */
function makeScan(overrides: Partial<ScanResult> = {}): ScanResult {
    return {
        routeModules: [],
        loaderModules: [],
        ...overrides,
    }
}

describe('buildManifest', () => {
    it('пустой scan — пустой modules, но version есть', () => {
        const m = buildManifest(makeScan(), makeConfig(), '/proj/client')
        expect(m.version).toBeDefined()
        expect(m.version.length).toBeGreaterThan(0)
        expect(m.modules).toEqual({})
    })

    it('router.ts → kind: routes', () => {
        const m = buildManifest(
            makeScan({
                routeModules: [
                    {
                        file: '/proj/client/HomePage/router.ts',
                        routes: [makeRoute({ id: 'home' })],
                    },
                ],
            }),
            makeConfig(),
            '/proj/client',
        )
        expect(m.modules['HomePage/router']).toEqual({
            kind: 'routes',
            js: 'HomePage/router',
            css: [],
        })
    })

    it('*.loader.ts → kind: globalLoader', () => {
        const m = buildManifest(
            makeScan({
                loaderModules: [
                    {
                        file: '/proj/client/User.loader.ts',
                        map: { userInfo: { dataFactoryName: 'x:y' } },
                    },
                ],
            }),
            makeConfig(),
            '/proj/client',
        )
        expect(m.modules['User.loader']?.kind).toBe('globalLoader')
    })

    it('route.layout → kind: layout', () => {
        const m = buildManifest(
            makeScan({
                routeModules: [
                    {
                        file: '/proj/client/X/router.ts',
                        routes: [
                            makeRoute({
                                id: 'x',
                                layout: ['layouts/Main', 'layouts/Admin:Admin'],
                            }),
                        ],
                    },
                ],
            }),
            makeConfig(),
            '/proj/client',
        )
        expect(m.modules['layouts/Main']?.kind).toBe('layout')
        expect(m.modules['layouts/Admin']?.kind).toBe('layout')
    })

    it('template из route → kind: component', () => {
        const m = buildManifest(
            makeScan({
                routeModules: [
                    {
                        file: '/proj/client/X/router.ts',
                        routes: [
                            makeRoute({
                                id: 'x',
                                contentConfig: {
                                    workspaceConfig: { template: 'X/view:View' },
                                    prefetchConfig: { configLoader: 'X/Factories/Root' },
                                },
                            }),
                        ],
                    },
                ],
            }),
            makeConfig(),
            '/proj/client',
        )
        expect(m.modules['X/view']?.kind).toBe('component')
    })

    it('configLoader из route → kind: config', () => {
        const m = buildManifest(
            makeScan({
                routeModules: [
                    {
                        file: '/proj/client/X/router.ts',
                        routes: [
                            makeRoute({
                                id: 'x',
                                contentConfig: {
                                    workspaceConfig: { template: 'X/view:View' },
                                    prefetchConfig: { configLoader: 'X/Factories/Root' },
                                },
                            }),
                        ],
                    },
                ],
            }),
            makeConfig(),
            '/proj/client',
        )
        expect(m.modules['X/Factories/Root']?.kind).toBe('config')
    })

    it('route без prefetchConfig → только component, без config', () => {
        const m = buildManifest(
            makeScan({
                routeModules: [
                    {
                        file: '/proj/client/A/router.ts',
                        routes: [
                            {
                                id: 'a',
                                contentConfig: { workspaceConfig: { template: 'A/view:View' } },
                            },
                        ],
                    },
                ],
            }),
            makeConfig(),
            '/proj/client',
        )
        expect(m.modules['A/view']?.kind).toBe('component')
        expect(Object.values(m.modules).some((mod) => mod.kind === 'config')).toBe(false)
    })

    it('version детерминированная — одинаковые модули → одинаковый hash', () => {
        const scan = makeScan({
            routeModules: [
                {
                    file: '/proj/client/A/router.ts',
                    routes: [makeRoute({ id: 'a' })],
                },
            ],
        })
        const config = makeConfig()
        const m1 = buildManifest(scan, config, '/proj/client')
        const m2 = buildManifest(scan, config, '/proj/client')
        expect(m1.version).toBe(m2.version)
    })

    it('version разная — разные модули → разный hash', () => {
        const m1 = buildManifest(makeScan(), makeConfig(), '/proj/client')
        const m2 = buildManifest(
            makeScan({
                routeModules: [
                    {
                        file: '/proj/client/A/router.ts',
                        routes: [makeRoute({ id: 'a' })],
                    },
                ],
            }),
            makeConfig(),
            '/proj/client',
        )
        expect(m1.version).not.toBe(m2.version)
    })

    it('спека с :export — в манифесте без суффикса', () => {
        const m = buildManifest(
            makeScan({
                routeModules: [
                    {
                        file: '/proj/client/A/router.ts',
                        routes: [
                            makeRoute({
                                id: 'a',
                                contentConfig: {
                                    workspaceConfig: { template: 'A/view:View' },
                                    prefetchConfig: { configLoader: 'A/Root:getConfig' },
                                },
                            }),
                        ],
                    },
                ],
            }),
            makeConfig(),
            '/proj/client',
        )
        expect(m.modules['A/view']).toBeDefined()
        expect(m.modules['A/view:View']).toBeUndefined()
        expect(m.modules['A/Root']).toBeDefined()
        expect(m.modules['A/Root:getConfig']).toBeUndefined()
    })
})
