import { describe, expect, it } from 'vitest'
import { renderSpaShell } from '../../../../packages/tusten/src/server/ssr/spa-shell'
import type { DocumentTail } from '../../../../packages/tusten/src/server/ssr/html'

const rootElement = { tag: 'div', id: 'root', attributes: {} }
const documentTail: DocumentTail = (ssr, stateJson, i18nBoot = '') => `|ssr=${ssr}|state=${stateJson}|i18n=${i18nBoot}`

describe('renderSpaShell', () => {
    it('собирает head, пустой каркас и хвост SPA', () => {
        const html = renderSpaShell({
            meta: { title: 'Home', meta: [], microdata: {} },
            cssLinksHtml: '<link rel="stylesheet" href="/a.css">',
            viteClientScript: '',
            rootElement,
            documentTail,
            i18nBoot: '<script>i18n</script>',
        })

        expect(html).toContain('<!DOCTYPE html><html><head>')
        expect(html).toContain('<title>Home</title>')
        expect(html).toContain('<link rel="stylesheet" href="/a.css">')
        expect(html).toContain('<div id="root" data-tusten-root>')
        expect(html).toContain('|ssr=false|state=|i18n=<script>i18n</script>')
    })

    it('рендерит lang и не вставляет состояние', () => {
        const html = renderSpaShell({
            meta: { title: 'Página', meta: [], microdata: {} },
            cssLinksHtml: '',
            viteClientScript: '',
            locale: 'pt-BR',
            rootElement,
            documentTail,
            i18nBoot: '',
        })

        expect(html.startsWith('<!DOCTYPE html><html lang="pt-BR">')).toBe(true)
        expect(html).toContain('|state=|')
    })
})
