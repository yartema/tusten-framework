import { defineRoute } from '@tusten/core'

/**
 * Маршрут админки. `parentId: 'home'` → URL `/admin`
 * (home — index, его id не добавляется). Layout-цепочка:
 * `layouts/Main → layouts/Admin` (задана явно).
 */
export default defineRoute([
    {
        id: 'admin',
        parentId: 'home',
        layout: ['layouts/Main', 'layouts/Admin'],
        metaConfig: {
            title: 'Admin Page',
        },
        ssr: false,
        contentConfig: {
            workspaceConfig: {
                template: 'AdminPage/view:View',
            },
            prefetchConfig: {
                configLoader: 'AdminPage/Factories/Root',
                configParams: {},
                dependencies: ['userInfo'],
            },
        },
    },
])
