#!/usr/bin/env node
// Bin-entry `create-tusten-app`.
//
// В монорепо `src/` лежит рядом — грузим TS через jiti (без сборки).
// В published-пакете `src/` нет — грузим собранный `dist/index.js`.
//
// Windows: `import(absolutePath)` без `pathToFileURL` даёт
// ERR_UNSUPPORTED_ESM_URL_SCHEME.

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcEntry = join(__dirname, '..', 'src', 'index.ts')
const distEntry = join(__dirname, '..', 'dist', 'index.js')

let mod
if (existsSync(srcEntry)) {
    const { createJiti } = await import('jiti')
    const jiti = createJiti(import.meta.url, { interopDefault: true })
    mod = await jiti.import(srcEntry)
} else {
    mod = await import(pathToFileURL(distEntry).href)
}

await mod.main()
