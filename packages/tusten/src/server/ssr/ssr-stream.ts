import { Transform } from 'node:stream'
import type { ReactElement } from 'react'
import { renderToPipeableStream } from 'react-dom/server'
import type { Responder } from './response'

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
}

/**
 * Стримит SSR-документ в ответ.
 *
 * Ошибки после отправки shell нельзя превратить в 500 — их увидит клиентский
 * оверлей. До shell ошибка уходит в `responder.fail` (500-страница).
 *
 * @param options элемент, префикс и ответчик.
 */
export function pipeSsrDocument(options: SsrStreamOptions): void {
    const { element, prefix, responder, headers, fixStack, buildTail } = options

    let didError = false
    let shellSent = false
    /** Ошибки стрима — для клиентского оверлея (dev) собираем до flush. */
    const streamErrors: unknown[] = []

    const stream = renderToPipeableStream(element, {
        onShellReady() {
            if (shellSent) return
            shellSent = true

            // Клиент уже отключился или ответ уже занят — продолжать рендер незачем.
            const raw = responder.beginStream(didError ? 500 : 200, headers)
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
            raw.write(prefix)
            stream.pipe(inject).pipe(raw)
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
