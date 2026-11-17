import fs from 'node:fs'
import path from 'node:path'
import { resolveVitePath } from './vite-path'

/** Расширения, которые пробуем при резолве импорта без расширения. */
const SOURCE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', ''] as const
/** Максимальная глубина обхода графа импортов. */
const MAX_DEPTH = 30

/** Разобранный модуль: прямые CSS-импорты и JS/TS-зависимости. */
interface ParsedModule {
    /** Реальный файл (с расширением) или `null`, если не найден. */
    file: string | null
    /** `mtime` файла на момент разбора (ms). */
    mtimeMs: number
    /** Размер файла на момент разбора. */
    size: number
    /** Абсолютные пути CSS-импортов. */
    css: string[]
    /** Абсолютные пути JS/TS-импортов (без расширения). */
    deps: string[]
}

/**
 * Кэш разобранных модулей dev-сервера.
 *
 * В dev граф импортов CSS сканируется на каждый запрос, а `readFileSync` + regex
 * на весь граф — самый дорогой участок ответа. Кэш хранит результат по `mtime`
 * и размеру файла: правка через HMR меняет `mtime`, и модуль разбирается заново.
 */
const parseCache = new Map<string, ParsedModule>()

/**
 * Сбрасывает кэш разбора (тесты, принудительная инвалидация).
 */
export function clearDevCssCache(): void {
    parseCache.clear()
}

/**
 * Находит реальный файл по пути без расширения.
 *
 * @param base абсолютный путь без расширения (или с ним).
 * @returns путь с расширением или `null`.
 */
function resolveFile(base: string): string | null {
    for (const ext of SOURCE_EXTENSIONS) {
        const candidate = base + ext
        if (fs.existsSync(candidate)) return candidate
    }
    return null
}

/**
 * Читает файл и сравнивает его состояние с кэшем.
 *
 * @param file реальный путь.
 * @param parsed закэшированная запись (если есть).
 * @returns актуальная запись или `null`, если кэш валиден.
 */
function refreshIfStale(file: string, parsed: ParsedModule | undefined): ParsedModule | null {
    if (!parsed) return null
    try {
        const stat = fs.statSync(file)
        return stat.mtimeMs === parsed.mtimeMs && stat.size === parsed.size ? parsed : null
    } catch {
        return null
    }
}

/**
 * Разбирает модуль и кладёт результат в кэш.
 *
 * @param base абсолютный путь без расширения.
 * @returns разобранный модуль или `null`, если файл не найден/не читается.
 */
function parseModule(base: string): ParsedModule | null {
    const cached = parseCache.get(base)
    if (cached?.file) {
        const fresh = refreshIfStale(cached.file, cached)
        if (fresh) return fresh
    }

    const file = resolveFile(base)
    if (!file) return null

    let src: string
    try {
        src = fs.readFileSync(file, 'utf8')
    } catch {
        return null
    }

    const css: string[] = []
    // 1. CSS-импорты.
    const cssRegex = /import\s+['"](\.{1,2}\/[^'"]+\.css)['"]/g
    let match: RegExpExecArray | null
    while ((match = cssRegex.exec(src)) !== null) {
        css.push(path.resolve(path.dirname(file), match[1]))
    }

    // 2. JS/TS-импорты (для рекурсии).
    const deps: string[] = []
    const jsRegex = /import\s+(?:[^'"]*?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g
    while ((match = jsRegex.exec(src)) !== null) {
        const rel = match[1]
        if (rel.endsWith('.css')) continue
        deps.push(path.resolve(path.dirname(file), rel))
    }

    let mtimeMs = 0
    let size = 0
    try {
        const stat = fs.statSync(file)
        mtimeMs = stat.mtimeMs
        size = stat.size
    } catch {
        // Файл исчез между чтением и stat — разбор всё равно полезен для текущего
        // запроса, но кэшировать его нельзя.
        return { file, mtimeMs: -1, size: -1, css, deps }
    }

    const parsed: ParsedModule = { file, mtimeMs, size, css, deps }
    parseCache.set(base, parsed)
    return parsed
}

/**
 * Рекурсивно собирает `import '*.css'` из указанных файлов и их JS/TS-импортов.
 *
 * @param sourceFiles абсолютные пути (без расширения или с).
 * @param projectDir корень проекта.
 * @returns Vite-пути до CSS в порядке обхода.
 */
export function collectDirectCssImports(sourceFiles: readonly string[], projectDir: string): string[] {
    const result = new Set<string>()
    const visited = new Set<string>()

    /**
     * @param base абсолютный путь (без расширения).
     * @param depth глубина.
     */
    const visit = (base: string, depth: number): void => {
        if (depth > MAX_DEPTH) return

        const parsed = parseModule(base)
        if (!parsed?.file) return
        if (visited.has(parsed.file)) return
        visited.add(parsed.file)

        for (const absCss of parsed.css) result.add(resolveVitePath(projectDir, absCss))
        for (const dep of parsed.deps) visit(dep, depth + 1)
    }

    for (const base of sourceFiles) visit(base, 0)
    return [...result]
}
