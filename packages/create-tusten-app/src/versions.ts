import corePackage from '../../tusten/package.json'
import rootPackage from '../../../package.json'

/**
 * Версии зависимостей для сгенерированного приложения.
 *
 * Единый источник правды:
 *   - версия `@tusten/core` и его peer-зависимости берутся из
 *     `packages/tusten/package.json` в момент сборки `create-tusten-app`;
 *   - инструменты (TypeScript, ESLint, Prettier, типы) — из devDependencies
 *     корневого `package.json`, чтобы скаффолд не разъезжался с монорепо.
 *
 * tsup инлайнит JSON в `dist`, поэтому published-пакет не читает файлы
 * фреймворка в рантайме.
 */

const peer = corePackage.peerDependencies as Record<string, string>
const dev = rootPackage.devDependencies as Record<string, string>

/**
 * Берёт значение из карты версий.
 *
 * @param map карта версий.
 * @param key имя пакета.
 * @param fallback значение на случай отсутствия.
 * @returns диапазон версии.
 */
function pick(map: Record<string, string>, key: string, fallback: string): string {
    return map[key] ?? fallback
}

/** Версия `@tusten/core`, с которой синхронизирован скаффолдер. */
export const CORE_VERSION: string = corePackage.version

/** Версии peer-зависимостей ядра — их generated app должен поставить сам. */
export const PEER_VERSIONS = {
    react: pick(peer, 'react', '^19.0.0'),
    'react-dom': pick(peer, 'react-dom', '^19.0.0'),
    fastify: pick(peer, 'fastify', '^5.12.8'),
    vite: pick(peer, 'vite', '^8.3.7'),
    '@vitejs/plugin-react': pick(peer, '@vitejs/plugin-react', '^6.3.0'),
} as const

/**
 * Версии инструментов.
 *
 * ESLint намеренно 9.x: flat config и `typescript-eslint` 8-й линии проверены
 * в этом монорепо. TypeScript — 5.x по той же причине (ядро собрано на нём).
 */
export const TOOL_VERSIONS = {
    typescript: pick(dev, 'typescript', '^5.7.2'),
    '@types/node': pick(dev, '@types/node', '^22.10.2'),
    '@types/react': pick(dev, '@types/react', '^19.3.0'),
    '@types/react-dom': pick(dev, '@types/react-dom', '^19.3.0'),
    eslint: pick(dev, 'eslint', '^9.17.0'),
    '@eslint/js': pick(dev, '@eslint/js', '^9.17.0'),
    'typescript-eslint': pick(dev, 'typescript-eslint', '^8.18.0'),
    globals: pick(dev, 'globals', '^17.14.0'),
    prettier: pick(dev, 'prettier', '^3.9.10'),
    'eslint-config-prettier': pick(dev, 'eslint-config-prettier', '^10.1.8'),
    'eslint-plugin-react-hooks': '^7.1.1',
    'eslint-plugin-react-refresh': '^0.5.8',
    tailwindcss: '^4.3.5',
    '@tailwindcss/vite': '^4.3.5',
} as const

/** Имя инструмента из `TOOL_VERSIONS`. */
export type ToolName = keyof typeof TOOL_VERSIONS
