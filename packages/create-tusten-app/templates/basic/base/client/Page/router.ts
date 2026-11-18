import { defineRoute } from '@tusten/core'

/**
 * Главная страница: единственный `index: true` в проекте.
 */
export default defineRoute([
    {
        id: 'home',
        index: true,
        layout: 'layouts/Main',
        metaConfig: {
            title: 'Главная',
        },
        contentConfig: {
            workspaceConfig: {
                template: 'Page/view:View',
            },
            // Данные страницы грузятся до рендера (SSR и SPA): `getConfig`
            // возвращает фабрики, их `loadData` вызывает JSON-RPC.
            prefetchConfig: {
                configLoader: 'Page/Factories/Root',
                configParams: {},
            },
        },
    },
])
