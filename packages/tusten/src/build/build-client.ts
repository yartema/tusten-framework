import path from 'node:path'
import type { FactoryMap, ResolvedTustenConfig, RouteTree } from '../types'
import { tustenPlugin } from '../vite/plugin'
import { resolveCssPaths } from '../utils/css'
import { precompressAssets } from './precompress'

/** Опции клиентского build. */
export interface BuildClientOptions {
    projectDir: string
    clientDir: string
    config: ResolvedTustenConfig
    routeTree: RouteTree
    outDir: string
    factoryModules: string[]
    /** Глобальный реестр фабрик (`*.loader.ts`). */
    globalRegistry: FactoryMap
}

/**
 * Собирает клиентский бандл в `outDir`.
 *
 * @param options опции.
 */
export async function buildClient(options: BuildClientOptions): Promise<void> {
    const { projectDir, clientDir, config, routeTree, outDir, factoryModules, globalRegistry } =
        options
    const { build } = await import('vite')
    const react = (await import('@vitejs/plugin-react')).default
    const userVite = config.vite ?? {}
    const cssFiles = resolveCssPaths(projectDir, clientDir, config)
    const publicDir = config.publicDir ? path.resolve(projectDir, config.publicDir) : false

    await build({
        ...userVite,
        root: projectDir,
        // Копируем `public/` в `dist/client`: деплой только `dist/` должен работать.
        publicDir,
        configFile: false,
        appType: 'custom',
        plugins: [
            tustenPlugin({
                projectDir,
                clientDir,
                config,
                routeTree,
                factoryModules,
                globalFactories: globalRegistry,
                cssFiles,
            }),
            react(),
            ...(userVite.plugins ?? []),
        ],
        resolve: { ...(userVite.resolve ?? {}), preserveSymlinks: false },
        build: {
            ...(userVite.build ?? {}),
            outDir,
            emptyOutDir: true,
            manifest: true,
            rollupOptions: {
                input: 'virtual:tusten/client-entry',
                output: {
                    // Entry и чанки хэшируются: имя меняется вместе с содержимым,
                    // поэтому их можно кэшировать на год (`immutable`).
                    entryFileNames: 'assets/[name]-[hash].js',
                    chunkFileNames: 'assets/[name]-[hash].js',
                    assetFileNames: 'assets/[name]-[hash][extname]',
                },
            },
        },
    })

    // Предсжатие после записи бандла: `.br`/`.gz` — часть `dist/client`,
    // prod-сервер отдаёт их через `preCompressed` без CPU в рантайме.
    // `emptyOutDir` уже удалил прошлые артефакты, поэтому «старые» хэши
    // не накапливаются.
    await precompressAssets(outDir)
}