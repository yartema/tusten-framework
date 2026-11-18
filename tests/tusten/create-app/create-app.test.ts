import { describe, expect, it } from 'vitest'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { toPackageName } from '../../../packages/create-tusten-app/src/name'
import { CliError, normalizeCoreSpec, parseArgs, resolveOptions } from '../../../packages/create-tusten-app/src/options'
import { buildPackageJson } from '../../../packages/create-tusten-app/src/package-json'
import { planProject } from '../../../packages/create-tusten-app/src/plan'
import type { Prompter } from '../../../packages/create-tusten-app/src/prompts'
import { writeFiles } from '../../../packages/create-tusten-app/src/scaffold'
import type { ScaffoldOptions } from '../../../packages/create-tusten-app/src/options'

/** Заглушка промптера: тесты не должны ждать stdin. */
const prompter: Prompter = {
    text: async () => '',
    confirm: async () => true,
    select: async <T extends string>() => 'pnpm' as T,
    close: () => undefined,
}

/**
 * Опции с дефолтами.
 *
 * @param overrides переопределения.
 * @returns опции скаффолда.
 */
function options(overrides: Partial<ScaffoldOptions> = {}): ScaffoldOptions {
    return {
        targetDir: '/tmp/tusten-app',
        packageName: 'tusten-app',
        tailwind: true,
        eslint: true,
        prettier: true,
        packageManager: 'pnpm',
        install: false,
        git: false,
        force: false,
        coreSpec: '0.2.0-beta.7',
        ...overrides,
    }
}

describe('parseArgs', () => {
    it('позиционный аргумент и флаги', () => {
        const parsed = parseArgs(['my-app', '--no-tailwind', '--pm', 'npm', '--git'])
        expect(parsed.target).toBe('my-app')
        expect(parsed.tailwind).toBe(false)
        expect(parsed.packageManager).toBe('npm')
        expect(parsed.git).toBe(true)
    })

    it('--yes и --force', () => {
        const parsed = parseArgs(['.', '-y', '--force'])
        expect(parsed.target).toBe('.')
        expect(parsed.yes).toBe(true)
        expect(parsed.force).toBe(true)
    })

    it('-- отделяет позиционные аргументы', () => {
        const parsed = parseArgs(['--yes', '--', 'my-app'])
        expect(parsed.target).toBe('my-app')
        expect(parsed.yes).toBe(true)
    })

    it('неизвестный флаг — ошибка', () => {
        expect(() => parseArgs(['--nope'])).toThrow(CliError)
    })

    it('значение флага не может быть пустым', () => {
        expect(() => parseArgs(['--pm'])).toThrow(/требует значение/)
    })
})

describe('resolveOptions', () => {
    it('--yes подставляет дефолты', async () => {
        const parsed = parseArgs(['my-app', '--yes'])
        const resolved = await resolveOptions(parsed, { cwd: '/work', interactive: false, prompter })
        expect(resolved).toMatchObject({
            packageName: 'my-app',
            tailwind: true,
            eslint: true,
            prettier: true,
            packageManager: 'pnpm',
            install: true,
            git: false,
        })
    })

    it('"." — текущая папка', async () => {
        const resolved = await resolveOptions(parseArgs(['.', '--yes']), {
            cwd: '/work/my-app',
            interactive: false,
            prompter,
        })
        expect(resolved.targetDir).toBe('/work/my-app')
        expect(resolved.packageName).toBe('my-app')
    })

    it('non-TTY без --yes требует явные флаги', async () => {
        await expect(
            resolveOptions(parseArgs(['my-app']), { cwd: '/work', interactive: false, prompter }),
        ).rejects.toThrow(/Нет TTY/)
    })

    it('non-TTY с явными флагами не требует --yes', async () => {
        const parsed = parseArgs([
            'my-app',
            '--no-tailwind',
            '--no-eslint',
            '--no-prettier',
            '--pm',
            'bun',
            '--no-install',
            '--no-git',
        ])
        const resolved = await resolveOptions(parsed, { cwd: '/work', interactive: false, prompter })
        expect(resolved.tailwind).toBe(false)
        expect(resolved.packageManager).toBe('bun')
        expect(resolved.install).toBe(false)
    })

    it('без target в non-TTY — ошибка', async () => {
        await expect(
            resolveOptions(parseArgs(['--yes']), { cwd: '/work', interactive: false, prompter }),
        ).rejects.toThrow(/Укажите папку/)
    })
})

describe('normalizeCoreSpec', () => {
    it('версия остаётся как есть', () => {
        expect(normalizeCoreSpec('0.2.0-beta.7', '/work')).toBe('0.2.0-beta.7')
    })

    it('относительный file: становится абсолютным', () => {
        const expected = `file:${resolve('/work', 'packages/tusten').replace(/\\/g, '/')}`
        expect(normalizeCoreSpec('file:packages/tusten', '/work')).toBe(expected)
    })

    it('без --core — версия скаффолдера', () => {
        expect(normalizeCoreSpec(undefined, '/work')).toMatch(/^\d+\.\d+\.\d+/)
    })
})

describe('toPackageName', () => {
    it('нормализует имя папки', () => {
        expect(toPackageName('My App')).toBe('my-app')
        expect(toPackageName('_private')).toBe('private')
        expect(toPackageName('  Hello__World  ')).toBe('hello-world')
    })

    it('fallback для не-ASCII имени', () => {
        expect(toPackageName('Проект')).toBe('tusten-app')
    })
})

describe('buildPackageJson', () => {
    it('все опции включены', () => {
        const pkg = buildPackageJson(options())
        expect(pkg.dependencies['@tusten/core']).toBe('0.2.0-beta.7')
        expect(pkg.dependencies).toHaveProperty('react')
        expect(pkg.dependencies).toHaveProperty('fastify')
        expect(pkg.devDependencies).toHaveProperty('tailwindcss')
        expect(pkg.devDependencies).toHaveProperty('eslint')
        expect(pkg.devDependencies).toHaveProperty('eslint-config-prettier')
        expect(pkg.devDependencies).toHaveProperty('prettier')
        expect(pkg.scripts).toHaveProperty('lint')
        expect(pkg.scripts).toHaveProperty('format')
    })

    it('всё выключено — нет лишних зависимостей и скриптов', () => {
        const pkg = buildPackageJson(options({ tailwind: false, eslint: false, prettier: false }))
        expect(pkg.devDependencies).not.toHaveProperty('tailwindcss')
        expect(pkg.devDependencies).not.toHaveProperty('eslint')
        expect(pkg.devDependencies).not.toHaveProperty('prettier')
        expect(pkg.scripts).not.toHaveProperty('lint')
        expect(pkg.scripts).not.toHaveProperty('format')
        expect(pkg.scripts).toMatchObject({ dev: 'tusten dev', typecheck: 'tsc --noEmit' })
    })

    it('--core подменяет спеку ядра', () => {
        const pkg = buildPackageJson(options({ coreSpec: 'file:../packages/tusten' }))
        expect(pkg.dependencies['@tusten/core']).toBe('file:../packages/tusten')
    })
})

describe('planProject', () => {
    it('дефолтный набор файлов', async () => {
        const files = await planProject(options())
        const byPath = new Map(files.map((file) => [file.path, file.content]))

        expect(byPath.has('.gitignore')).toBe(true)
        expect(byPath.has('_gitignore')).toBe(false)
        expect(byPath.get('public/robots.txt')).toContain('User-agent')
        expect(byPath.get('tusten.config.ts')).toContain("publicDir: 'public'")
        expect(byPath.get('tusten.config.ts')).toContain('rpc: { enabled: true')
        expect(byPath.get('server/app/App.meta.ts')).toContain("name: 'App'")
        expect(byPath.get('client/Page/Factories/Root.ts')).toContain('AppInfo')
        expect(byPath.get('client/Page/Factories/appInfo.ts')).toContain("appService.call<AppInfo>('Info')")
        expect(byPath.get('client/Page/router.ts')).toContain('Page/Factories/Root')
        expect(byPath.get('README.md')).toContain('JSON-RPC включён')
        expect(byPath.get('client/styles/main.css')).toContain("@import 'tailwindcss'")
        expect(byPath.get('eslint.config.js')).toContain('eslint-config-prettier')
        expect(byPath.has('.prettierrc.json')).toBe(true)
        expect(byPath.has('package.json')).toBe(true)
        expect(byPath.get('README.md')).toContain('Tailwind CSS уже подключён')
    })

    it('без Tailwind/ESLint/Prettier — без соответствующих файлов', async () => {
        const files = await planProject(options({ tailwind: false, eslint: false, prettier: false }))
        const byPath = new Map(files.map((file) => [file.path, file.content]))

        expect(byPath.has('eslint.config.js')).toBe(false)
        expect(byPath.has('.prettierrc.json')).toBe(false)
        expect(byPath.get('client/styles/main.css')).not.toContain('tailwindcss')
        expect(byPath.get('README.md')).toContain('Tailwind CSS не подключён')
    })

    it('алиасы @/ и @server/ согласованы в tsconfig и Vite', async () => {
        const variants = [
            new Map((await planProject(options())).map((file) => [file.path, file.content])),
            new Map((await planProject(options({ tailwind: false }))).map((file) => [file.path, file.content])),
        ]

        for (const files of variants) {
            const tsconfig = JSON.parse(files.get('tsconfig.json')!) as {
                compilerOptions: { paths: Record<string, string[]> }
            }
            expect(tsconfig.compilerOptions.paths).toEqual({
                '@/*': ['./client/*'],
                '@server/*': ['./server/*'],
            })

            const config = files.get('tusten.config.ts')!
            expect(config).toContain('tsconfigPaths: true')
            expect(config).not.toContain('vite.resolve.alias')
        }
    })
})

describe('writeFiles', () => {
    it('пишет файлы и создаёт вложенные каталоги', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'create-tusten-'))
        try {
            await writeFiles(dir, [{ path: 'a/b.txt', content: 'hello' }], false)
            await expect(readFile(join(dir, 'a/b.txt'), 'utf8')).resolves.toBe('hello')
        } finally {
            await rm(dir, { recursive: true, force: true })
        }
    })

    it('без --force не перезаписывает существующие файлы', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'create-tusten-'))
        try {
            await writeFile(join(dir, 'a.txt'), 'old')
            await expect(writeFiles(dir, [{ path: 'a.txt', content: 'new' }], false)).rejects.toThrow(/уже существуют/)
            await expect(readFile(join(dir, 'a.txt'), 'utf8')).resolves.toBe('old')
        } finally {
            await rm(dir, { recursive: true, force: true })
        }
    })

    it('с --force перезаписывает', async () => {
        const dir = await mkdtemp(join(tmpdir(), 'create-tusten-'))
        try {
            await writeFile(join(dir, 'a.txt'), 'old')
            await writeFiles(dir, [{ path: 'a.txt', content: 'new' }], true)
            await expect(readFile(join(dir, 'a.txt'), 'utf8')).resolves.toBe('new')
        } finally {
            await rm(dir, { recursive: true, force: true })
        }
    })
})
