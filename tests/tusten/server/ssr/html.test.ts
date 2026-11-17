import { describe, expect, it } from 'vitest'
import { buildHead } from '../../../../packages/tusten/src/server/ssr/html'
import type { PageMeta } from '../../../../packages/tusten/src/types'

/**
 * Минимальная meta для проверок `<head>`.
 *
 * @param title заголовок страницы.
 * @returns объект meta.
 */
function pageMeta(title = 'Главная'): PageMeta {
    return { title, meta: [], microdata: {} }
}

describe('buildHead: <html lang>', () => {
    it('рендерит lang из locale запроса', () => {
        const html = buildHead(pageMeta(), { cssLinksHtml: '', viteClientScript: '', locale: 'pt-BR' })
        expect(html.startsWith('<!DOCTYPE html><html lang="pt-BR"><head>')).toBe(true)
    })

    it('без locale (i18n выключен) — без атрибута', () => {
        const html = buildHead(pageMeta(), { cssLinksHtml: '', viteClientScript: '' })
        expect(html.startsWith('<!DOCTYPE html><html><head>')).toBe(true)
    })

    it('экранирует значение атрибута', () => {
        const html = buildHead(pageMeta(), {
            cssLinksHtml: '',
            viteClientScript: '',
            locale: 'x"><script>',
        })
        expect(html).toContain('<html lang="x&quot;&gt;&lt;script&gt;">')
    })

    it('кастомный контейнер: тег, id и атрибуты', () => {
        const html = buildHead(pageMeta(), {
            cssLinksHtml: '',
            viteClientScript: '',
            rootElement: {
                tag: 'main',
                id: 'app',
                attributes: { class: 'shell', 'data-x': 1, hidden: true },
            },
        })
        expect(html).toContain('</head><body><main id="app" data-tusten-root class="shell" data-x="1" hidden>')
    })

    it('без id — остаётся data-tusten-root', () => {
        const html = buildHead(pageMeta(), {
            cssLinksHtml: '',
            viteClientScript: '',
            rootElement: { tag: 'div', id: null, attributes: {} },
        })
        expect(html).toContain('</head><body><div data-tusten-root>')
    })

    it('экранирует id и атрибуты контейнера', () => {
        const html = buildHead(pageMeta(), {
            cssLinksHtml: '',
            viteClientScript: '',
            rootElement: {
                tag: 'div',
                id: 'a"b',
                attributes: { title: '"><script>' },
            },
        })
        expect(html).toContain('<div id="a&quot;b" data-tusten-root title="&quot;&gt;&lt;script&gt;">')
    })
})
