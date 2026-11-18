import path from 'node:path'
import { toPackageName } from './name'
import type { Prompter } from './prompts'
import { CORE_VERSION } from './versions'

/** Поддерживаемые пакетные менеджеры. */
export const PACKAGE_MANAGERS = ['pnpm', 'npm', 'yarn', 'bun'] as const

/** Пакетный менеджер, выбранный при скаффолде. */
export type PackageManager = (typeof PACKAGE_MANAGERS)[number]

/** Сырые аргументы CLI: `undefined` — флаг не передан. */
export interface CliOptions {
    /** Имя каталога или `.` для текущей папки. */
    target: string | null
    tailwind?: boolean
    eslint?: boolean
    prettier?: boolean
    packageManager?: PackageManager
    install?: boolean
    git?: boolean
    yes: boolean
    force: boolean
    /** Спека `@tusten/core` (версия или `file:...`). */
    core?: string
    help: boolean
    version: boolean
}

/** Полностью разрешённые опции скаффолда. */
export interface ScaffoldOptions {
    /** Абсолютный путь целевой папки. */
    targetDir: string
    /** Имя npm-пакета для generated `package.json`. */
    packageName: string
    tailwind: boolean
    eslint: boolean
    prettier: boolean
    packageManager: PackageManager
    install: boolean
    git: boolean
    force: boolean
    /** Спека `@tusten/core` в generated `package.json`. */
    coreSpec: string
}

/** Значения по умолчанию (они же — ответы для `--yes`). */
export const DEFAULT_OPTIONS = {
    tailwind: true,
    eslint: true,
    prettier: true,
    packageManager: 'pnpm' as PackageManager,
    install: true,
    git: false,
}

/** Ошибка CLI с текстом для пользователя. */
export class CliError extends Error {}

/**
 * Разбирает argv.
 *
 * @param argv аргументы после имени бинарника.
 * @returns разобранные опции.
 * @throws {CliError} при неизвестном флаге или значении.
 */
export function parseArgs(argv: string[]): CliOptions {
    const options: CliOptions = {
        target: null,
        yes: false,
        force: false,
        help: false,
        version: false,
    }

    /**
     * Читает значение флага.
     *
     * @param index индекс флага.
     * @param flag имя флага для ошибки.
     * @returns значение и новый индекс.
     */
    const valueOf = (index: number, flag: string): [string, number] => {
        const value = argv[index + 1]
        if (!value || value.startsWith('-')) {
            throw new CliError(`Флаг ${flag} требует значение`)
        }
        return [value, index + 1]
    }

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]!

        // `npm create tusten-app@latest -- my-app`: всё после `--` — позиционные.
        if (arg === '--') {
            for (const rest of argv.slice(i + 1)) {
                if (options.target) throw new CliError(`Лишний аргумент: ${rest}`)
                options.target = rest
            }
            break
        }

        switch (arg) {
            case '--tailwind':
                options.tailwind = true
                break
            case '--no-tailwind':
                options.tailwind = false
                break
            case '--eslint':
                options.eslint = true
                break
            case '--no-eslint':
                options.eslint = false
                break
            case '--prettier':
                options.prettier = true
                break
            case '--no-prettier':
                options.prettier = false
                break
            case '--install':
                options.install = true
                break
            case '--no-install':
                options.install = false
                break
            case '--git':
                options.git = true
                break
            case '--no-git':
                options.git = false
                break
            case '-y':
            case '--yes':
                options.yes = true
                break
            case '--force':
                options.force = true
                break
            case '--pm': {
                const [value, next] = valueOf(i, '--pm')
                options.packageManager = parsePackageManager(value)
                i = next
                break
            }
            case '--core': {
                const [value, next] = valueOf(i, '--core')
                options.core = value
                i = next
                break
            }
            case '-h':
            case '--help':
                options.help = true
                break
            case '-v':
            case '--version':
                options.version = true
                break
            default:
                if (arg.startsWith('-')) {
                    throw new CliError(`Неизвестный флаг: ${arg}`)
                }
                if (options.target) {
                    throw new CliError(`Лишний аргумент: ${arg}`)
                }
                options.target = arg
                break
        }
    }

    return options
}

/**
 * Проверяет и нормализует имя пакетного менеджера.
 *
 * @param value значение флага.
 * @returns пакетный менеджер.
 * @throws {CliError} если менеджер не поддерживается.
 */
export function parsePackageManager(value: string): PackageManager {
    if ((PACKAGE_MANAGERS as readonly string[]).includes(value)) {
        return value as PackageManager
    }
    throw new CliError(`Неизвестный пакетный менеджер "${value}". Доступны: ${PACKAGE_MANAGERS.join(', ')}`)
}

/**
 * Разрешает опции: добивает недостающие ответы промптами или дефолтами.
 *
 * В интерактивном режиме спрашиваем только то, что не передано флагом.
 * В non-TTY без `--yes` все ответы должны быть заданы явно — иначе ошибка,
 * чтобы не создать проект «наугад».
 *
 * @param parsed результат `parseArgs`.
 * @param context контекст выполнения.
 * @param context.cwd текущий каталог.
 * @param context.interactive есть ли TTY для вопросов.
 * @param context.prompter промптер (создаётся в CLI).
 * @returns разрешённые опции.
 * @throws {CliError} если не хватает данных или путь некорректен.
 */
export async function resolveOptions(
    parsed: CliOptions,
    context: { cwd: string; interactive: boolean; prompter: Prompter },
): Promise<ScaffoldOptions> {
    const { cwd, interactive, prompter } = context

    let target = parsed.target
    if (!target) {
        if (!interactive) {
            throw new CliError('Укажите папку проекта: create-tusten-app <dir> (или "." для текущей)')
        }
        target = await prompter.text('Куда создать проект (имя папки или ".")')
        if (!target.trim()) throw new CliError('Имя папки не может быть пустым')
    }

    const targetDir = target === '.' ? cwd : path.resolve(cwd, target)

    if (!parsed.yes && !interactive) {
        const missing: string[] = []
        if (parsed.tailwind === undefined) missing.push('--tailwind/--no-tailwind')
        if (parsed.eslint === undefined) missing.push('--eslint/--no-eslint')
        if (parsed.prettier === undefined) missing.push('--prettier/--no-prettier')
        if (parsed.packageManager === undefined) missing.push('--pm')
        if (parsed.install === undefined) missing.push('--install/--no-install')
        if (parsed.git === undefined) missing.push('--git/--no-git')
        if (missing.length > 0) {
            throw new CliError(`Нет TTY для вопросов. Передайте флаги (${missing.join(', ')}) или используйте --yes`)
        }
    }

    const tailwind = parsed.yes
        ? (parsed.tailwind ?? DEFAULT_OPTIONS.tailwind)
        : await askBool(parsed.tailwind, interactive, prompter, 'Использовать Tailwind CSS?', DEFAULT_OPTIONS.tailwind)
    const eslint = parsed.yes
        ? (parsed.eslint ?? DEFAULT_OPTIONS.eslint)
        : await askBool(parsed.eslint, interactive, prompter, 'Добавить ESLint?', DEFAULT_OPTIONS.eslint)
    const prettier = parsed.yes
        ? (parsed.prettier ?? DEFAULT_OPTIONS.prettier)
        : await askBool(parsed.prettier, interactive, prompter, 'Добавить Prettier?', DEFAULT_OPTIONS.prettier)

    const packageManager =
        parsed.packageManager ??
        (parsed.yes
            ? DEFAULT_OPTIONS.packageManager
            : await prompter.select<PackageManager>(
                  'Пакетный менеджер',
                  PACKAGE_MANAGERS.map((pm) => ({ value: pm, label: pm })),
                  PACKAGE_MANAGERS.indexOf(DEFAULT_OPTIONS.packageManager),
              ))

    const install = parsed.yes
        ? (parsed.install ?? DEFAULT_OPTIONS.install)
        : await askBool(parsed.install, interactive, prompter, 'Установить зависимости?', DEFAULT_OPTIONS.install)
    const git = parsed.yes
        ? (parsed.git ?? DEFAULT_OPTIONS.git)
        : await askBool(parsed.git, interactive, prompter, 'Инициализировать git-репозиторий?', DEFAULT_OPTIONS.git)

    return {
        targetDir,
        packageName: toPackageName(path.basename(targetDir)),
        tailwind,
        eslint,
        prettier,
        packageManager,
        install,
        git,
        force: parsed.force,
        coreSpec: normalizeCoreSpec(parsed.core, cwd),
    }
}

/**
 * Нормализует спеку `@tusten/core`.
 *
 * Относительный `file:`-путь пользователь указывает от текущего каталога, но
 * попадает он в `package.json` другого проекта. Приводим его к абсолютному,
 * иначе npm/pnpm будут искать пакет внутри созданного приложения.
 *
 * @param spec значение `--core` (или `undefined`).
 * @param cwd каталог запуска.
 * @returns npm-spec для generated `package.json`.
 */
export function normalizeCoreSpec(spec: string | undefined, cwd: string): string {
    if (!spec) return CORE_VERSION
    if (!spec.startsWith('file:')) return spec

    const raw = spec.slice('file:'.length)
    if (!raw.trim()) throw new CliError('Флаг --core получил пустой file:-путь')
    const absolute = path.isAbsolute(raw) ? raw : path.resolve(cwd, raw)
    return `file:${absolute.replace(/\\/g, '/')}`
}

/**
 * Спрашивает да/нет, если ответ не задан флагом.
 *
 * @param value явный ответ.
 * @param interactive можно ли спрашивать.
 * @param prompter промптер.
 * @param question текст вопроса.
 * @param fallback значение по умолчанию.
 * @returns ответ.
 */
async function askBool(
    value: boolean | undefined,
    interactive: boolean,
    prompter: Prompter,
    question: string,
    fallback: boolean,
): Promise<boolean> {
    if (value !== undefined) return value
    if (!interactive) return fallback
    return prompter.confirm(question, fallback)
}

/** Текст `--help`. */
export const HELP_TEXT = `create-tusten-app — скаффолдер приложения на tusten

Использование:
  create-tusten-app [dir] [options]

Аргументы:
  dir                       имя новой папки или "." для текущей

Опции:
  --tailwind / --no-tailwind     Tailwind CSS (по умолчанию да)
  --eslint / --no-eslint         ESLint (по умолчанию да)
  --prettier / --no-prettier     Prettier (по умолчанию да)
  --pm <pnpm|npm|yarn|bun>       пакетный менеджер (по умолчанию pnpm)
  --install / --no-install       установить зависимости (по умолчанию да)
  --git / --no-git               git init + первый коммит (по умолчанию нет)
  --core <spec>                  версия или file:-спека @tusten/core
  -y, --yes                      все ответы по умолчанию, без вопросов
  --force                        писать в непустую папку / перезаписывать файлы
  -h, --help                     эта справка
  -v, --version                  версия скаффолдера

Примеры:
  npm create tusten-app@latest my-app
  pnpm create tusten-app my-app
  create-tusten-app . --yes
`
