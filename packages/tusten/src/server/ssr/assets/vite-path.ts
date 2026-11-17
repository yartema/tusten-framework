import path from 'node:path'

/**
 * Абсолютный путь → Vite-путь.
 *
 * @param projectDir корень проекта.
 * @param absPath абсолютный путь.
 * @returns Vite-путь (`/client/...`).
 */
export function resolveVitePath(projectDir: string, absPath: string): string {
    return '/' + path.relative(projectDir, absPath).replace(/\\/g, '/')
}
