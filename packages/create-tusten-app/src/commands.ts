import type { PackageManager } from './options'

/**
 * Команда установки зависимостей.
 *
 * @param pm пакетный менеджер.
 * @returns команда для копирования в README.
 */
export function installCommand(pm: PackageManager): string {
    switch (pm) {
        case 'npm':
            return 'npm install'
        case 'yarn':
            return 'yarn'
        case 'bun':
            return 'bun install'
        case 'pnpm':
        default:
            return 'pnpm install'
    }
}

/**
 * Команда запуска dev-сервера.
 *
 * @param pm пакетный менеджер.
 * @returns команда для README и подсказки после скаффолда.
 */
export function devCommand(pm: PackageManager): string {
    switch (pm) {
        case 'npm':
            return 'npm run dev'
        case 'yarn':
            return 'yarn dev'
        case 'bun':
            return 'bun run dev'
        case 'pnpm':
        default:
            return 'pnpm dev'
    }
}
