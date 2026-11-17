import { defineConfig } from 'vitest/config'

/**
 * Конфигурация тестов tusten.
 *
 * Тесты живут в `tests/tusten` (зеркало `packages/tusten/src`) и импортируют
 * исходники относительными путями — без сборки пакета.
 *
 * - `environment: 'node'` — по умолчанию. Для тестов React-хуков —
 *   `// @vitest-environment jsdom` в шапке файла.
 * - Coverage считается по исходникам пакета; тесты и баррели исключены.
 */
export default defineConfig({
    test: {
        include: ['tests/tusten/**/*.test.{ts,tsx}'],
        exclude: ['node_modules', 'dist'],
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            include: ['packages/tusten/src/**/*.ts', 'packages/tusten/src/**/*.tsx'],
            exclude: ['**/*.test.ts', '**/*.test.tsx', '**/index.ts', '**/*.d.ts'],
            thresholds: {
                lines: 60,
                functions: 60,
                branches: 60,
                statements: 60,
            },
        },
    },
})
