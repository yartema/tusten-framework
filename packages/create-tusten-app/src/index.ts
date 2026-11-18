/**
 * Публичные точки для bin-wrapper'а и тестов.
 *
 * Сам CLI не запускается при импорте: `bin/create-tusten-app.mjs` явно
 * вызывает `main()`. Так тесты могут импортировать функции без побочных
 * эффектов.
 */
export { main } from './cli'
export { devCommand, installCommand } from './commands'
export { toPackageName } from './name'
export {
    CliError,
    DEFAULT_OPTIONS,
    HELP_TEXT,
    PACKAGE_MANAGERS,
    parseArgs,
    parsePackageManager,
    normalizeCoreSpec,
    resolveOptions,
    type CliOptions,
    type PackageManager,
    type ScaffoldOptions,
} from './options'
export { buildPackageJson, stringifyPackageJson, type GeneratedPackageJson } from './package-json'
export { planProject } from './plan'
export { createPrompter, type Prompter } from './prompts'
export { createProjectFiles, initGit, installDependencies, prepareTarget, writeFiles } from './scaffold'
export { packageRoot, readTemplateLayers, templateDir, type PlannedFile } from './templates'
export { CORE_VERSION, PEER_VERSIONS, TOOL_VERSIONS } from './versions'
