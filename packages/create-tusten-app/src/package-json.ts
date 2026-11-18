import type { ScaffoldOptions } from './options'
import { PEER_VERSIONS, TOOL_VERSIONS } from './versions'

/** Содержимое `package.json` сгенерированного проекта. */
export interface GeneratedPackageJson {
    name: string
    version: string
    private: boolean
    type: 'module'
    engines: { node: string }
    scripts: Record<string, string>
    dependencies: Record<string, string>
    devDependencies: Record<string, string>
}

/**
 * Сортирует ключи объекта, чтобы `package.json` был детерминированным.
 *
 * @param entries пары ключ-значение.
 * @returns отсортированный объект.
 */
function sorted(entries: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b)))
}

/**
 * Собирает `package.json` сгенерированного приложения.
 *
 * `@tusten/core` ставится точной версией (для beta это критично), peer-зависимости
 * ядра перечисляются явно: при строгом pnpm без них приложение не соберётся.
 *
 * @param options разрешённые опции.
 * @returns объект package.json.
 */
export function buildPackageJson(options: ScaffoldOptions): GeneratedPackageJson {
    const scripts: Record<string, string> = {
        dev: 'tusten dev',
        build: 'tusten build',
        start: 'tusten start',
        inspect: 'tusten inspect',
        typecheck: 'tsc --noEmit',
    }

    if (options.eslint) {
        scripts.lint = 'eslint .'
        scripts['lint:fix'] = 'eslint . --fix'
    }
    if (options.prettier) {
        scripts.format = 'prettier --write .'
        scripts['format:check'] = 'prettier --check .'
    }

    const dependencies: Record<string, string> = {
        '@tusten/core': options.coreSpec,
        react: PEER_VERSIONS.react,
        'react-dom': PEER_VERSIONS['react-dom'],
        fastify: PEER_VERSIONS.fastify,
    }

    const devDependencies: Record<string, string> = {
        '@types/node': TOOL_VERSIONS['@types/node'],
        '@types/react': TOOL_VERSIONS['@types/react'],
        '@types/react-dom': TOOL_VERSIONS['@types/react-dom'],
        '@vitejs/plugin-react': PEER_VERSIONS['@vitejs/plugin-react'],
        typescript: TOOL_VERSIONS.typescript,
        vite: PEER_VERSIONS.vite,
    }

    if (options.tailwind) {
        devDependencies.tailwindcss = TOOL_VERSIONS.tailwindcss
        devDependencies['@tailwindcss/vite'] = TOOL_VERSIONS['@tailwindcss/vite']
    }

    if (options.eslint) {
        devDependencies.eslint = TOOL_VERSIONS.eslint
        devDependencies['@eslint/js'] = TOOL_VERSIONS['@eslint/js']
        devDependencies['typescript-eslint'] = TOOL_VERSIONS['typescript-eslint']
        devDependencies.globals = TOOL_VERSIONS.globals
        devDependencies['eslint-plugin-react-hooks'] = TOOL_VERSIONS['eslint-plugin-react-hooks']
        devDependencies['eslint-plugin-react-refresh'] = TOOL_VERSIONS['eslint-plugin-react-refresh']
        if (options.prettier) {
            devDependencies['eslint-config-prettier'] = TOOL_VERSIONS['eslint-config-prettier']
        }
    }

    if (options.prettier) {
        devDependencies.prettier = TOOL_VERSIONS.prettier
    }

    return {
        name: options.packageName,
        version: '0.0.0',
        private: true,
        type: 'module',
        engines: { node: '>=20.0.0' },
        scripts,
        dependencies: sorted(dependencies),
        devDependencies: sorted(devDependencies),
    }
}

/**
 * Сериализует `package.json` в стиле репозитория (4 пробела).
 *
 * @param pkg объект package.json.
 * @returns JSON-строка с завершающим переводом строки.
 */
export function stringifyPackageJson(pkg: GeneratedPackageJson): string {
    return `${JSON.stringify(pkg, null, 4)}\n`
}
