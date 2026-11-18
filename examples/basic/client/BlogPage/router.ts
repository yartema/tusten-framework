import { defineRoute } from '@tusten/core'

/**
 * Маршрут блога: `/blog/:slug`.
 *
 * `path` — абсолютный паттерн с динамическим сегментом `:slug`.
 * `id` — стабильный ключ (`blog-post`), не зависит от slug.
 */
export default defineRoute([
    {
        id: 'blog',
        slug: [':id'],
        layout: 'layouts/Main',
        // Динамический маршрут: `href` ядро не придумывает — подставляет приложение.
        navigation: { title: 'Blog', order: 20 },
        metaConfig: {
            readMethod: 'Blogs.ReadMetaInfo',
            cache: 60_000,
            meta: [{ name: 'og:type', content: 'article', attribute: 'property' }],
        },
        contentConfig: {
            workspaceConfig: {
                template: 'BlogPage/view:View',
            },
            prefetchConfig: {
                configLoader: 'BlogPage/Factories/Root',
                configParams: {},
                dependencies: ['userInfo'],
            },
        },
    },
])
