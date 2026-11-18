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
        // `permission` — прикладной ключ: фильтрует layout, ядро отдаёт всем.
        navigation: { title: 'Admin', order: 30, permission: 'write' },
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
