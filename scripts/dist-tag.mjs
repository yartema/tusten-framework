#!/usr/bin/env node
/**
 * Явно ставит `dist-tags` на опубликованную версию пакета.
 *
 * `npm publish --tag <tag>` в npm 11 / pnpm 12 не всегда обновляет теги,
 * поэтому релизные скрипты повторяют `npm dist-tag add`. Версия читается из
 * `package.json`, чтобы не хардкодить её в корневом `package.json` и не
 * забывать править при каждом bump'е.
 * @example
 * // node scripts/dist-tag.mjs packages/tusten/package.json beta latest
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const [manifestPath, ...tags] = process.argv.slice(2)

if (!manifestPath || tags.length === 0) {
    console.error('usage: node scripts/dist-tag.mjs <path/to/package.json> <tag> [tag...]')
    process.exit(1)
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const spec = `${manifest.name}@${manifest.version}`

for (const tag of tags) {
    execSync(`npm dist-tag add "${spec}" "${tag}"`, { stdio: 'inherit' })
}
