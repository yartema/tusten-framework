import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ResolvedTustenConfig, TustenRoute } from '../../../../../packages/tusten/src/types'
import { clearDevCssCache, collectDirectCssImports } from '../../../../../packages/tusten/src/server/ssr/assets/dev-css'
import { createAssetResolver } from '../../../../../packages/tusten/src/server/ssr/assets/links'
import {
    createClientManifestIndex,
    type ClientManifestEntry,
} from '../../../../../packages/tusten/src/server/ssr/assets/manifest'
import { resolveVitePath } from '../../../../../packages/tusten/src/server/ssr/assets/vite-path'

/** Минимальный нормализованный конфиг для резолвера ассетов. */
function makeConfig(overrides: Partial<ResolvedTustenConfig> = {}): ResolvedTustenConfig {
    return {
        ssr: true,
        client: {
            clientDir: 'client',
            css: [],
            root: { component: 'shared/root', container: { tag: 'div', id: 'root', attributes: {} } },
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
        i18n: null,
        ...overrides,
    }
}

/** Маршрут с заданным шаблоном. */
function makeRoute(template: string): TustenRoute {
    return {
        id: 'home',
        contentConfig: {
            workspaceConfig: { template },
            prefetchConfig: { configLoader: 'HomePage/config' },
        },
    }
}

/** Manifest с entry, общими чанками и модулями страницы. */
function makeManifest(): Record<string, ClientManifestEntry> {
    return {
        'client/client.ts': {
            file: 'assets/client.js',
            src: 'client/client.ts',
            isEntry: true,
            imports: ['client/runtime.ts'],
            css: ['assets/client.css'],
        },
        'client/runtime.ts': {
            file: 'assets/runtime.js',
            src: 'client/runtime.ts',
        },
        'client/shared/root.tsx': {
            file: 'assets/root.js',
            src: 'client/shared/root.tsx',
            imports: ['client/Page/View.tsx'],
            css: ['assets/root.css'],
        },
        'client/shared/error.tsx': {
            file: 'assets/error.js',
            src: 'client/shared/error.tsx',
        },
        'client/Page/View.tsx': {
            file: 'assets/view.js',
            src: 'client/Page/View.tsx',
            css: ['assets/view.css'],
        },
        'client/Page/ViewFoo.tsx': {
            file: 'assets/viewfoo.js',
            src: 'client/Page/ViewFoo.tsx',
            css: ['assets/viewfoo.css'],
        },
        'client/Page/layout.tsx': {
            file: 'assets/layout.js',
            src: 'client/Page/layout.tsx',
        },
        'client/slices/Foo.ts': {
            file: 'assets/foo-slice.js',
            src: 'client/slices/Foo.ts',
        },
    }
}

describe('createClientManifestIndex', () => {
    const projectDir = path.resolve('/project')
    const index = createClientManifestIndex(makeManifest(), { projectDir, clientDir: path.join(projectDir, 'client') })

    it('находит entry-чанки', () => {
        expect(index.entryEntries.map((entry) => entry.file)).toEqual(['assets/client.js'])
    })

    it('ищет запись по спеке без расширения и по границе расширения', () => {
        expect(index.forSpec('Page/View').map((entry) => entry.file)).toEqual(['assets/view.js'])
        expect(index.forSpec('./Page/View').map((entry) => entry.file)).toEqual(['assets/view.js'])
    })

    it('не цепляет соседний модуль с похожим именем', () => {
        expect(index.forSpec('Page/View').map((entry) => entry.file)).not.toContain('assets/viewfoo.js')
    })

    it('кэширует результат поиска', () => {
        expect(index.forSpec('Page/View')).toBe(index.forSpec('Page/View'))
    })

    it('индексирует записи по точному src', () => {
        expect(index.bySrc.get('client/slices/Foo.ts')?.map((entry) => entry.file)).toEqual(['assets/foo-slice.js'])
    })
})

describe('createAssetResolver: prod', () => {
    const resolver = createAssetResolver({
        isDev: false,
        projectDir: path.resolve('/project'),
        clientDir: path.resolve('/project/client'),
        config: makeConfig(),
        clientManifest: makeManifest(),
        entryScriptSrc: '/assets/client.js',
    })
    const route = makeRoute('Page/View')
    const layoutChain = ['Page/layout']

    it('CSS страницы: entry, root с imports и шаблон', () => {
        const html = resolver.cssLinks({ mode: 'ssr', route, layoutChain })
        expect(html).toBe(
            '<link rel="stylesheet" href="/assets/client.css">' +
                '<link rel="stylesheet" href="/assets/root.css">' +
                '<link rel="stylesheet" href="/assets/view.css">',
        )
    })

    it('SPA/404: CSS всех записей manifest', () => {
        const html = resolver.cssLinks({ mode: 'spa', route: null })
        expect(html).toContain('/assets/viewfoo.css')
        expect(html).toContain('/assets/client.css')
        // Дедуп: CSS entry не дублируется.
        expect(html.match(/assets\/client\.css/g)).toHaveLength(1)
    })

    it('preload: entry, runtime, чанки маршрута, слайсы, error и root', () => {
        const html = resolver.modulePreloads({
            route,
            layoutChain,
            sliceModulePaths: ['/client/slices/Foo.ts'],
        })
        const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1])

        expect(hrefs[0]).toBe('/assets/client.js')
        expect(hrefs).toEqual([
            '/assets/client.js',
            '/assets/runtime.js',
            '/assets/view.js',
            '/assets/layout.js',
            '/assets/foo-slice.js',
            '/assets/root.js',
        ])
    })

    it('без manifest ассеты не рендерятся', () => {
        const empty = createAssetResolver({
            isDev: false,
            projectDir: path.resolve('/project'),
            clientDir: path.resolve('/project/client'),
            config: makeConfig(),
            clientManifest: null,
            entryScriptSrc: '/assets/client.js',
        })
        expect(empty.cssLinks({ mode: 'ssr', route, layoutChain })).toBe('')
        expect(empty.modulePreloads({ route })).toBe('')
    })
})

describe('createAssetResolver: dev', () => {
    let dir: string
    let projectDir: string

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tusten-assets-'))
        projectDir = dir
        fs.mkdirSync(path.join(dir, 'client', 'Page'), { recursive: true })
        fs.mkdirSync(path.join(dir, 'client', 'shared'), { recursive: true })

        fs.writeFileSync(
            path.join(dir, 'client', 'Page', 'View.tsx'),
            "import './view.css'\nimport { nested } from '../shared/nested'\nexport const View = nested\n",
        )
        fs.writeFileSync(path.join(dir, 'client', 'Page', 'view.css'), '.view{}\n')
        fs.writeFileSync(
            path.join(dir, 'client', 'shared', 'nested.ts'),
            "import '../shared/nested.css'\nexport const nested = 1\n",
        )
        fs.writeFileSync(path.join(dir, 'client', 'shared', 'nested.css'), '.nested{}\n')
        fs.writeFileSync(path.join(dir, 'client', 'shared', 'root.tsx'), "import './root.css'\n")
        fs.writeFileSync(path.join(dir, 'client', 'shared', 'root.css'), '.root{}\n')
        fs.writeFileSync(path.join(dir, 'client', 'global.css'), '.global{}\n')
        clearDevCssCache()
    })

    afterEach(() => {
        clearDevCssCache()
        fs.rmSync(dir, { recursive: true, force: true })
    })

    it('собирает CSS из исходников и глобального конфига', () => {
        const resolver = createAssetResolver({
            isDev: true,
            projectDir,
            clientDir: path.join(dir, 'client'),
            config: makeConfig({
                client: {
                    clientDir: 'client',
                    css: ['global.css'],
                    root: { component: 'shared/root', container: { tag: 'div', id: 'root', attributes: {} } },
                    components: { error: null, loading: null, notFound: null },
                },
            }),
            entryScriptSrc: '/client/client.ts',
        })

        expect(resolver.cssLinks({ mode: 'ssr', route: makeRoute('Page/View'), layoutChain: [] })).toBe(
            '<link rel="stylesheet" href="/client/global.css">' +
                '<link rel="stylesheet" href="/client/shared/root.css">' +
                '<link rel="stylesheet" href="/client/Page/view.css">' +
                '<link rel="stylesheet" href="/client/shared/nested.css">',
        )
        expect(resolver.modulePreloads({ route: makeRoute('Page/View') })).toBe('')
    })

    it('кэш видит правку файла по mtime', () => {
        const entry = path.join(dir, 'client', 'Page', 'View.tsx')
        expect(collectDirectCssImports([path.join(dir, 'client', 'Page', 'View')], projectDir)).toEqual([
            '/client/Page/view.css',
            '/client/shared/nested.css',
        ])

        fs.writeFileSync(entry, "import './view.css'\nimport './extra.css'\n")
        fs.writeFileSync(path.join(dir, 'client', 'Page', 'extra.css'), '.extra{}\n')
        const future = new Date(Date.now() + 5_000)
        fs.utimesSync(entry, future, future)

        expect(collectDirectCssImports([path.join(dir, 'client', 'Page', 'View')], projectDir)).toContain(
            '/client/Page/extra.css',
        )
    })
})

describe('resolveVitePath', () => {
    it('нормализует разделители Windows', () => {
        expect(resolveVitePath(path.resolve('/project'), path.resolve('/project/client/View.tsx'))).toBe(
            '/client/View.tsx',
        )
    })
})
