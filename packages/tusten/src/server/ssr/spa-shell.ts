import type { PageMeta, ResolvedRootElement } from '../../types'
import { buildHead, type DocumentTail } from './html'

/** Опции SPA-шелла. */
export interface SpaShellOptions {
    /** Meta страницы (статика из `metaConfig`). */
    meta: PageMeta
    /** Готовые `<link rel="stylesheet">`. */
    cssLinksHtml: string
    /** `<script>` Vite-клиента (dev). */
    viteClientScript: string
    /** Locale для `<html lang>`; `undefined` — без атрибута. */
    locale?: string
    /** Контейнер приложения. */
    rootElement: ResolvedRootElement
    /** Фабрика хвоста документа. */
    documentTail: DocumentTail
    /** Boot-скрипт `window.__ROOT_I18N__` (пустая строка, если i18n выключен). */
    i18nBoot: string
}

/**
 * Собирает документ SPA (`config.ssr: false` / `route.ssr: false` / `?noSSR=true`).
 *
 * HTML пустой: данные и meta подтянет клиент; сервер сообщает только режим,
 * locale и bootstrap-состояние.
 *
 * @param options meta, ассеты и хвост документа.
 * @returns полный HTML-документ.
 */
export function renderSpaShell(options: SpaShellOptions): string {
    const head = buildHead(options.meta, {
        cssLinksHtml: options.cssLinksHtml,
        viteClientScript: options.viteClientScript,
        locale: options.locale,
        rootElement: options.rootElement,
    })
    return head + options.documentTail(false, '', options.i18nBoot)
}
