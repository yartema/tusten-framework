import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FastifyReply } from 'fastify'
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
