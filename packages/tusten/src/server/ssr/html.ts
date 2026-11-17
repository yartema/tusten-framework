import type { MiddlewareDef, PageMeta, ResolvedRootElement } from '../../types'

/** Опции сборки `<head>`. */
export interface BuildHeadOptions {
    /** Готовая строка `<link rel="stylesheet">` для `<head>`. */
    cssLinksHtml: string
    /** `<script type="module">` Vite-клиента (только dev). */
    viteClientScript: string
    /** Locale страницы для атрибута `<html lang>`; `undefined` — без атрибута. */
    locale?: string
    /** Тег/id/атрибуты контейнера; `undefined` — `<div id="root">`. */
    rootElement?: ResolvedRootElement
}

/** Опции фабрики хвоста документа. */
export interface DocumentTailOptions {
    /** Контейнер приложения: его закрывающий тег — начало хвоста. */
    rootElement: ResolvedRootElement
    /** `<script type="module" src="...">` entry-скрипта клиента. */
    entryScript: string
    /** `<script>` с `window.__ROOT_MIDDLEWARE__`. */
    middlewareScript: string
}

/**
 * Хвост документа: закрывающий тег контейнера, флаг режима, состояние и entry.
 *
 * @param ssr рендерился ли HTML на сервере.
 * @param stateJson `__ROOT_STATE_STR__` (пустая строка в SPA и на 404).
 * @param i18nBoot `<script>` с `window.__ROOT_I18N__` (пустая строка, если i18n выключен).
 * @param devScript `<script>` с ошибками стрима (dev) — до entry, чтобы оверлей увидел их при старте.
 * @returns HTML-строка.
 */
export type DocumentTail = (ssr: boolean, stateJson: string, i18nBoot?: string, devScript?: string) => string

/**
 * Собирает `<script>`-преамбулу Vite-клиента (React Refresh) для dev.
 *
 * @param isDev dev-режим.
 * @returns HTML-строка или пустая в prod.
 */
export function buildViteClientScript(isDev: boolean): string {
    if (!isDev) return ''
    return `<script type="module" src="/@vite/client"></script>
<script type="module">
  import RefreshRuntime from "/@react-refresh"
  RefreshRuntime.injectIntoGlobalHook(window)
  window.$RefreshReg$ = () => {}
  window.$RefreshSig$ = () => (type) => type
  window.__vite_plugin_react_preamble_installed__ = true
</script>`
}

/**
 * Собирает `<script type="module">` entry-скрипта клиента.
 *
 * @param entryScriptSrc URL entry-скрипта.
 * @returns HTML-строка.
 */
export function buildEntryScript(entryScriptSrc: string): string {
    return `<script type="module" src="${entryScriptSrc}"></script>`
}

/**
 * Сериализует клиентские middleware в `window.__ROOT_MIDDLEWARE__`.
 *
 * `<` экранируется как `\u003c`: иначе `</script>` внутри данных закрыл бы тег.
 *
 * @param middleware глобальные middleware из конфига.
 * @returns HTML-строка.
 */
export function buildMiddlewareScript(middleware: MiddlewareDef[] | undefined): string {
    const clientMiddleware = (middleware ?? []).filter((m) => !m.side || m.side === 'client' || m.side === 'both')
    const json = JSON.stringify(clientMiddleware).replace(/</g, '\\u003c')
    return `<script>window.__ROOT_MIDDLEWARE__=${json}</script>`
}

/**
 * Создаёт фабрику хвоста документа: закрывающий тег, режим, состояние и entry.
 *
 * Статичная часть (`middlewareScript`, `entryScript`) собирается один раз при
 * создании обработчика — от запроса зависит только состояние страницы.
 *
 * @param options контейнер и статичные скрипты.
 * @returns функция сборки хвоста.
 */
export function createDocumentTail(options: DocumentTailOptions): DocumentTail {
    const { rootElement, entryScript, middlewareScript } = options
    return (ssr, stateJson, i18nBoot = '', devScript = '') =>
        `</${rootElement.tag}>` +
        `<script>window.__ROOT_SSR__=${ssr}</script>` +
        middlewareScript +
        i18nBoot +
        devScript +
        `<script>window.__ROOT_STATE_STR__=${JSON.stringify(stateJson || '')}</script>` +
        `${entryScript}</body></html>`
}

/**
 * Рендерит открывающий тег контейнера приложения.
 *
 * `data-tusten-root` — служебный маркер: по нему клиент находит контейнер,
 * даже если `id` отключён или изменён.
 *
 * @param root настройки контейнера.
 * @returns HTML-тег.
 */
export function renderRootOpenTag(root: ResolvedRootElement): string {
    const id = root.id ? ` id="${escapeHtml(root.id)}"` : ''
    const attrs = Object.entries(root.attributes)
        .map(([name, value]) => (value === true ? ` ${name}` : ` ${name}="${escapeHtml(String(value))}"`))
        .join('')
    return `<${root.tag}${id} data-tusten-root${attrs}>`
}

/**
 * Собирает `<head>` с title, meta-тегами, JSON-LD, CSS и Vite-клиентом.
 *
 * Возвращает открытый тег контейнера приложения в конце, чтобы вызывающий код
 * мог стримить контент и закрыть его суффиксом.
 *
 * @param meta готовая meta страницы (title, meta[], microdata).
 * @param opts опции сборки `<head>`.
 * @returns HTML: `<!DOCTYPE html>…</head><body><div id="root" data-tusten-root>`.
 */
export function buildHead(meta: PageMeta, opts: BuildHeadOptions): string {
    const tags = meta.meta
        .map((m) => `<meta ${m.attribute ?? 'name'}="${escapeHtml(m.name)}" content="${escapeHtml(m.content)}">`)
        .join('')

    const micro =
        Object.keys(meta.microdata).length > 0
            ? `<script type="application/ld+json">${JSON.stringify(meta.microdata).replace(/</g, '\\u003c')}</script>`
            : ''

    // `lang` нужен скринридерам, SEO, спеллчекеру и CSS `:lang()`. Пустая строка
    // (i18n выключен) невалидна по HTML-спеке, поэтому тогда атрибут не рендерим.
    const lang = opts.locale ? ` lang="${escapeHtml(opts.locale)}"` : ''

    return (
        `<!DOCTYPE html><html${lang}><head><meta charset="utf-8">` +
        `<title>${escapeHtml(meta.title)}</title>` +
        tags +
        micro +
        opts.cssLinksHtml +
        opts.viteClientScript +
        `</head><body>${renderRootOpenTag(opts.rootElement ?? { tag: 'div', id: 'root', attributes: {} })}`
    )
}

/**
 * Экранирует HTML-спецсимволы.
 *
 * @param s строка.
 * @returns экранированная.
 */
export function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
