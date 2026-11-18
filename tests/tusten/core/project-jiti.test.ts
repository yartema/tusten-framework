import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createProjectJiti } from '../../../packages/tusten/src/utils/project-jiti'

/** Временный корень тестов. */
let tmpRoot: string

beforeAll(async () => {
    tmpRoot = await mkdtemp(join(tmpdir(), 'tusten-project-jiti-'))
})

afterAll(async () => {
    await rm(tmpRoot, { recursive: true, force: true })
})

describe('createProjectJiti', () => {
    it('резолвит compilerOptions.paths из tsconfig проекта', async () => {
        const dir = join(tmpRoot, 'aliased')
        await mkdir(join(dir, 'server'), { recursive: true })
        await writeFile(
            join(dir, 'tsconfig.json'),
            JSON.stringify({ compilerOptions: { paths: { '@server/*': ['./server/*'] } } }),
        )
        await writeFile(join(dir, 'server/greeting.ts'), `export const greeting = 'ok'\n`)
        await writeFile(
            join(dir, 'server/entry.ts'),
            `import { greeting } from '@server/greeting'\nexport default greeting\n`,
        )

        const jiti = createProjectJiti(dir)
        const mod = (await jiti.import(join(dir, 'server/entry.ts'))) as { default: string }

        expect(mod.default).toBe('ok')
    })

    it('без tsconfig — загружает модуль по относительному пути', async () => {
        const dir = join(tmpRoot, 'plain')
        await mkdir(join(dir, 'server'), { recursive: true })
        await writeFile(join(dir, 'server/util.ts'), `export const value = 42\n`)
        await writeFile(join(dir, 'server/entry.ts'), `import { value } from './util'\nexport default value\n`)

        const jiti = createProjectJiti(dir)
        const mod = (await jiti.import(join(dir, 'server/entry.ts'))) as { default: number }

        expect(mod.default).toBe(42)
    })

    it('переопределяет опции вызывающего кода', async () => {
        const dir = join(tmpRoot, 'options')
        await mkdir(dir, { recursive: true })
        await writeFile(join(dir, 'value.ts'), `export default 'named'\nexport const named = 'named-exports'\n`)

        const jiti = createProjectJiti(dir, { interopDefault: false })
        const mod = (await jiti.import(join(dir, 'value.ts'))) as Record<string, unknown>

        expect(mod.named).toBe('named-exports')
    })
})
