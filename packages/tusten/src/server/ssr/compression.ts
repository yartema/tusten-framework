import { constants, createBrotliCompress, createGzip } from 'node:zlib'
import type { Transform } from 'node:stream'
import type { TustenCompressEncoding } from '../../types'

/**
 * Вспомогательные функции сжатия для ответов, которые пишутся в `reply.raw`
 * в обход `@fastify/compress` (SSR-стрим, SPA-shell, 404, страницы ошибок).
 */

/** Опции сжатия, которые нужны ответчику и SSR-стриму. */
export interface CompressionOptions {
    /** Минимальный размер тела; стрим сжимается всегда (длины заранее нет). */
    threshold: number
    /** Кодировки в порядке предпочтения сервера. */
    encodings: TustenCompressEncoding[]
}

/**
 * Content-type, которые имеет смысл сжимать.
 *
 * Изображения/шрифты/архивы уже сжаты — их повторное сжатие только тратит CPU.
 */
const COMPRESSIBLE_CONTENT_TYPE_RE =
    /^(?:text\/|application\/(?:json|javascript|xml|xhtml\+xml|rss\+xml|atom\+xml)|image\/svg\+xml)/i

/**
 * Проверяет, сжимаем ли ответ такого типа.
 *
 * @param contentType значение `Content-Type`.
 * @returns `true` для текстовых и структурных форматов.
 */
export function isCompressibleContentType(contentType: string): boolean {
    return COMPRESSIBLE_CONTENT_TYPE_RE.test(contentType.trim())
}

/**
 * Разбирает `Accept-Encoding` в карту `кодировка → q`.
 *
 * Поддерживает `q=0` (явный отказ) и `*`. Некорректные элементы игнорируются:
 * заголовок приходит от клиента и не должен ронять запрос.
 *
 * @param header значение заголовка.
 * @returns карта токенов (в нижнем регистре) и весов.
 */
export function parseAcceptEncoding(header: string | undefined): Map<string, number> {
    const result = new Map<string, number>()
    if (!header) return result

    for (const part of header.split(',')) {
        const [rawToken, ...params] = part.split(';')
        const token = rawToken?.trim().toLowerCase()
        if (!token) continue

        let q = 1
        for (const param of params) {
            const [rawName, rawValue] = param.split('=')
            if (rawName?.trim().toLowerCase() !== 'q') continue
            const parsed = Number(rawValue?.trim())
            if (Number.isFinite(parsed)) q = Math.min(1, Math.max(0, parsed))
        }
        // При дубликатах побеждает максимальный вес: так ведёт себя браузер.
        result.set(token, Math.max(result.get(token) ?? 0, q))
    }
    return result
}

/**
 * Выбирает кодировку ответа по `Accept-Encoding` и настройкам сервера.
 *
 * При равных `q` побеждает порядок `encodings`: сервер сам решает, что для него
 * выгоднее (brotli по умолчанию). `identity` и отсутствие заголовка — без сжатия.
 *
 * @param acceptEncoding значение `Accept-Encoding`.
 * @param encodings поддерживаемые кодировки в порядке предпочтения.
 * @returns выбранная кодировка или `null`.
 */
export function negotiateEncoding(
    acceptEncoding: string | undefined,
    encodings: readonly TustenCompressEncoding[],
): TustenCompressEncoding | null {
    const weights = parseAcceptEncoding(acceptEncoding)
    if (weights.size === 0) return null

    let best: { encoding: TustenCompressEncoding; q: number } | null = null
    for (const encoding of encodings) {
        const q = weights.get(encoding) ?? weights.get('*') ?? 0
        if (q <= 0) continue
        if (!best || q > best.q) best = { encoding, q }
    }
    return best?.encoding ?? null
}

/**
 * Добавляет токен в `Vary`, не дублируя его.
 *
 * @param existing текущее значение `Vary` (может быть `undefined`).
 * @param token токен, например `Accept-Encoding`.
 * @returns новое значение заголовка.
 */
export function appendVary(existing: string | undefined, token: string): string {
    const tokens = (existing ?? '')
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)

    const lower = token.toLowerCase()
    if (tokens.some((part) => part.toLowerCase() === lower)) return tokens.join(', ')
    tokens.push(token)
    return tokens.join(', ')
}

/**
 * Добавляет к заголовкам `Content-Encoding` и `Vary: Accept-Encoding`.
 *
 * `Vary` ищется регистронезависимо: серверный код и плагины могут писать его
 * в любом регистре, а дублировать заголовок нельзя.
 *
 * @param headers исходные заголовки.
 * @param encoding выбранная кодировка.
 * @returns новый объект заголовков.
 */
export function withCompressionHeaders(
    headers: Record<string, string> | undefined,
    encoding: TustenCompressEncoding,
): Record<string, string> {
    const out: Record<string, string> = {}
    let vary: string | undefined
    for (const [name, value] of Object.entries(headers ?? {})) {
        if (name.toLowerCase() === 'vary') {
            vary = value
            continue
        }
        out[name] = value
    }
    out['Content-Encoding'] = encoding
    out.Vary = appendVary(vary, 'Accept-Encoding')
    return out
}

/**
 * Создаёт zlib-поток для выбранной кодировки.
 *
 * Brotli quality 11 (дефолт Node) рассчитан на офлайн-сжатие и на динамическом
 * HTML съедает десятки миллисекунд CPU, поэтому для рантайма берём 4: разница
 * в размере — единицы процентов, выигрыш по TTFB — заметный. Gzip — уровень 6
 * (баланс, дефолт zlib).
 *
 * @param encoding кодировка.
 * @returns трансформ-поток.
 */
export function createCompressor(encoding: TustenCompressEncoding): Transform {
    if (encoding === 'br') {
        return createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 4 } })
    }
    return createGzip({ level: 6 })
}
