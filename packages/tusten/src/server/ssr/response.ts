import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ServerResponse } from 'node:http'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { TustenCompressEncoding } from '../../types'
import { buildDevErrorPage, buildProdErrorPage, createErrorId } from '../error-page'
import {
    createCompressor,
    isCompressibleContentType,
    negotiateEncoding,
    withCompressionHeaders,
    type CompressionOptions,
} from './compression'

/** Опции создания ответчика. */
export interface ResponderOptions {
    /** Dev-режим: стек в логах и страница ошибки с исходниками. */
    isDev: boolean
    /** Корень проекта для dev-страницы ошибки. */
    projectDir: string
    /** Правка стека по sourcemap (dev); уже безопасная обёртка. */
    fixStack?: (error: unknown) => void
    /**
     * Настройки сжатия готовых тел (SPA-shell, 404, страницы ошибок).
     *
     * `null` — сжатие выключено в конфиге. SSR-стрим сжимается отдельно:
     * у него нет готовой длины, поэтому порог к нему не применим.
     */
    compression?: CompressionOptions | null
    /** `Accept-Encoding` запроса. */
    acceptEncoding?: string
}

/**
 * Ответчик запроса.
 *
 * После `reply.hijack()` Fastify не вмешивается: ответ нужно закрыть ровно один
 * раз. Все методы идемпотентны — повторный вызов ничего не делает.
 */
export interface Responder {
    /** Ответ уже занят (отправлен или отдан под стрим). */
    readonly committed: boolean
    /**
     * Отдаёт готовый ответ.
     *
     * @param status HTTP-статус.
     * @param contentType значение `Content-Type`.
     * @param body тело ответа.
     * @param headers дополнительные заголовки.
     */
    send(status: number, contentType: string, body: string, headers?: Record<string, string>): void
    /**
     * Отдаёт пустой 302.
     *
     * @param location адрес редиректа.
     */
    redirect(location: string): void
    /**
     * Аварийный ответ (500).
     *
     * @param label метка для лога.
     * @param err ошибка.
     */
    fail(label: string, err: unknown): void
    /**
     * Захватывает ответ под стриминг и пишет заголовки.
     *
     * @param status HTTP-статус.
     * @param headers дополнительные заголовки.
     * @returns `reply.raw` или `null`, если ответ уже занят либо клиент отключился.
     */
    beginStream(status: number, headers?: Record<string, string>): ServerResponse | null
}

/**
 * Оборачивает `fixStacktrace` так, чтобы сбой правки стека не ронял обработчик.
 *
 * @param fixStacktrace хук Vite (`ssrFixStacktrace`) или `undefined`.
 * @returns функция, безопасная для вызова в `catch`.
 */
export function createStackFixer(fixStacktrace?: (error: unknown) => void): (error: unknown) => void {
    return (error) => {
        if (!fixStacktrace) return
        try {
            fixStacktrace(error)
        } catch {
            // Sourcemap может быть недоступен (например, ошибка в самом Vite-плагине) —
            // показываем исходный стек, это не повод ронять обработчик.
        }
    }
}

/**
 * Создаёт ответчик для одного запроса.
 *
 * @param req запрос (для dev-страницы ошибки нужны метод и URL).
 * @param reply Fastify-ответ (пишем в `reply.raw`).
 * @param options режим и хук правки стека.
 * @returns ответчик с явным состоянием `open → committed`.
 */
export function createResponder(
    req: Pick<FastifyRequest, 'method' | 'url'>,
    reply: FastifyReply,
    options: ResponderOptions,
): Responder {
    const raw = reply.raw
    let committed = false

    /**
     * Помечает ответ занятым.
     *
     * @returns `true`, если ответ ещё не был занят.
     */
    const claim = (): boolean => {
        if (committed) return false
        committed = true
        return true
    }

    /**
     * Пишет общие заголовки HTML/JSON.
     *
     * @param contentType значение `Content-Type`.
     * @param headers дополнительные заголовки.
     */
    const writeHeaders = (contentType: string, headers?: Record<string, string>): void => {
        raw.setHeader('Content-Type', contentType)
        // HTML/JSON содержат per-request состояние — кэшировать нельзя.
        raw.setHeader('Cache-Control', 'no-store')
        if (!headers) return
        for (const [name, value] of Object.entries(headers)) raw.setHeader(name, value)
    }

    /**
     * Выбирает кодировку для готового тела.
     *
     * Порог нужен и для HTML: сжатие 300-байтной страницы ошибки тратит CPU
     * и увеличивает ответ. Стрим сжимается всегда — там длины заранее нет.
     *
     * @param contentType тип тела.
     * @param body тело.
     * @returns кодировка или `null`.
     */
    const pickBodyEncoding = (contentType: string, body: string): TustenCompressEncoding | null => {
        const compression = options.compression
        if (!compression) return null
        if (!isCompressibleContentType(contentType)) return null
        if (Buffer.byteLength(body) < compression.threshold) return null
        return negotiateEncoding(options.acceptEncoding, compression.encodings)
    }

    /**
     * Отдаёт тело ответа, если заголовки ещё не ушли.
     *
     * @param status HTTP-статус.
     * @param contentType значение `Content-Type`.
     * @param body тело.
     * @param headers дополнительные заголовки.
     */
    const send = (status: number, contentType: string, body: string, headers?: Record<string, string>): void => {
        if (!claim()) return

        if (raw.headersSent) {
            raw.destroy()
            return
        }

        const encoding = pickBodyEncoding(contentType, body)
        raw.statusCode = status
        writeHeaders(contentType, encoding ? withCompressionHeaders(headers, encoding) : headers)

        if (!encoding) {
            raw.end(body)
            return
        }

        // Пайплайн асинхронный: `send` остаётся синхронным для вызывающих.
        // Ошибка zlib уже после коммита заголовков не превращается в 500 —
        // сокет просто закрывается, клиент увидит оборванный ответ.
        void pipeline(Readable.from(body), createCompressor(encoding), raw).catch(() => {
            if (!raw.writableEnded) raw.destroy()
        })
    }

    return {
        get committed() {
            return committed
        },

        send,

        redirect(location) {
            if (!claim()) return

            if (raw.headersSent) {
                raw.destroy()
                return
            }

            raw.statusCode = 302
            raw.setHeader('Location', location)
            raw.setHeader('Cache-Control', 'no-store')
            raw.end()
        },

        fail(label, err) {
            // Стек правим до логирования и до страницы: иначе в консоли и в HTML
            // будут разные (трансформированные) строки.
            options.fixStack?.(err)

            // Prod: короткий id связывает ответ пользователя с записью в логе.
            const errorId = options.isDev ? '' : createErrorId(err)
            if (options.isDev) console.error(`[tusten] ${label}:`, err)
            else console.error(`[tusten] ${label} [${errorId}]:`, err)

            if (committed || raw.headersSent) {
                committed = true
                if (!raw.writableEnded) raw.destroy()
                return
            }

            // Текст ошибки и стек отдаются только в dev: в prod они раскрывают пути и код.
            const body = options.isDev
                ? buildDevErrorPage({
                      errors: [err],
                      request: { method: req.method, url: req.url },
                      projectDir: options.projectDir,
                  })
                : buildProdErrorPage(errorId)
            send(500, 'text/html; charset=utf-8', body)
        },

        beginStream(status, headers) {
            // Клиент уже отключился — продолжать рендер незачем.
            if (committed || raw.destroyed) {
                committed = true
                return null
            }

            committed = true
            raw.statusCode = status
            writeHeaders('text/html; charset=utf-8', headers)
            return raw
        },
    }
}
