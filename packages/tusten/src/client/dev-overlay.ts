import { DEV_ERROR_HOOK, type DevErrorReporter, type DevErrorSource } from './dev-report'

/**
 * Dev-оверлей ошибок tusten.
 *
 * Отдельная точка входа: генерируемый клиентский entry импортирует её только внутри
 * `if (import.meta.env.DEV)`, поэтому в production-бандл модуль не попадает.
 *
 * Показывает ошибки SSR (до и после flush), гидрации, SPA-навигации и React-дерева
 * в одном месте: описание, стек, кнопка копирования и переход в редактор по кадру.
 */

/** Ошибка в том виде, в котором её можно показать. */
interface ShownError {
    name: string
    message: string
    stack?: string
    /** Подсказка под сообщением (например, про недоступный dev-сервер). */
    hint?: string
}

/** Кадр стека. */
interface Frame {
    fn?: string
    file?: string
    line?: number
    column?: number
    raw: string
}

/** Сколько карточек держим одновременно: остальные вытесняются сверху. */
const MAX_CARDS = 6

/** Идентификатор host-элемента: по нему легко найти оверлей в DevTools. */
const HOST_ID = '__tusten_dev_overlay__'

/** Подписи источников ошибки. */
const SOURCE_LABEL: Record<DevErrorSource, string> = {
    ssr: 'SSR',
    client: 'клиент',
    navigation: 'навигация',
    hydration: 'гидрация',
    boundary: 'React',
    prefetch: 'данные',
}

/** Уже показанные ошибки: React 19 и `window.onerror` сообщают об одном и том же дважды. */
const seen = new Set<string>()

let installed = false
let shadow: ShadowRoot | null = null
let host: HTMLElement | null = null
let container: HTMLElement | null = null

/**
 * Включает оверлей: глобальные обработчики, хук для ErrorBoundary и ошибки SSR из HTML.
 *
 * Вызывается один раз из сгенерированного клиентского entry в dev.
 */
export function installDevOverlay(): void {
    if (installed || typeof window === 'undefined' || typeof document === 'undefined') return
    installed = true

    ;(globalThis as unknown as Record<string, unknown>)[DEV_ERROR_HOOK] = showErrorOverlay as DevErrorReporter

    window.addEventListener('error', (event) => {
        // Ресурсные ошибки (`<img>` без onError) не имеют `error` — их не показываем:
        // это не падение приложения, а обычный 404 на картинку.
        if (event.error) showErrorOverlay(event.error, 'client')
    })
    window.addEventListener('unhandledrejection', (event) => {
        showErrorOverlay(event.reason, 'client')
    })
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') clearOverlay()
    })

    // SSR успел отправить shell, но рендер упал: сервер передал ошибки этим скриптом.
    const ssrErrors = (window as unknown as Record<string, unknown>).__TUSTEN_SSR_ERRORS__
    if (Array.isArray(ssrErrors)) {
        for (const error of ssrErrors) showErrorOverlay(error, 'ssr')
    }
}

/**
 * Показывает ошибку в оверлее. Повторные вызовы с той же ошибкой игнорируются.
 *
 * @param error брошенное значение.
 * @param source источник ошибки.
 */
export function showErrorOverlay(error: unknown, source: DevErrorSource = 'client'): void {
    if (typeof document === 'undefined') return

    const shown = toShownError(error)
    const key = `${source}\u0000${shown.name}\u0000${shown.message}\u0000${shown.stack ?? ''}`
    if (seen.has(key)) return
    // Ограничение на размер: длинная сессия не должна копить тысячи ключей.
    if (seen.size > 200) seen.clear()
    seen.add(key)

    const root = ensureOverlay()
    const card = document.createElement('article')
    card.className = 'card'
    card.innerHTML = renderCard(shown, source)
    root.appendChild(card)

    while (root.childElementCount > MAX_CARDS) root.firstElementChild?.remove()
    if (typeof card.scrollIntoView === 'function') card.scrollIntoView({ block: 'nearest' })
}

/**
 * Приводит любое брошенное значение к показываемой ошибке.
 *
 * @param error брошенное значение.
 * @returns имя, сообщение и стек.
 */
function toShownError(error: unknown): ShownError {
    if (error instanceof Error) {
        return withHint({
            name: error.name || 'Error',
            message: error.message || String(error),
            stack: error.stack,
        })
    }
    if (typeof error === 'string') return withHint({ name: 'Error', message: error })
    if (error === undefined) return { name: 'Error', message: 'undefined' }
    if (error === null) return { name: 'Error', message: 'null' }

    try {
        return { name: 'Error', message: JSON.stringify(error) ?? String(error) }
    } catch {
        return { name: 'Error', message: String(error) }
    }
}

/**
 * Добавляет подсказку для типовых сетевых сбоев динамического импорта.
 *
 * `Failed to fetch dynamically imported module` почти всегда означает, что
 * dev-сервер остановлен или перезапустился, а вкладка осталась старой.
 *
 * @param error ошибка.
 * @returns ошибка с подсказкой (если применимо).
 */
function withHint(error: ShownError): ShownError {
    if (/Failed to fetch dynamically imported module/i.test(error.message)) {
        error.hint = 'Модуль не загрузился. Проверьте, что dev-сервер запущен, и обновите страницу.'
    }
    return error
}

/**
 * Разбирает V8-стек на кадры. Позиция ищется с конца строки: в путях Windows
 * и URL тоже есть двоеточия.
 *
 * @param stack значение `error.stack`.
 * @returns кадры в порядке стека.
 */
function parseFrames(stack: string | undefined): Frame[] {
    if (!stack) return []

    const frames: Frame[] = []
    for (const line of stack.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('at ')) continue

        let rest = trimmed.slice(3)
        let fn: string | undefined
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
            file: located[1] ?? '',
            line: Number(located[2]),
            column: Number(located[3]),
            raw: trimmed,
        })
    }
    return frames
}

/**
 * Приводит URL модуля к пути, который понимает `/__open-in-editor`.
 *
 * Vite отдаёт клиентские модули как `/client/HomePage/View.tsx`; endpoint
 * резолвит такой путь от корня проекта.
 *
 * @param file путь или URL из кадра.
 * @returns путь для редактора или `undefined`.
 */
function editorTarget(file: string | undefined): string | undefined {
    if (!file) return undefined
    if (!/^https?:\/\//.test(file)) return file

    try {
        const url = new URL(file)
        const decoded = decodeURIComponent(url.pathname)
        if (decoded.startsWith('/@fs/')) return decoded.slice('/@fs/'.length)
        return decoded.replace(/^\/+/, '')
    } catch {
        return undefined
    }
}

/**
 * Убирает origin из пути, чтобы кадр влезал в строку.
 *
 * @param file путь или URL.
 * @returns путь для показа.
 */
function displayFile(file: string | undefined): string {
    if (!file) return ''
    if (file.startsWith(window.location.origin)) return file.slice(window.location.origin.length)
    return file
}

/**
 * Проверяет, что кадр относится к коду приложения, а не к зависимостям.
 *
 * @param frame кадр.
 * @returns `true` для «своих» кадров.
 */
function isProjectFrame(frame: Frame): boolean {
    if (!frame.file) return false
    return !frame.file.includes('node_modules') && !frame.file.startsWith('node:')
}

/**
 * Рендерит список кадров: первые восемь видны сразу, остальные — под раскрывашкой.
 *
 * @param frames кадры.
 * @returns HTML.
 */
function renderFrames(frames: Frame[]): string {
    if (frames.length === 0) return '<p class="muted">Стек недоступен.</p>'

    const renderFrame = (frame: Frame): string => {
        const project = isProjectFrame(frame)
        const target = editorTarget(frame.file)
        const locationText =
            frame.file && frame.line ? `${displayFile(frame.file)}:${frame.line}:${frame.column ?? 0}` : frame.raw
        const location =
            target && frame.line
                ? `<a class="loc" href="/__open-in-editor?file=${encodeURIComponent(
                      target + `:${frame.line}` + (frame.column ? `:${frame.column}` : ''),
                  )}" target="_blank" rel="noreferrer">${escapeHtml(locationText)}</a>`
                : `<span class="loc">${escapeHtml(locationText)}</span>`

        return `<li class="frame${project ? ' project' : ''}">${
            frame.fn ? `<span class="fn">${escapeHtml(frame.fn)}</span> ` : ''
        }${location}</li>`
    }
    const visible = frames.slice(0, 8).map(renderFrame).join('')
    const hidden = frames.slice(8).map(renderFrame).join('')
    const more =
        frames.length > 8
            ? `<details><summary>ещё ${frames.length - 8} кадров</summary><ol class="frames">${hidden}</ol></details>`
            : ''

    return `<ol class="frames">${visible}</ol>${more}`
}

/**
 * Рендерит карточку ошибки.
 *
 * @param error ошибка.
 * @param source источник.
 * @returns HTML карточки.
 */
function renderCard(error: ShownError, source: DevErrorSource): string {
    const frames = parseFrames(error.stack)
    const dump = `${error.name}: ${error.message}\n${error.stack ?? '(no stack)'}`

    return `<header class="head">
  <span class="badge">${escapeHtml(SOURCE_LABEL[source])}</span>
  <span class="grow"></span>
  <button type="button" class="icon" data-close title="Закрыть (Esc)" aria-label="Закрыть">×</button>
</header>
<h2><span class="name">${escapeHtml(error.name)}</span>: ${escapeHtml(error.message)}</h2>
${error.hint ? `<p class="hintline">${escapeHtml(error.hint)}</p>` : ''}
${renderFrames(frames)}
<footer class="foot">
  <button type="button" class="copy" data-copy>Скопировать</button>
  <span class="hint">dev · в production панели нет</span>
</footer>
<pre class="dump" hidden>${escapeHtml(dump)}</pre>`
}

/**
 * Создаёт host + shadow root оверлея (один раз).
 *
 * @returns контейнер для карточек.
 */
function ensureOverlay(): HTMLElement {
    if (container) return container

    host = document.createElement('div')
    host.id = HOST_ID
    // `pointer-events: none` на host: страница под оверлеем остаётся кликабельной,
    // карточки включают события обратно.
    host.style.cssText =
        'position:fixed;inset:0;z-index:2147483647;pointer-events:none;overflow:auto;overscroll-behavior:contain;'
    ;(document.body ?? document.documentElement).appendChild(host)

    shadow = host.attachShadow({ mode: 'open' })
    shadow.innerHTML = `<style>${STYLES}</style><div class="stack"></div>`
    container = shadow.querySelector('.stack') as HTMLElement

    shadow.addEventListener('click', (event) => {
        const target = event.target as HTMLElement | null
        if (target?.closest('[data-close]')) {
            target.closest('.card')?.remove()
            cleanup()
            return
        }
        const copy = target?.closest('[data-copy]')
        if (copy) {
            const card = copy.closest('.card')
            void copyCard(card)
        }
    })

    return container
}

/**
 * Копирует текст карточки в буфер обмена.
 *
 * @param card карточка ошибки.
 */
async function copyCard(card: Element | null): Promise<void> {
    const text = card?.querySelector('.dump')?.textContent ?? ''
    try {
        await navigator.clipboard.writeText(text)
    } catch {
        // Буфер может быть недоступен (нет фокуса/разрешения) — молча игнорируем:
        // текст всё равно есть в консоли и в DOM.
    }
}

/**
 * Убирает host, если карточек не осталось: иначе невидимый fixed-слой мешал бы скроллу.
 */
function cleanup(): void {
    if (container && container.childElementCount > 0) return
    host?.remove()
    host = null
    shadow = null
    container = null
}

/** Закрывает все карточки. */
function clearOverlay(): void {
    container?.replaceChildren()
    cleanup()
}

/**
 * Экранирует HTML-спецсимволы.
 *
 * @param value строка.
 * @returns экранированная строка.
 */
function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

/** Стили внутри shadow root: страница пользователя их не переопределит. */
const STYLES = `
:host { all: initial; }
* { box-sizing: border-box; }
.stack {
  display: flex; flex-direction: column; gap: 12px;
  align-items: center; padding: 16px;
  font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.card {
  pointer-events: auto;
  width: min(980px, 100%);
  max-height: 70vh; overflow: auto;
  padding: 14px 18px 12px;
  background: #11141b; color: #e6e8ee;
  border: 1px solid #232936; border-left: 3px solid #ff5c5c;
  border-radius: 10px;
  box-shadow: 0 16px 48px rgb(0 0 0 / 45%);
}
.head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.grow { flex: 1; }
.badge {
  padding: 2px 9px; border-radius: 999px;
  background: #241a20; color: #ff9a9a; border: 1px solid #3b222b;
  font: 600 11px/1.6 system-ui, -apple-system, Segoe UI, sans-serif;
  text-transform: uppercase; letter-spacing: .04em;
}
.icon {
  width: 26px; height: 26px; border-radius: 6px; cursor: pointer;
  background: transparent; color: #8b93a7; border: 1px solid transparent;
  font: 18px/1 system-ui, sans-serif;
}
.icon:hover { background: #1b2130; color: #e6e8ee; border-color: #2b3345; }
h2 {
  margin: 0 0 10px; word-break: break-word;
  font: 600 14px/1.5 system-ui, -apple-system, Segoe UI, sans-serif; color: #ffd7d7;
}
h2 .name { color: #ff7a7a; }
.hintline {
  margin: -2px 0 10px; padding: 7px 10px;
  border-radius: 6px; background: #1b2130; color: #cfd6e6;
  font: 12px/1.5 system-ui, -apple-system, Segoe UI, sans-serif;
}
.frames { list-style: none; margin: 0 0 10px; padding: 0; }
.frame { position: relative; padding: 1px 0 1px 14px; color: #8b93a7; word-break: break-all; }
.frame::before { content: "›"; position: absolute; left: 0; color: #4b5366; }
.frame.project { color: #d6dcea; }
.frame.project::before { color: #ff7a7a; }
.fn { color: #9aa4bb; }
.loc { color: #6ea8fe; text-decoration: none; }
.loc:hover { text-decoration: underline; }
.muted { color: #6b7488; margin: 0 0 10px; }
details summary { cursor: pointer; color: #8b93a7; margin-bottom: 6px; }
details summary:hover { color: #cfd6e6; }
.foot {
  display: flex; align-items: center; gap: 12px;
  margin-top: 10px; padding-top: 10px; border-top: 1px solid #1d222d;
}
.copy {
  padding: 5px 12px; border-radius: 7px; cursor: pointer;
  background: #1b2130; color: #dfe4ef; border: 1px solid #2b3345;
  font: 500 12px/1.4 system-ui, -apple-system, Segoe UI, sans-serif;
}
.copy:hover { background: #232b3d; }
.hint { color: #596174; font-size: 11px; }
@media (prefers-color-scheme: light) {
  .card { background: #1a1d25; }
}
`
