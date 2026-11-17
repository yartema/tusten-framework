import { PassThrough } from 'node:stream'
import { createElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ServerResponse } from 'node:http'
import type { Responder } from '../../../../packages/tusten/src/server/ssr/response'
import { pipeSsrDocument } from '../../../../packages/tusten/src/server/ssr/ssr-stream'

/** Ответчик с подменённым `beginStream`. */
function makeResponder() {
    const raw = new PassThrough()
    const chunks: string[] = []
    raw.on('data', (chunk: Buffer) => chunks.push(chunk.toString()))

    let started = false
    const fail = vi.fn()

    const responder: Responder = {
        get committed() {
            return started
        },
        send: vi.fn(),
        redirect: vi.fn(),
        fail,
        beginStream() {
            started = true
            return raw as unknown as ServerResponse
        },
    }

    return { responder, raw, chunks, fail }
}

/** Ждёт завершения записи в `PassThrough`. */
function finished(raw: PassThrough): Promise<void> {
    return new Promise((resolve) => raw.on('finish', resolve))
}

describe('pipeSsrDocument', () => {
    it('пишет префикс, HTML и хвост с ошибками стрима', async () => {
        const { responder, raw, chunks } = makeResponder()
        const buildTail = vi.fn(() => '|TAIL|')

        pipeSsrDocument({
            element: createElement('div', null, 'hello'),
            prefix: '<html><body>',
            responder,
            fixStack: vi.fn(),
            buildTail,
        })

        await finished(raw)

        const html = chunks.join('')
        expect(html.startsWith('<html><body>')).toBe(true)
        expect(html).toContain('hello')
        expect(html.endsWith('|TAIL|')).toBe(true)
        expect(buildTail).toHaveBeenCalledWith([])
        expect(responder.committed).toBe(true)
    })

    it('не пишет, если ответ уже занят или клиент отключился', async () => {
        const { responder, raw, chunks, fail } = makeResponder()
        responder.beginStream = () => null

        pipeSsrDocument({
            element: createElement('div', null, 'hello'),
            prefix: '<html><body>',
            responder,
            fixStack: vi.fn(),
            buildTail: () => '|TAIL|',
        })

        // Дать стриму шанс отработать; записи быть не должно.
        await new Promise((resolve) => setTimeout(resolve, 30))

        expect(chunks).toEqual([])
        expect(fail).not.toHaveBeenCalled()
        expect(raw.writableEnded).toBe(false)
    })
})
