import { PassThrough } from 'node:stream'
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
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

/**
 * Ответчик для проверки сжатого стрима: собирает байты и запоминает заголовки,
 * переданные в `beginStream`.
 *
 * @returns ответчик, поток и аккумулятор.
 */
function makeCompressedResponder() {
    const raw = new PassThrough()
    const buffers: Buffer[] = []
    raw.on('data', (chunk: Buffer) => buffers.push(Buffer.from(chunk)))

    const headersSeen: Record<string, string> = {}
    let started = false

    const responder: Responder = {
        get committed() {
            return started
        },
        send: vi.fn(),
        redirect: vi.fn(),
        fail: vi.fn(),
        beginStream(_status, headers) {
            started = true
            Object.assign(headersSeen, headers ?? {})
            return raw as unknown as ServerResponse
        },
    }

    return { responder, raw, buffers, headersSeen }
}

describe('pipeSsrDocument: сжатие', () => {
    it('brotli: префикс, документ и хвост попадают в сжатый поток', async () => {
        const { responder, raw, buffers, headersSeen } = makeCompressedResponder()

        pipeSsrDocument({
            element: createElement('div', null, 'hello'),
            prefix: '<html><body>',
            responder,
            headers: { Vary: 'Accept-Language, Cookie' },
            fixStack: vi.fn(),
            buildTail: () => '|TAIL|',
            compression: { threshold: 0, encodings: ['br'] },
            acceptEncoding: 'gzip, br',
        })

        await finished(raw)

        const html = brotliDecompressSync(Buffer.concat(buffers)).toString()
        expect(html.startsWith('<html><body>')).toBe(true)
        expect(html).toContain('hello')
        expect(html.endsWith('|TAIL|')).toBe(true)
        expect(headersSeen['Content-Encoding']).toBe('br')
        expect(headersSeen.Vary).toBe('Accept-Language, Cookie, Accept-Encoding')
    })

    it('gzip, если brotli не запрошен', async () => {
        const { responder, raw, buffers, headersSeen } = makeCompressedResponder()

        pipeSsrDocument({
            element: createElement('div', null, 'hello'),
            prefix: '<p>',
            responder,
            fixStack: vi.fn(),
            buildTail: () => '|TAIL|',
            compression: { threshold: 0, encodings: ['br', 'gzip'] },
            acceptEncoding: 'gzip',
        })

        await finished(raw)

        const html = gunzipSync(Buffer.concat(buffers)).toString()
        expect(html.startsWith('<p>')).toBe(true)
        expect(html.endsWith('|TAIL|')).toBe(true)
        expect(headersSeen['Content-Encoding']).toBe('gzip')
    })

    it('без Accept-Encoding — обычный поток без заголовка', async () => {
        const { responder, raw, buffers, headersSeen } = makeCompressedResponder()

        pipeSsrDocument({
            element: createElement('div', null, 'hello'),
            prefix: '<p>',
            responder,
            fixStack: vi.fn(),
            buildTail: () => '|TAIL|',
            compression: { threshold: 0, encodings: ['br', 'gzip'] },
        })

        await finished(raw)

        expect(Buffer.concat(buffers).toString()).toContain('<p>')
        expect(headersSeen['Content-Encoding']).toBeUndefined()
    })
})
