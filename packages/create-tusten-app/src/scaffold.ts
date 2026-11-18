import path from 'node:path'
import { promises as fs } from 'node:fs'
import { spawn } from 'node:child_process'
import { CliError, type PackageManager, type ScaffoldOptions } from './options'
import type { Prompter } from './prompts'
import type { PlannedFile } from './templates'

/**
 * Проверяет, можно ли писать в целевую папку.
 *
 * Существующие файлы не удаляются и не перезаписываются без `--force` —
 * скаффолдер не должен портить чужой проект.
 *
 * @param targetDir целевая папка.
 * @param force писать в непустую папку.
 * @param interactive можно ли спросить пользователя.
 * @param prompter промптер.
 * @returns `true`, если можно продолжать.
 */
export async function prepareTarget(
    targetDir: string,
    force: boolean,
    interactive: boolean,
    prompter: Prompter,
): Promise<boolean> {
    let entries: string[]
    try {
        entries = await fs.readdir(targetDir)
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
            await fs.mkdir(targetDir, { recursive: true })
            return true
        }
        throw new CliError(`Не удалось прочитать папку ${targetDir}: ${(err as Error).message}`)
    }

    const meaningful = entries.filter((entry) => entry !== '.git')
    if (meaningful.length === 0 || force) return true

    if (!interactive) {
        throw new CliError(`Папка ${targetDir} не пуста. Используйте --force, чтобы писать в неё.`)
    }

    const confirmed = await prompter.confirm(`Папка ${targetDir} не пуста. Продолжить?`, false)
    return confirmed
}

/**
 * Записывает запланированные файлы.
 *
 * Сначала проверяются конфликты: если хотя бы один файл уже существует и нет
 * `--force`, не пишем ничего.
 *
 * @param targetDir корень проекта.
 * @param files файлы.
 * @param force перезаписывать существующие.
 * @throws {CliError} если есть конфликты.
 */
export async function writeFiles(targetDir: string, files: PlannedFile[], force: boolean): Promise<void> {
    if (!force) {
        const conflicts: string[] = []
        for (const file of files) {
            try {
                await fs.access(path.join(targetDir, file.path))
                conflicts.push(file.path)
            } catch {
                // Файла нет — это нормально.
            }
        }
        if (conflicts.length > 0) {
            throw new CliError(
                `Эти файлы уже существуют:\n  ${conflicts.join('\n  ')}\n` +
                    'Используйте --force, чтобы перезаписать их, или выберите другую папку.',
            )
        }
    }

    for (const file of files) {
        const absolute = path.join(targetDir, file.path)
        await fs.mkdir(path.dirname(absolute), { recursive: true })
        await fs.writeFile(absolute, file.content, 'utf8')
    }
}

/**
 * Запускает команду и ждёт её завершения.
 *
 * Windows: `pnpm`/`npm` — это `.cmd`-шимы, поэтому для пакетных менеджеров
 * нужен shell. `git` — обычный `.exe`, его запускаем напрямую: shell ломает
 * аргументы с пробелами (`git commit -m "Initial commit"`).
 *
 * @param command команда.
 * @param args аргументы.
 * @param cwd рабочий каталог.
 * @param useShell запускать через shell (для `.cmd`-шимов).
 * @throws {CliError} при ненулевом exit code.
 */
async function run(command: string, args: string[], cwd: string, useShell = false): Promise<void> {
    await new Promise<void>((resolve, reject) => {
        const child =
            useShell && process.platform === 'win32'
                ? spawn([command, ...args].join(' '), { cwd, stdio: 'inherit', shell: true })
                : spawn(command, args, { cwd, stdio: 'inherit' })

        child.on('error', reject)
        child.on('close', (code) => {
            if (code === 0) resolve()
            else reject(new CliError(`Команда "${command} ${args.join(' ')}" завершилась с кодом ${code}`))
        })
    })
}

/**
 * Устанавливает зависимости выбранным пакетным менеджером.
 *
 * @param pm пакетный менеджер.
 * @param targetDir каталог проекта.
 * @returns `true`, если установка прошла успешно.
 */
export async function installDependencies(pm: PackageManager, targetDir: string): Promise<boolean> {
    const args = pm === 'yarn' ? [] : ['install']
    try {
        await run(pm, args, targetDir, true)
        return true
    } catch (err) {
        console.warn(`\n[create-tusten-app] Не удалось установить зависимости: ${(err as Error).message}`)
        console.warn(`Установите вручную: cd "${targetDir}" && ${pm}${args.length ? ` ${args.join(' ')}` : ''}`)
        return false
    }
}

/**
 * Инициализирует git-репозиторий и делает первый коммит.
 *
 * Ошибка коммита (нет `user.name`/`user.email`) — предупреждение, а не падение:
 * проект уже создан и пригоден к работе.
 *
 * @param targetDir каталог проекта.
 * @returns `true`, если репозиторий создан.
 */
export async function initGit(targetDir: string): Promise<boolean> {
    try {
        await run('git', ['init'], targetDir)
        await run('git', ['add', '-A'], targetDir)
        await run('git', ['commit', '-m', 'Initial commit'], targetDir)
        return true
    } catch (err) {
        console.warn(`\n[create-tusten-app] git init не завершён: ${(err as Error).message}`)
        return false
    }
}

/**
 * Создаёт проект: планирует файлы, проверяет конфликты, пишет.
 *
 * @param options опции.
 * @param files запланированные файлы.
 */
export async function createProjectFiles(options: ScaffoldOptions, files: PlannedFile[]): Promise<void> {
    await writeFiles(options.targetDir, files, options.force)
}
