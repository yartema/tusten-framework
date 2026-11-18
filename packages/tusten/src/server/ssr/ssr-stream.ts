import { Transform } from 'node:stream'
import type { ReactElement } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import type { Responder } from './response'
import { createCompressor, negotiateEncoding, withCompressionHeaders, type CompressionOptions } from './compression'

/** Опции стриминга SSR-документа. */
export interface SsrStreamOptions {
    /** Корневой React-элемент (RootProvider + дерево страницы). */
    element: ReactElement
    /** Открывающая часть документа: `<head>` + открытый контейнер. */
    prefix: string
    /** Ответчик запроса (захват через `beginStream`). */
    responder: Responder
    /** Дополнительные заголовки ответа (`Vary` для i18n). */
    headers?: Record<string, string>
    /** Правка стека по sourcemap (dev). */
    fixStack: (error: unknown) => void
    /**
     * Хвост документа. Вызывается в `flush`, когда словари i18n уже полны.
     *
     * @param streamErrors ошибки, случившиеся после отправки shell.
     * @returns HTML-строка хвоста.
     */
    buildTail: (streamErrors: readonly unknown[]) => string
    /**
     * Сжатие стрима. `null` / не задано — без сжатия.
     *
     * Порог здесь не применяется: длина документа заранее неизвестна.
     */
    compression?: CompressionOptions | null
    /** `Accept-Encoding` запроса. */
    acceptEncoding?: string
}

/**
 * Стримит SSR-документ в ответ.
 *
 * Ошибки после отправки shell нельзя превратить в 500 — их увидит клиентский
 * оверлей. До shell ошибка уходит в `responder.fail` (500-страница).
 *
 * Сжатие включается до `beginStream`: заголовки `Content-Encoding` и `Vary`
 * должны уйти вместе с первым байтом документа. Хвост (`buildTail`) дописывается
 * до компрессора — иначе он оказался бы вне сжатого потока.
 *
 * @param options элемент, префикс и ответчик.
 */
export function pipeSsrDocument(options: SsrStreamOptions): void {
    const { element, prefix, responder, headers, fixStack, buildTail, compression, acceptEncoding } = options

    let didError = false
    let shellSent = false
    /** Ошибки стрима — для клиентского оверлея (dev) собираем до flush. */
    const streamErrors: unknown[] = []

    // Кодировка фиксируется один раз: заголовок и поток должны совпадать.
    const encoding = compression ? negotiateEncoding(acceptEncoding, compression.encodings) : null

    const stream = renderToPipeableStream(element, {
        onShellReady() {
            if (shellSent) return
            shellSent = true

            // Клиент уже отключился или ответ уже занят — продолжать рендер незачем.
            const raw = responder.beginStream(
                didError ? 500 : 200,
                encoding ? withCompressionHeaders(headers, encoding) : headers,
            )
            if (!raw) {
                stream.abort()
                return
            }

            const inject = new Transform({
                transform(chunk, _enc, cb) {
                    cb(null, chunk)
                },
                flush(cb) {
                    this.push(buildTail(streamErrors))
                    cb()
                },
            })

            // Ошибка записи после shell (обрыв клиента, zlib) не должна всплывать
            // как unhandled: рвём поток и снимаем React-рендер.
            const abortOnError = (): void => {
                stream.abort()
                inject.destroy()
                if (!raw.writableEnded) raw.destroy()
            }
            inject.on('error', abortOnError)

            // Префикс идёт через тот же Transform, что и документ: при сжатии
            // запись напрямую в `raw` дала бы несжатый `<head>` перед gzip-потоком.
            inject.write(prefix)

            if (!encoding) {
                inject.pipe(raw)
                stream.pipe(inject)
                return
            }

            const compressor = createCompressor(encoding)
            compressor.on('error', abortOnError)
            inject.pipe(compressor).pipe(raw)
            stream.pipe(inject)
        },
        onShellError(err) {
            didError = true
            responder.fail('Shell error', err)
        },
        onError(err) {
            didError = true
            fixStack(err)
            streamErrors.push(err)
            console.error('[tusten] SSR error:', err)
        },
    })
}
