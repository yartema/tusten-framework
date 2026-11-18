import { devCommand, installCommand } from './commands'
import type { ScaffoldOptions } from './options'
import { buildPackageJson, stringifyPackageJson } from './package-json'
import { readTemplateLayers, type PlannedFile } from './templates'

/** Содержимое `.prettierrc.json`. */
const PRETTIER_CONFIG = {
    semi: false,
    singleQuote: true,
    trailingComma: 'all',
    printWidth: 120,
    tabWidth: 4,
    useTabs: false,
    arrowParens: 'always',
    endOfLine: 'lf',
}

/**
 * Заменяет все вхождения плейсхолдера.
 *
 * @param content текст.
 * @param token плейсхолдер.
 * @param value значение.
 * @returns текст с заменой.
 */
function replaceAll(content: string, token: string, value: string): string {
    return content.split(token).join(value)
}

/**
 * Список инструментов для README.
 *
 * @param options опции.
 * @returns markdown-список.
 */
function toolsList(options: ScaffoldOptions): string {
    const tools = ['TypeScript (strict)']
    if (options.tailwind) tools.push('Tailwind CSS')
    if (options.eslint) tools.push('ESLint')
    if (options.prettier) tools.push('Prettier')
    return tools.map((tool) => `- ${tool}`).join('\n')
}

/**
 * Дополнительные пункты списка скриптов в README.
 *
 * @param options опции.
 * @returns markdown-строки.
 */
function extraScripts(options: ScaffoldOptions): string {
    const rows: string[] = []
    if (options.eslint) {
        rows.push('- `lint` — проверить код ESLint;')
        rows.push('- `lint:fix` — исправить автоисправимые ошибки ESLint;')
    }
    if (options.prettier) {
        rows.push('- `format` — отформатировать проект Prettier;')
        rows.push('- `format:check` — проверить форматирование без записи.')
    }
    return rows.join('\n')
}

/**
 * Планирует все файлы проекта до записи на диск.
 *
 * Сначала считаем полный набор в памяти — так конфликты существующих файлов
 * проверяются до частичной записи и проект не остаётся «наполовину созданным».
 *
 * @param options разрешённые опции.
 * @returns файлы проекта.
 */
export async function planProject(options: ScaffoldOptions): Promise<PlannedFile[]> {
    const layers = ['base']
    if (options.tailwind) layers.push('tailwind')
    if (options.eslint) layers.push(options.prettier ? 'eslint-prettier' : 'eslint')

    const files = await readTemplateLayers(layers)

    files.set('package.json', stringifyPackageJson(buildPackageJson(options)))

    const readme = files.get('README.md')
    if (readme) {
        const tailwindNote = options.tailwind
            ? 'Tailwind CSS уже подключён: `@tailwindcss/vite` в `vite.plugins` и `@import "tailwindcss"` в `client/styles/main.css`.'
            : 'Tailwind CSS не подключён. Чтобы добавить: установите `tailwindcss` и `@tailwindcss/vite`, подключите плагин в `vite.plugins` и `@import "tailwindcss"` в `client/styles/main.css`.'
        const replacements: ReadonlyArray<readonly [string, string]> = [
            ['{{PROJECT_NAME}}', options.packageName],
            ['{{INSTALL_COMMAND}}', installCommand(options.packageManager)],
            ['{{DEV_COMMAND}}', devCommand(options.packageManager)],
            ['{{TOOLS}}', toolsList(options)],
            ['{{EXTRA_SCRIPTS}}', extraScripts(options)],
            ['{{TAILWIND_NOTE}}', tailwindNote],
        ]
        const replaced = replacements.reduce((content, [token, value]) => replaceAll(content, token, value), readme)
        files.set('README.md', replaced)
    }

    if (options.prettier) {
        files.set('.prettierrc.json', `${JSON.stringify(PRETTIER_CONFIG, null, 4)}\n`)
        files.set(
            '.prettierignore',
            'node_modules\ndist\npnpm-lock.yaml\npackage-lock.json\nyarn.lock\nbun.lock\nbun.lockb\n',
        )
    }

    return [...files.entries()]
        .map(([filePath, content]) => ({ path: filePath, content }))
        .sort((a, b) => a.path.localeCompare(b.path))
}
