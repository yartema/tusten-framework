import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'

/**
 * HTML-страницы ошибок.
 *
 * Dev-страница показывает описание, стек и code frame — она нужна, когда React-дерево
 * уже упало и отрендерить страницу средствами фреймворка нельзя. Prod-страница
 * намеренно не раскрывает ни стек, ни пути: только короткий id для поиска в логах.
 */

/** Ошибка, приведённая к виду, пригодному для HTML и `JSON.stringify`. */
export interface SerializedError {
    /** `Error.name` (`TypeError`, `TustenError`, …). */
    name: string
    /** Текст ошибки. */
    message: string
    /** Стек, если он есть. */
    stack?: string
}

/** Кадр стека. */
export interface StackFrame {
    /** Имя функции, если V8 его сохранил. */
    fn?: string
    /** Абсолютный путь или URL модуля. */
    file?: string
    /** Номер строки (1-based). */
    line?: number
    /** Номер колонки (1-based). */
    column?: number
    /** Исходная строка стека — для кадров без позиции. */
    raw: string
}

/** Опции dev-страницы ошибки. */
export interface DevErrorPageOptions {
    /** Ошибки запроса: обычно одна, но стрим может собрать несколько. */
    errors: unknown[]
    /** Метод и URL запроса для шапки страницы. */
    request?: { method?: string; url?: string }
    /** Корень проекта: по нему кадры делятся на «свои» и `node_modules`. */
    projectDir?: string
}

/**
 * Приводит любое брошенное значение к сериализуемой ошибке.
 *
 * `throw 'строка'` и `throw { code }` в JS легальны, поэтому страница не должна
 * рассчитывать только на `instanceof Error`.
 *
 * @param error брошенное значение.
 * @returns имя, сообщение и стек (если есть).
 */
export function serializeError(error: unknown): SerializedError {
    if (error instanceof Error) {
        return {
            name: error.name || 'Error',
            message: error.message || String(error),
            stack: error.stack,
        }
    }

    if (typeof error === 'string') return { name: 'Error', message: error }
    if (error === undefined) return { name: 'Error', message: 'undefined' }
    if (error === null) return { name: 'Error', message: 'null' }

    let message: string
    try {
        message = JSON.stringify(error) ?? String(error)
    } catch {
        message = String(error)
    }
    return { name: 'Error', message }
}

/**
 * Короткий идентификатор ошибки для prod-логов и страницы.
 *
 * Стабилен для одинаковых ошибок: по нему можно найти все запросы с тем же сбоем.
 *
 * @param error ошибка.
 * @returns 8 hex-символов sha1.
 */
export function createErrorId(error: unknown): string {
    const { name, message, stack } = serializeError(error)
    return createHash('sha1')
        .update(`${name}\n${message}\n${stack ?? ''}`)
        .digest('hex')
        .slice(0, 8)
}

/**
 * Разбирает V8-стек на кадры.
 *
 * Поддерживает форматы `at fn (file:1:2)`, `at file:1:2`, `at async fn (…)`
 * и кадры без позиции. Пути Windows (`F:/app/x.tsx`) идут после префикса `file://`,
 * поэтому позиция ищется с конца строки, а не регуляркой на весь кадр.
 *
 * @param stack значение `error.stack`.
 * @returns кадры в порядке стека; строка сообщения отбрасывается.
 */
export function parseStackFrames(stack: string | undefined): StackFrame[] {
    if (!stack) return []

    const frames: StackFrame[] = []
    for (const line of stack.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('at ')) continue

        let rest = trimmed.slice(3)
        let fn: string | undefined

        // `at fn (loc)` — имя функции отделено от локации скобками. `lastIndexOf`
        // нужен, потому что имя само может содержать скобки (`async Promise.all`).
        const paren = rest.lastIndexOf(' (')
        if (rest.endsWith(')') && paren !== -1) {
            fn = rest.slice(0, paren)
            rest = rest.slice(paren + 2, -1)
        }

        const located = /^(.*):(\d+):(\d+)$/.exec(rest)
        if (!located) {
            frames.push({ fn, raw: trimmed })
            continue
        }

        frames.push({
            fn,
            file: normalizeStackPath(located[1] ?? ''),
            line: Number(located[2]),
            column: Number(located[3]),
            raw: trimmed,
        })
    }
    return frames
}

/**
 * Приводит путь из стека к виду, понятному `fs` и редактору.
 *
 * @param file путь или URL из кадра.
 * @returns путь без `file://`, раскодированный и без ведущего `/` перед `F:/`.
 */
function normalizeStackPath(file: string): string {
    let result = file
    if (result.startsWith('file://')) result = result.slice('file://'.length)

    try {
        result = decodeURIComponent(result)
    } catch {
        // Битый percent-encoding — оставляем как есть, это лишь ссылка на файл.
    }

    // Vite на Windows иногда отдаёт `/F:/project/...` — fs такой путь не поймёт.
    if (/^\/[A-Za-z]:[\\/]/.test(result)) result = result.slice(1)
    return result
}

/**
 * Проверяет, что кадр относится к коду проекта, а не к зависимостям.
 *
 * @param frame кадр.
 * @param projectDir корень проекта.
 * @returns `true` для файлов внутри проекта.
 */
function isProjectFrame(frame: StackFrame, projectDir?: string): boolean {
    if (!frame.file) return false
    if (!projectDir) return !frame.file.includes('node_modules') && !frame.file.startsWith('node:')
    const normalizedFile = frame.file.replace(/\\/g, '/')
    const normalizedDir = projectDir.replace(/\\/g, '/').replace(/\/$/, '')
    return normalizedFile.startsWith(normalizedDir + '/') && !normalizedFile.includes('/node_modules/')
}

/**
 * Читает исходник вокруг строки ошибки для code frame.
 *
 * @param frame кадр с абсолютным путём и строкой.
 * @returns готовый HTML или `undefined`, если файла нет или он слишком большой.
 */
function readCodeFrame(frame: StackFrame): string | undefined {
    if (!frame.file || !frame.line) return undefined
    if (!path.isAbsolute(frame.file)) return undefined

    try {
        // Огромные бандлы не показываем: чтение и подсветка такого файла только
        // замедлят ответ, а пользы от 10 000 строк вокруг ошибки нет.
        if (fs.statSync(frame.file).size > 2 * 1024 * 1024) return undefined
        const source = fs.readFileSync(frame.file, 'utf8')
        const lines = source.split(/\r?\n/)
        const target = frame.line - 1
        if (target < 0 || target >= lines.length) return undefined

        const start = Math.max(0, target - 3)
        const end = Math.min(lines.length - 1, target + 3)
        const width = String(end + 1).length

        const rows: string[] = []
        for (let i = start; i <= end; i++) {
            const number = String(i + 1).padStart(width, ' ')
            const line = escapeHtml(lines[i] ?? '')
            if (i === target) {
                rows.push(`<span class="ln hl">${number}</span><span class="hl-line">${line}</span>`)
            } else {
                rows.push(`<span class="ln">${number}</span><span>${line}</span>`)
            }
        }
        return rows.join('\n')
    } catch {
        return undefined
    }
}

/**
 * Строит ссылку «открыть в редакторе» через Vite dev-endpoint.
 *
 * @param frame кадр.
 * @returns URL для `<a href>`.
 */
function editorHref(frame: StackFrame): string {
    const position = frame.line ? `:${frame.line}${frame.column ? `:${frame.column}` : ''}` : ''
    return `/__open-in-editor?file=${encodeURIComponent((frame.file ?? '') + position)}`
}

/**
 * Рендерит список кадров стека.
 *
 * @param frames кадры.
 * @param projectDir корень проекта.
 * @returns HTML.
 */
function renderFrames(frames: StackFrame[], projectDir?: string): string {
    if (frames.length === 0) return '<p class="muted">Стек недоступен.</p>'

    const items = frames.map((frame) => {
        const project = isProjectFrame(frame, projectDir)
        const location =
            frame.file && frame.line
                ? `<a class="loc" href="${escapeHtml(editorHref(frame))}" target="_blank" rel="noreferrer">${escapeHtml(
                      frame.file,
                  )}:${frame.line}:${frame.column ?? 0}</a>`
                : `<span class="loc">${escapeHtml(frame.raw)}</span>`
        const fn = frame.fn ? `<span class="fn">${escapeHtml(frame.fn)}</span> ` : ''
        return `<li class="frame${project ? ' project' : ''}">${fn}${location}</li>`
    })

    return `<ol class="frames">${items.join('')}</ol>`
}

/**
 * Рендерит одну карточку ошибки.
 *
 * @param error сериализованная ошибка.
 * @param index порядковый номер (для якоря).
 * @param projectDir корень проекта.
 * @returns HTML.
 */
function renderErrorCard(error: SerializedError, index: number, projectDir?: string): string {
    const frames = parseStackFrames(error.stack)
    const sourceFrame = frames.find((frame) => isProjectFrame(frame, projectDir)) ?? frames.find((f) => f.file)
    const codeFrame = sourceFrame ? readCodeFrame(sourceFrame) : undefined

    return `<section class="card" id="error-${index}">
  <h2><span class="name">${escapeHtml(error.name)}</span>: ${escapeHtml(error.message)}</h2>
  ${renderFrames(frames, projectDir)}
  ${codeFrame ? `<pre class="code">${codeFrame}</pre>` : ''}
</section>`
}

/**
 * Строит `<script>` с ошибками, которые произошли после отправки shell.
 *
 * Статус и `<head>` уже ушли, поэтому заменить страницу нельзя: ошибки передаются
 * в HTML и показываются клиентским оверлеем поверх частичного рендера.
 *
 * @param errors ошибки стрима.
 * @returns HTML-скрипт или пустая строка, если ошибок нет.
 */
export function buildDevErrorsScript(errors: unknown[]): string {
    if (errors.length === 0) return ''
    const json = JSON.stringify(errors.map(serializeError))
        // `</script>` внутри message закрыл бы тег раньше времени.
        .replace(/</g, '\\u003c')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029')
    return `<script>window.__TUSTEN_SSR_ERRORS__=${json}</script>`
}

/**
 * Строит отдельную dev-страницу ошибки SSR/SPA-запроса.
 *
 * @param options ошибки, запрос и корень проекта.
 * @returns полный HTML-документ.
 */
export function buildDevErrorPage(options: DevErrorPageOptions): string {
    const errors = (options.errors.length > 0 ? options.errors : ['Unknown error']).map(serializeError)
    const cards = errors.map((error, index) => renderErrorCard(error, index, options.projectDir)).join('\n')
    const request = options.request ? `${options.request.method ?? 'GET'} ${options.request.url ?? '/'}` : ''
    const dump = errors
        .map((error) => `${error.name}: ${error.message}\n${error.stack ?? '(no stack)'}`)
        .join('\n\n---\n\n')

    return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>tusten — ошибка</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 28px 20px 56px;
    background: #0b0d12; color: #e6e8ee;
    font: 13px/1.6 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  }
  .wrap { max-width: 1080px; margin: 0 auto; }
  .head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
  .badge {
    display: inline-flex; align-items: center; gap: 8px;
    padding: 4px 10px; border-radius: 999px;
    background: #1b1f2a; color: #ff7a7a; border: 1px solid #35202a;
    font: 600 12px/1.4 system-ui, -apple-system, Segoe UI, sans-serif;
  }
  .badge::before { content: ""; width: 7px; height: 7px; border-radius: 50%; background: #ff5c5c; }
  .req { color: #8b93a7; font-size: 12px; }
  h1 { margin: 0; font: 600 15px/1.4 system-ui, -apple-system, Segoe UI, sans-serif; color: #f3f4f8; }
  .card {
    margin: 0 0 18px; padding: 18px 20px;
    background: #11141b; border: 1px solid #232936; border-left: 3px solid #ff5c5c;
    border-radius: 10px; box-shadow: 0 10px 30px rgb(0 0 0 / 35%);
  }
  h2 {
    margin: 0 0 14px; font: 600 14px/1.5 system-ui, -apple-system, Segoe UI, sans-serif;
    color: #ffd7d7; word-break: break-word;
  }
  h2 .name { color: #ff7a7a; }
  .frames { list-style: none; margin: 0 0 14px; padding: 0; }
  .frame { padding: 2px 0 2px 14px; color: #8b93a7; position: relative; word-break: break-all; }
  .frame::before { content: "›"; position: absolute; left: 0; color: #4b5366; }
  .frame.project { color: #cfd6e6; }
  .frame.project::before { color: #ff7a7a; }
  .fn { color: #9aa4bb; }
  .loc { color: #6ea8fe; text-decoration: none; }
  .loc:hover { text-decoration: underline; }
  .code {
    margin: 0; padding: 12px 14px; overflow: auto;
    background: #0b0e14; border: 1px solid #232936; border-radius: 8px;
    font-size: 12px; line-height: 1.7; color: #b8c0d4;
  }
  .code .ln { display: inline-block; width: 3.5em; padding-right: 12px; color: #4b5366; user-select: none; }
  .code .ln.hl { color: #ff7a7a; }
  .code .hl-line { color: #fff; background: rgb(255 92 92 / 12%); }
  .muted { color: #6b7488; margin: 0 0 12px; }
  .actions { display: flex; gap: 8px; margin-top: 22px; }
  button {
    padding: 7px 14px; border-radius: 7px; cursor: pointer;
    background: #1b2130; color: #dfe4ef; border: 1px solid #2b3345;
    font: 500 12px/1.4 system-ui, -apple-system, Segoe UI, sans-serif;
  }
  button:hover { background: #232b3d; }
  .foot { margin-top: 24px; color: #596174; font-size: 12px; }
  .foot code { color: #8b93a7; }
</style>
</head>
<body>
<div class="wrap">
  <header class="head">
    <span class="badge">tusten dev</span>
    <h1>Ошибка при рендере страницы</h1>
    ${request ? `<span class="req">${escapeHtml(request)}</span>` : ''}
  </header>
  ${cards}
  <div class="actions">
    <button id="copy">Скопировать ошибку</button>
    <button onclick="location.reload()">Обновить</button>
  </div>
  <p class="foot">Страница отдана в dev-режиме: стек и пути видны только здесь, в production их нет.</p>
</div>
<pre id="dump" hidden>${escapeHtml(dump)}</pre>
<script>
document.getElementById('copy').addEventListener('click', async () => {
  const dump = document.getElementById('dump')
  try { await navigator.clipboard.writeText(dump ? dump.textContent : '') } catch (err) { console.error(err) }
})
</script>
</body>
</html>`
}

/**
 * Строит prod-страницу 500: без стека и путей, с id для корреляции с логами.
 *
 * @param errorId короткий идентификатор ошибки.
 * @returns полный HTML-документ.
 */
export function buildProdErrorPage(errorId: string): string {
    return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Ошибка сервера</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px;
    background: #f6f7f9; color: #1d2330;
    font: 15px/1.6 system-ui, -apple-system, Segoe UI, sans-serif;
  }
  main {
    width: 100%; max-width: 520px; padding: 32px;
    background: #fff; border: 1px solid #e3e6ec; border-radius: 14px;
    box-shadow: 0 12px 40px rgb(20 30 50 / 8%);
  }
  h1 { margin: 0 0 10px; font-size: 20px; }
  p { margin: 0 0 16px; color: #5b6476; }
  button {
    padding: 9px 16px; border-radius: 8px; border: 0; cursor: pointer;
    background: #1d2330; color: #fff;
    font-weight: 500; font-size: 14px; line-height: 1.4; font-family: inherit;
  }
  button:hover { background: #2b3345; }
  .id { margin: 20px 0 0; font-size: 13px; color: #7b8496; }
  code { padding: 2px 6px; border-radius: 5px; background: #f0f2f6; color: #1d2330; }
  @media (prefers-color-scheme: dark) {
    body { background: #0f1218; color: #e6e8ee; }
    main { background: #151922; border-color: #252c3a; box-shadow: none; }
    p { color: #9aa4bb; }
    button { background: #2b3345; }
    button:hover { background: #354055; }
    code { background: #1f2532; color: #dfe4ef; }
    .id { color: #7b8496; }
  }
</style>
</head>
<body>
<main>
  <h1>Что-то пошло не так</h1>
  <p>Страницу не удалось отобразить. Попробуйте обновить — если ошибка повторяется, сообщите её код.</p>
  <button onclick="location.reload()">Обновить страницу</button>
  <p class="id">Код ошибки: <code>${escapeHtml(errorId)}</code></p>
</main>
</body>
</html>`
}

/**
 * Экранирует HTML-спецсимволы.
 *
 * @param value строка.
 * @returns экранированная строка.
 */
export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}
