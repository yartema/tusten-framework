import { promises as fs } from 'node:fs'
import path from 'node:path'
import { brotliCompress, constants, gzip, type BrotliOptions, type ZlibOptions } from 'node:zlib'

/**
 * Promise-обёртка `brotliCompress` (у `promisify` не сходится перегрузка).
 *
 * @param data исходные байты.
 * @param options опции zlib.
 * @returns сжатые байты.
 */
function brotli(data: Buffer, options: BrotliOptions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        brotliCompress(data, options, (error, compressed) => {
            if (error) reject(error)
            else resolve(compressed)
        })
    })
}

/**
 * Promise-обёртка `gzip` (см. `brotli`).
 *
 * @param data исходные байты.
 * @param options опции zlib.
 * @returns сжатые байты.
 */
function gzipAsync(data: Buffer, options: ZlibOptions): Promise<Buffer> {
    return new Promise((resolve, reject) => {
        gzip(data, options, (error, compressed) => {
            if (error) reject(error)
            else resolve(compressed)
        })
    })
}

/**
 * Расширения, которые имеет смысл сжимать заранее.
 *
 * Изображения, шрифты и видео уже сжаты своими форматами — повторное сжатие
 * только тратит время сборки и место на диске.
 */
export const DEFAULT_PRECOMPRESS_EXTENSIONS: readonly string[] = [
    '.js',
    '.mjs',
    '.cjs',
    '.css',
    '.html',
    '.htm',
    '.json',
    '.svg',
    '.xml',
    '.txt',
    '.map',
]

/** Настройки предсжатия статики. */
export interface PrecompressOptions {
    /** Минимальный размер файла в байтах. По умолчанию 1024 (оверхед заголовков). */
    threshold?: number
    /** Расширения для сжатия. По умолчанию `DEFAULT_PRECOMPRESS_EXTENSIONS`. */
    extensions?: readonly string[]
    /** Каталоги (по имени), которые обход пропускает. */
    excludeDirs?: readonly string[]
}

/** Результат предсжатия. */
export interface PrecompressResult {
    /** Сколько файлов получили `.br` и `.gz`. */
    compressed: number
    /** Сколько файлов пропущено: слишком маленькие или не тот формат. */
    skipped: number
    /** Суммарный размер исходников, байт. */
    originalBytes: number
    /** Суммарный размер `.br`, байт. */
    brotliBytes: number
    /** Суммарный размер `.gz`, байт. */
    gzipBytes: number
}

/**
 * Рекурсивно предсжимает статику: рядом с каждым подходящим файлом появляются
 * `<file>.br` (brotli quality 11) и `<file>.gz` (gzip level 9).
 *
 * Зачем заранее: `@fastify/static` с `preCompressed: true` отдаёт готовый файл
 * без CPU на каждый запрос. `.br`/`.gz` — артефакты сборки, поэтому чистятся
 * вместе с `dist/client` (`emptyOutDir: true`).
 *
 * @param rootDir каталог сборки (`dist/client`).
 * @param options порог, расширения и исключённые каталоги.
 * @returns статистика сжатия.
 * @throws {Error} если чтение/запись файла не удались — сборка должна упасть.
 */
export async function precompressAssets(
    rootDir: string,
    options: PrecompressOptions = {},
): Promise<PrecompressResult> {
    const threshold = options.threshold ?? 1024
    const extensions = new Set((options.extensions ?? DEFAULT_PRECOMPRESS_EXTENSIONS).map((ext) => ext.toLowerCase()))
    const excludeDirs = new Set(options.excludeDirs ?? ['.vite'])

    const result: PrecompressResult = {
        compressed: 0,
        skipped: 0,
        originalBytes: 0,
        brotliBytes: 0,
        gzipBytes: 0,
    }

    /**
     * Обходит каталог и сжимает подходящие файлы.
     *
     * @param dir текущий каталог.
     */
    const walk = async (dir: string): Promise<void> => {
        const entries = await fs.readdir(dir, { withFileTypes: true })

        for (const entry of entries) {
            const absolute = path.join(dir, entry.name)

            if (entry.isDirectory()) {
                if (excludeDirs.has(entry.name)) continue
                await walk(absolute)
                continue
            }
            if (!entry.isFile()) continue

            const ext = path.extname(entry.name).toLowerCase()
            if (!extensions.has(ext)) continue

            const stat = await fs.stat(absolute)
            if (stat.size < threshold) {
                result.skipped++
                continue
            }

            const data = await fs.readFile(absolute)
            const [brotliData, gzipData] = await Promise.all([
                brotli(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }),
                gzipAsync(data, { level: 9 }),
            ])

            await Promise.all([
                fs.writeFile(`${absolute}.br`, brotliData),
                fs.writeFile(`${absolute}.gz`, gzipData),
            ])

            result.compressed++
            result.originalBytes += data.byteLength
            result.brotliBytes += brotliData.byteLength
            result.gzipBytes += gzipData.byteLength
        }
    }

    await walk(rootDir)
    return result
}
