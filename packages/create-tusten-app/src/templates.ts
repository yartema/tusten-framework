import path from 'node:path'
import { promises as fs } from 'node:fs'
import { fileURLToPath } from 'node:url'

/** Файл, который нужно записать в проект. */
export interface PlannedFile {
    /** Путь относительно корня проекта (POSIX-разделители). */
    path: string
    /** Содержимое. */
    content: string
}

/**
 * Корень пакета `create-tusten-app` (работает и из `src`, и из `dist`).
 *
 * @returns абсолютный путь.
 */
export function packageRoot(): string {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
}

/**
 * Абсолютный путь до каталога шаблона.
 *
 * @param name имя шаблона (`basic`).
 * @returns путь до `templates/<name>`.
 */
export function templateDir(name: string): string {
    return path.join(packageRoot(), 'templates', name)
}

/**
 * Рекурсивно читает текстовые файлы каталога.
 *
 * `_gitignore` → `.gitignore`: npm не пакует `.gitignore` внутри шаблонов,
 * поэтому в шаблоне он лежит с подчёркиванием.
 *
 * @param root каталог.
 * @param current текущий подкаталог.
 * @param out карта `relativePath → content`.
 * @returns та же карта.
 */
async function readDir(root: string, current: string, out: Map<string, string>): Promise<Map<string, string>> {
    const entries = await fs.readdir(current, { withFileTypes: true })

    for (const entry of entries) {
        const absolute = path.join(current, entry.name)
        if (entry.isDirectory()) {
            await readDir(root, absolute, out)
            continue
        }
        if (!entry.isFile()) continue
        if (entry.name === '.DS_Store') continue

        let relative = path.relative(root, absolute).replace(/\\/g, '/')
        if (relative === '_gitignore') relative = '.gitignore'

        const content = await fs.readFile(absolute, 'utf8')
        out.set(relative, content)
    }

    return out
}

/**
 * Собирает файлы из слоёв шаблона: базовый + опциональные оверлеи.
 *
 * Поздние слои переопределяют ранние — так Tailwind/ESLint не дублируют
 * базовые файлы, а заменяют только нужные.
 *
 * @param layers имена каталогов внутри `templates/<template>`.
 * @param template имя шаблона.
 * @returns карта файлов.
 */
export async function readTemplateLayers(layers: string[], template = 'basic'): Promise<Map<string, string>> {
    const files = new Map<string, string>()

    for (const layer of layers) {
        const root = path.join(templateDir(template), layer)
        try {
            await readDir(root, root, files)
        } catch (err) {
            if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue
            throw err
        }
    }

    return files
}
