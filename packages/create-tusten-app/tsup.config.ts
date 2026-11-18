import { defineConfig } from 'tsup'

/**
 * Сборка `create-tusten-app`.
 *
 * Все зависимости — Node built-ins: бандлим в один ESM-файл, чтобы published
 * пакет не тянул ничего лишнего. Шебанг не нужен: его добавляет bin-wrapper.
 */
export default defineConfig({
    entry: {
        index: 'src/index.ts',
    },
    format: ['esm'],
    target: 'node20',
    platform: 'node',
    dts: false,
    clean: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
})
