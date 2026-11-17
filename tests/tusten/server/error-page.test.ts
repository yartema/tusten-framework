import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
    buildDevErrorPage,
    buildDevErrorsScript,
    buildProdErrorPage,
    createErrorId,
    parseStackFrames,
    serializeError,
} from '../../../packages/tusten/src/server/error-page'

describe('serializeError', () => {
    it('берёт name/message/stack из Error', () => {
        const error = new TypeError('boom')
        expect(serializeError(error)).toEqual({
            name: 'TypeError',
            message: 'boom',
            stack: error.stack,
        })
    })

    it('принимает строку и произвольный объект', () => {
        expect(serializeError('oops')).toEqual({ name: 'Error', message: 'oops' })
        expect(serializeError({ code: 42 }).message).toContain('42')
        expect(serializeError(undefined).message).toBe('undefined')
        expect(serializeError(null).message).toBe('null')
    })
})

describe('createErrorId', () => {
    it('стабилен и короткий', () => {
        const stack = 'Error: boom\n    at a (b.ts:1:1)'
        const first = new Error('boom')
        first.stack = stack
        const second = new Error('boom')
        second.stack = stack

        expect(createErrorId(first)).toBe(createErrorId(second))
        expect(createErrorId(first)).toMatch(/^[0-9a-f]{8}$/)
    })

    it('различает разные ошибки', () => {
        const stack = 'Error: x\n    at a (b.ts:1:1)'
        const a = new Error('x')
        a.stack = stack
        const b = new Error('y')
        b.stack = stack
        expect(createErrorId(a)).not.toBe(createErrorId(b))
    })
})

describe('parseStackFrames', () => {
    it('разбирает функции, async и file://', () => {
        const frames = parseStackFrames(`TypeError: x is not a function
    at View (file:///F:/project/client/HomePage/View.tsx:41:17)
    at async load (http://127.0.0.1:3000/client/loader.ts:7:3)
    at async Promise.all (index 0)`)

        expect(frames).toHaveLength(3)
        expect(frames[0]).toMatchObject({
            fn: 'View',
            file: 'F:/project/client/HomePage/View.tsx',
            line: 41,
            column: 17,
        })
        expect(frames[1]).toMatchObject({ fn: 'async load', file: 'http://127.0.0.1:3000/client/loader.ts' })
        expect(frames[2]).toEqual({ fn: 'async Promise.all', raw: 'at async Promise.all (index 0)' })
    })

    it('без стека — пустой список', () => {
        expect(parseStackFrames(undefined)).toEqual([])
        expect(parseStackFrames('Error: no frames')).toEqual([])
    })
})

describe('buildDevErrorPage', () => {
    it('показывает запрос, стек и code frame', () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tusten-error-page-'))
        const file = path.join(dir, 'View.tsx')
        fs.writeFileSync(file, 'const a = 1\nconst b = 2\nconst x = boom()\nconst c = 3\n')

        try {
            const error = new Error('boom')
            error.stack = `Error: boom\n    at View (${file}:3:9)`
            const html = buildDevErrorPage({
                errors: [error],
                request: { method: 'GET', url: '/broken?x=1' },
                projectDir: dir,
            })

            expect(html).toContain('GET /broken?x=1')
            expect(html).toContain('boom')
            expect(html).toContain('const x = boom()')
            expect(html).toContain('hl-line')
            expect(html).toContain('/__open-in-editor?file=')
        } finally {
            fs.rmSync(dir, { recursive: true, force: true })
        }
    })

    it('экранирует текст ошибки', () => {
        const html = buildDevErrorPage({
            errors: [new Error('<script>alert(1)</script>')],
            request: { method: 'GET', url: '/x' },
        })

        expect(html).not.toContain('<script>alert(1)</script>')
        expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    })

    it('не падает без стека', () => {
        const html = buildDevErrorPage({ errors: ['plain string'] })
        expect(html).toContain('plain string')
        expect(html).toContain('Стек недоступен')
    })
})

describe('buildDevErrorsScript', () => {
    it('пустой список — пустая строка', () => {
        expect(buildDevErrorsScript([])).toBe('')
    })

    it('сериализует ошибки и не даёт закрыть <script> раньше времени', () => {
        const html = buildDevErrorsScript([new Error('</script><script>alert(1)</script>')])
        expect(html.startsWith('<script>window.__TUSTEN_SSR_ERRORS__=')).toBe(true)
        expect(html).not.toContain('</script><script>alert(1)')
        expect(html).toContain('\\u003c/script')
    })
})

describe('buildProdErrorPage', () => {
    it('не раскрывает стек, но отдаёт id', () => {
        const html = buildProdErrorPage('deadbeef')
        expect(html).toContain('deadbeef')
        expect(html).toContain('Обновить страницу')
        expect(html).not.toContain('at ')
    })
})
