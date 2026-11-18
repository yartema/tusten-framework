import path from 'node:path'
import { devCommand, installCommand } from './commands'
import { HELP_TEXT, CliError, parseArgs, resolveOptions } from './options'
import { planProject } from './plan'
import { createPrompter } from './prompts'
import { createProjectFiles, initGit, installDependencies, prepareTarget } from './scaffold'
import { CORE_VERSION } from './versions'
import packageJson from '../package.json'

/**
 * Печатает итоговые инструкции.
 *
 * @param targetDir куда создан проект.
 * @param pm пакетный менеджер.
 * @param installed установлены ли зависимости.
 * @param coreSpec спека `@tusten/core`.
 */
function printSuccess(
    targetDir: string,
    pm: Parameters<typeof installCommand>[0],
    installed: boolean,
    coreSpec: string,
): void {
    const relative = path.relative(process.cwd(), targetDir)
    const inPlace = relative === ''

    console.log(`\nПроект создан: ${targetDir}`)
    console.log(`@tusten/core: ${coreSpec}\n`)
    console.log('Дальше:')
    if (!inPlace) console.log(`  cd "${relative}"`)
    if (!installed) console.log(`  ${installCommand(pm)}`)
    console.log(`  ${devCommand(pm)}`)
    console.log('\n  http://127.0.0.1:3000\n')
}

/**
 * Точка входа CLI.
 *
 * @param argv аргументы после имени бинарника.
 */
export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
    let parsed
    try {
        parsed = parseArgs(argv)
    } catch (err) {
        console.error(err instanceof Error ? err.message : String(err))
        process.exitCode = 1
        return
    }

    if (parsed.help) {
        console.log(HELP_TEXT)
        return
    }
    if (parsed.version) {
        console.log(`create-tusten-app ${packageJson.version} (@tusten/core ${CORE_VERSION})`)
        return
    }

    const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY)
    const prompter = createPrompter()

    try {
        const options = await resolveOptions(parsed, { cwd: process.cwd(), interactive, prompter })

        const ready = await prepareTarget(options.targetDir, options.force, interactive, prompter)
        if (!ready) {
            console.log('Отменено.')
            return
        }

        const files = await planProject(options)
        await createProjectFiles(options, files)

        const installed = options.install ? await installDependencies(options.packageManager, options.targetDir) : false
        if (options.git) await initGit(options.targetDir)

        printSuccess(options.targetDir, options.packageManager, installed, options.coreSpec)
    } catch (err) {
        if (err instanceof CliError) {
            console.error(`\n${err.message}`)
        } else {
            console.error(err instanceof Error ? (err.stack ?? err.message) : String(err))
        }
        process.exitCode = 1
    } finally {
        prompter.close()
    }
}
