import { existsSync } from 'node:fs'
import path from 'node:path'
import { createJiti, type Jiti, type JitiOptions } from 'jiti'

/**
 * jiti для пользовательского кода проекта.
 *
 * Включает `compilerOptions.paths` из `<projectDir>/tsconfig.json`: алиасы
 * (`@/…`, `@server/…`) должны работать не только в Vite, но и в модулях,
 * которые фреймворк грузит напрямую через jiti — server routes/plugins/
 * middleware, RPC-объекты, `configLoader`'ы маршрутов и сам `tusten.config.ts`.
 *
 * Без этого `.ts` проходит `tsc` и работает в редакторе, а dev-сервер падает
 * на `Cannot find module '@/…'` — расхождение между Vite и Node-загрузчиком.
 *
 * @param projectDir корень проекта (где лежит `tsconfig.json`).
 * @param options дополнительные опции; переопределяют дефолты.
 * @returns инстанс jiti.
 */
export function createProjectJiti(projectDir: string, options: JitiOptions = {}): Jiti {
    const tsconfig = path.join(projectDir, 'tsconfig.json')
    return createJiti(import.meta.url, {
        interopDefault: true,
        ...options,
        ...(existsSync(tsconfig) ? { tsconfigPaths: tsconfig } : {}),
    })
}
