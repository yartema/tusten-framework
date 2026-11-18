import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import { Readable, Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { describe, expect, it } from 'vitest'
import {
    appendVary,
    createCompressor,
    isCompressibleContentType,
    negotiateEncoding,
    parseAcceptEncoding,
    withCompressionHeaders,
} from '../../../../packages/tusten/src/server/ssr/compression'

/**
 * Сжимает строку выбранным потоком и возвращает результат.
 *
 * @param encoding кодировка.
 * @param input исходный текст.
 * @returns сжатые байты.
 */
async function compressWith(encoding: 'br' | 'gzip', input: string): Promise<Buffer> {
    const chunks: Buffer[] = []
    const sink = new Writable({
        write(chunk, _enc, cb) {
            chunks.push(Buffer.from(chunk))
            cb()
        },
    })
    await pipeline(Readable.from(input), createCompressor(encoding), sink)
    return Buffer.concat(chunks)
}

describe('parseAcceptEncoding', () => {
    it('разбирает токены и q-веса', () => {
        const parsed = parseAcceptEncoding('gzip;q=0.5, br, deflate;q=0')
        expect(parsed.get('gzip')).toBe(0.5)
        expect(parsed.get('br')).toBe(1)
        expect(parsed.get('deflate')).toBe(0)
    })

    it('пустой заголовок — пустая карта', () => {
        expect(parseAcceptEncoding(undefined).size).toBe(0)
        expect(parseAcceptEncoding('').size).toBe(0)
    })

    it('некорректный q трактуется как 1 (заголовок не должен ломать запрос)', () => {
        expect(parseAcceptEncoding('gzip;q=abc').get('gzip')).toBe(1)
    })

    it('дубликат токена — побеждает максимальный вес', () => {
        expect(parseAcceptEncoding('gzip;q=0.2, gzip;q=0.9').get('gzip')).toBe(0.9)
    })
})

describe('negotiateEncoding', () => {
    it('выбирает brotli при равенстве весов (порядок сервера)', () => {
        expect(negotiateEncoding('gzip, br', ['br', 'gzip'])).toBe('br')
    })

    it('уважает q-веса', () => {
        expect(negotiateEncoding('br;q=0.1, gzip;q=0.9', ['br', 'gzip'])).toBe('gzip')
    })

    it('q=0 — явный отказ', () => {
        expect(negotiateEncoding('br;q=0, gzip', ['br', 'gzip'])).toBe('gzip')
        expect(negotiateEncoding('br;q=0, gzip;q=0', ['br', 'gzip'])).toBeNull()
    })

    it('без заголовка и с identity — без сжатия', () => {
        expect(negotiateEncoding(undefined, ['br', 'gzip'])).toBeNull()
        expect(negotiateEncoding('identity', ['br', 'gzip'])).toBeNull()
    })

    it('поддерживает *', () => {
        expect(negotiateEncoding('*', ['br', 'gzip'])).toBe('br')
        expect(negotiateEncoding('*;q=0.5, gzip;q=0.9', ['br', 'gzip'])).toBe('gzip')
    })

    it('возвращает null, если сервер не поддерживает запрошенное', () => {
        expect(negotiateEncoding('zstd', ['br', 'gzip'])).toBeNull()
    })
})

describe('appendVary / withCompressionHeaders', () => {
    it('добавляет токен без дублей (регистр не важен)', () => {
        expect(appendVary(undefined, 'Accept-Encoding')).toBe('Accept-Encoding')
        expect(appendVary('Accept-Language, Cookie', 'Accept-Encoding')).toBe(
            'Accept-Language, Cookie, Accept-Encoding',
        )
        expect(appendVary('Accept-Language, accept-encoding', 'Accept-Encoding')).toBe(
            'Accept-Language, accept-encoding',
        )
    })

    it('мержит существующий Vary и добавляет Content-Encoding', () => {
        expect(withCompressionHeaders({ Vary: 'Accept-Language, Cookie' }, 'br')).toEqual({
            'Content-Encoding': 'br',
            Vary: 'Accept-Language, Cookie, Accept-Encoding',
        })
    })

    it('находит Vary в нижнем регистре и не создаёт второй заголовок', () => {
        expect(withCompressionHeaders({ vary: 'Accept' }, 'gzip')).toEqual({
            'Content-Encoding': 'gzip',
            Vary: 'Accept, Accept-Encoding',
        })
    })
})

describe('isCompressibleContentType', () => {
    it('текстовые и структурные форматы сжимаются', () => {
        expect(isCompressibleContentType('text/html; charset=utf-8')).toBe(true)
        expect(isCompressibleContentType('application/json')).toBe(true)
        expect(isCompressibleContentType('application/javascript; charset=utf-8')).toBe(true)
        expect(isCompressibleContentType('image/svg+xml')).toBe(true)
    })

    it('уже сжатые форматы не сжимаются', () => {
        expect(isCompressibleContentType('image/png')).toBe(false)
        expect(isCompressibleContentType('font/woff2')).toBe(false)
        expect(isCompressibleContentType('application/octet-stream')).toBe(false)
    })
})

describe('createCompressor', () => {
    it('brotli: поток разжимается обратно', async () => {
        const input = 'hello '.repeat(200)
        const compressed = await compressWith('br', input)
        expect(compressed.length).toBeLessThan(Buffer.byteLength(input))
        expect(brotliDecompressSync(compressed).toString()).toBe(input)
    })

    it('gzip: поток разжимается обратно', async () => {
        const input = 'hello '.repeat(200)
        const compressed = await compressWith('gzip', input)
        expect(compressed.length).toBeLessThan(Buffer.byteLength(input))
        expect(gunzipSync(compressed).toString()).toBe(input)
    })
})
