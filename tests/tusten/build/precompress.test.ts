import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { brotliDecompress, gunzip } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
    DEFAULT_PRECOMPRESS_EXTENSIONS,
    precompressAssets,
} from '../../../packages/tusten/src/build/precompress'

const brotliDecompressAsync = promisify(brotliDecompress)
const gunzipAsync = promisify(gunzip)

/** Содержимое, которое заметно больше порога. */
const PAYLOAD = 'const answer = 42;\n'.repeat(200)

describe('precompressAssets', () => {
    let dir: string

    beforeEach(async () => {
        dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tusten-precompress-'))
    })

    afterEach(async () => {
        await fs.rm(dir, { recursive: true, force: true })
    })

    it('создаёт .br и .gz, распаковка возвращает исходник', async () => {
        const file = path.join(dir, 'client.js')
        await fs.writeFile(file, PAYLOAD)

        const result = await precompressAssets(dir)

        expect(result.compressed).toBe(1)
        expect(result.skipped).toBe(0)

        const original = await fs.readFile(file)
        const brotli = await fs.readFile(`${file}.br`)
        const gzip = await fs.readFile(`${file}.gz`)

        expect(await brotliDecompressAsync(brotli)).toEqual(original)
        expect(await gunzipAsync(gzip)).toEqual(original)
        expect(result.brotliBytes).toBe(brotli.byteLength)
        expect(result.gzipBytes).toBe(gzip.byteLength)
    })

    it('обходит вложенные каталоги и не трогает неподдерживаемые расширения', async () => {
        await fs.mkdir(path.join(dir, 'assets', 'fonts'), { recursive: true })
        await fs.writeFile(path.join(dir, 'assets', 'view.css'), PAYLOAD)
        await fs.writeFile(path.join(dir, 'assets', 'fonts', 'inter.woff2'), PAYLOAD)
        await fs.writeFile(path.join(dir, 'logo.png'), PAYLOAD)

        const result = await precompressAssets(dir)

        expect(result.compressed).toBe(1)
        await expect(fs.stat(path.join(dir, 'assets', 'view.css.br'))).resolves.toBeDefined()
        await expect(fs.stat(path.join(dir, 'assets', 'fonts', 'inter.woff2.br'))).rejects.toThrow()
        await expect(fs.stat(path.join(dir, 'logo.png.gz'))).rejects.toThrow()
    })

    it('пропускает файлы меньше порога', async () => {
        await fs.writeFile(path.join(dir, 'tiny.js'), '1')

        const result = await precompressAssets(dir, { threshold: 1024 })

        expect(result.compressed).toBe(0)
        expect(result.skipped).toBe(1)
        await expect(fs.stat(path.join(dir, 'tiny.js.br'))).rejects.toThrow()
    })

    it('порог и расширения настраиваются', async () => {
        await fs.writeFile(path.join(dir, 'tiny.js'), 'const a = 1')

        const result = await precompressAssets(dir, { threshold: 0, extensions: ['.js'] })

        expect(result.compressed).toBe(1)
        await expect(fs.stat(path.join(dir, 'tiny.js.br'))).resolves.toBeDefined()
    })

    it('пропускает служебный каталог .vite', async () => {
        await fs.mkdir(path.join(dir, '.vite'), { recursive: true })
        await fs.writeFile(path.join(dir, '.vite', 'manifest.json'), '{}')

        const result = await precompressAssets(dir, { threshold: 0 })

        expect(result.compressed).toBe(0)
        await expect(fs.stat(path.join(dir, '.vite', 'manifest.json.br'))).rejects.toThrow()
    })

    it('по умолчанию сжимает js/css/html/json/svg', () => {
        expect(DEFAULT_PRECOMPRESS_EXTENSIONS).toEqual(
            expect.arrayContaining(['.js', '.css', '.html', '.json', '.svg']),
        )
        expect(DEFAULT_PRECOMPRESS_EXTENSIONS).not.toContain('.png')
        expect(DEFAULT_PRECOMPRESS_EXTENSIONS).not.toContain('.woff2')
    })
})
