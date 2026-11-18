import { afterEach, describe, expect, it, vi } from 'vitest'
import { PassThrough } from 'node:stream'
import { gunzipSync } from 'node:zlib'
import type { FastifyReply } from 'fastify'
import type { CompressionOptions } from '../../../../packages/tusten/src/server/ssr/compression'
import { createResponder, createStackFixer } from '../../../../packages/tusten/src/server/ssr/response'

/** Фейковый `reply.raw`, достаточный для ответчика. */
function makeReply() {
    const headers: Record<string, string> = {}
    const bodies: string[] = []

    const raw = {
        statusCode: 200,
        headersSent: false,
        destroyed: false,
        writableEnded: false,
        setHeader(name: string, value: string) {
            headers[name] = value
        },
        end(body?: string) {
            if (body !== undefined) bodies.push(body)
            this.headersSent = true
            this.writableEnded = true
        },
        destroy() {
            this.destroyed = true
        },
    }

    return { reply: { raw } as unknown as FastifyReply, raw, headers, bodies }
}

const req = { method: 'GET', url: '/page?x=1' }

afterEach(() => {
    vi.restoreAllMocks()
})

describe('createResponder: send/redirect', () => {
    it('пишет статус, заголовки и тело', () => {
        const { reply, raw, headers, bodies } = makeReply()
        const responder = createResponder(req, reply, { isDev: false, projectDir: '/project' })

        responder.send(404, 'text/html; charset=utf-8', 'body', { Vary: 'Accept' })

        expect(raw.statusCode).toBe(404)
        expect(headers).toEqual({
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            Vary: 'Accept',
        })
        expect(bodies).toEqual(['body'])
        expect(responder.committed).toBe(true)
    })

    it('второй ответ игнорируется', () => {
        const { reply, bodies } = makeReply()
        const responder = createResponder(req, reply, { isDev: false, projectDir: '/project' })

        responder.send(200, 'text/plain', 'first')
        responder.send(500, 'text/plain', 'second')

        expect(bodies).toEqual(['first'])
    })

    it('редирект: 302, Location, без тела', () => {
        const { reply, raw, headers, bodies } = makeReply()
        const responder = createResponder(req, reply, { isDev: false, projectDir: '/project' })

        responder.redirect('/login')

        expect(raw.statusCode).toBe(302)
        expect(headers.Location).toBe('/login')
        expect(bodies).toEqual([])
    })
})

describe('createResponder: fail', () => {
    it('dev: 500, текст ошибки и правка стека', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const { reply, raw, bodies } = makeReply()
        const fixStack = vi.fn()
        const responder = createResponder(req, reply, { isDev: true, projectDir: '/project', fixStack })

        responder.fail('Shell error', new Error('boom'))

        expect(fixStack).toHaveBeenCalledOnce()
        expect(raw.statusCode).toBe(500)
        expect(bodies[0]).toContain('boom')
    })

    it('prod: id ошибки вместо стека', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const { reply, bodies } = makeReply()
        const responder = createResponder(req, reply, { isDev: false, projectDir: '/project' })

        responder.fail('Prefetch error', new Error('secret-path /src/app.ts'))

        expect(bodies[0]).toContain('Код ошибки')
        expect(bodies[0]).not.toContain('secret-path')
    })

    it('после отправленного ответа уничтожает незакрытый стрим', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const { reply, raw } = makeReply()
        const responder = createResponder(req, reply, { isDev: false, projectDir: '/project' })

        const stream = responder.beginStream(200)
        expect(stream).toBe(raw)

        raw.writableEnded = false
        responder.fail('SSR error', new Error('late'))

        expect(raw.destroyed).toBe(true)
    })
})

describe('createResponder: beginStream', () => {
    it('захватывает ответ и пишет заголовки стрима', () => {
        const { reply, raw, headers } = makeReply()
        const responder = createResponder(req, reply, { isDev: false, projectDir: '/project' })

        expect(responder.beginStream(500, { Vary: 'Cookie' })).toBe(raw)
        expect(raw.statusCode).toBe(500)
        expect(headers['Content-Type']).toBe('text/html; charset=utf-8')
        expect(headers.Vary).toBe('Cookie')
        expect(responder.committed).toBe(true)
    })

    it('после захвата send/redirect игнорируются', () => {
        const { reply, bodies, headers } = makeReply()
        const responder = createResponder(req, reply, { isDev: false, projectDir: '/project' })

        responder.beginStream(200)
        responder.send(500, 'text/plain', 'nope')
        responder.redirect('/nope')

        expect(bodies).toEqual([])
        expect(headers.Location).toBeUndefined()
    })

    it('отключённый клиент: null и committed', () => {
        const { reply, raw } = makeReply()
        raw.destroyed = true
        const responder = createResponder(req, reply, { isDev: false, projectDir: '/project' })

        expect(responder.beginStream(200)).toBeNull()
        expect(responder.committed).toBe(true)
    })
})

describe('createStackFixer', () => {
    it('глотает ошибку правки стека', () => {
        const fixer = createStackFixer(() => {
            throw new Error('no sourcemap')
        })
        expect(() => fixer(new Error('boom'))).not.toThrow()
    })

    it('без хука — no-op', () => {
        expect(() => createStackFixer()(new Error('boom'))).not.toThrow()
    })
})

/** Потоковый `reply.raw`: настоящий Writable, чтобы отработал zlib-пайплайн. */
function makeStreamReply() {
    const raw = new PassThrough()
    const headers: Record<string, string> = {}
    Object.assign(raw, {
        statusCode: 200,
        headersSent: false,
        setHeader(name: string, value: string) {
            headers[name] = value
        },
    })

    const chunks: Buffer[] = []
    raw.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))

    return {
        reply: { raw } as unknown as FastifyReply,
        raw,
        headers,
        chunks,
        /** Дожидается конца ответа и возвращает тело. */
        finished(): Promise<Buffer> {
            return new Promise((resolve) => raw.on('end', () => resolve(Buffer.concat(chunks))))
        },
    }
}

const compression: CompressionOptions = { threshold: 0, encodings: ['gzip'] }

describe('createResponder: сжатие готового тела', () => {
    it('gzip: Content-Encoding, Vary и разжимаемое тело', async () => {
        const { reply, headers, finished } = makeStreamReply()
        const responder = createResponder({ method: 'GET', url: '/spa' }, reply, {
            isDev: false,
            projectDir: '/project',
            compression,
            acceptEncoding: 'gzip',
        })

        const body = `<html>${'x'.repeat(2048)}</html>`
        responder.send(200, 'text/html; charset=utf-8', body, { Vary: 'Accept-Language, Cookie' })

        const sent = await finished()
        expect(headers['Content-Encoding']).toBe('gzip')
        expect(headers.Vary).toBe('Accept-Language, Cookie, Accept-Encoding')
        expect(gunzipSync(sent).toString()).toBe(body)
    })

    it('тело меньше threshold — без сжатия', async () => {
        const { reply, headers, finished } = makeStreamReply()
        const responder = createResponder({ method: 'GET', url: '/spa' }, reply, {
            isDev: false,
            projectDir: '/project',
            compression: { threshold: 1024, encodings: ['gzip'] },
            acceptEncoding: 'gzip',
        })

        responder.send(200, 'text/html; charset=utf-8', 'small')

        expect(await finished()).toEqual(Buffer.from('small'))
        expect(headers['Content-Encoding']).toBeUndefined()
    })

    it('несжимаемый content-type — без сжатия', async () => {
        const { reply, headers, finished } = makeStreamReply()
        const responder = createResponder({ method: 'GET', url: '/image' }, reply, {
            isDev: false,
            projectDir: '/project',
            compression,
            acceptEncoding: 'gzip',
        })

        responder.send(200, 'image/png', 'binary')

        await finished()
        expect(headers['Content-Encoding']).toBeUndefined()
    })

    it('клиент не просил сжатие — без сжатия', async () => {
        const { reply, headers, finished } = makeStreamReply()
        const responder = createResponder({ method: 'GET', url: '/spa' }, reply, {
            isDev: false,
            projectDir: '/project',
            compression,
            acceptEncoding: 'identity',
        })

        responder.send(200, 'text/html; charset=utf-8', 'x'.repeat(2048))

        await finished()
        expect(headers['Content-Encoding']).toBeUndefined()
    })

    it('сжатие выключено в конфиге — Accept-Encoding игнорируется', async () => {
        const { reply, headers, finished } = makeStreamReply()
        const responder = createResponder({ method: 'GET', url: '/spa' }, reply, {
            isDev: false,
            projectDir: '/project',
            compression: null,
            acceptEncoding: 'gzip',
        })

        responder.send(200, 'text/html; charset=utf-8', 'x'.repeat(2048))

        await finished()
        expect(headers['Content-Encoding']).toBeUndefined()
    })
})
