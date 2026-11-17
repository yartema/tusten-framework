import { defineRoute } from '@tusten/core'

/**
 * Маршрут страницы About.
 */
export default defineRoute([
    {
        id: 'about',
        layout: 'layouts/Main',
        metaConfig: {
            title: 'About Page',
        },
        middleware: [],
        contentConfig: {
            workspaceConfig: {
                template: 'AboutPage/view:View',
            },
            prefetchConfig: {
                configLoader: 'AboutPage/Factories/Root',
                configParams: {},
                dependencies: ['userInfo'],
            },
        },
    },
])
