import { describe, expect, it } from 'vitest'
import { collectFactoryModules } from '../../../packages/tusten/src/build/collect-factories'
import type { RouteTree, ScanResult, TustenRoute } from '../../../packages/tusten/src/types'

/**
 * Собирает `RouteTree` из одного маршрута.
 *
 * @param route маршрут.
 * @returns дерево.
 */
function makeTree(route: TustenRoute): RouteTree {
    return {
        byId: new Map([[route.id, route]]),
        paths: new Map([[route.id, `/${route.id}`]]),
        indexRouteId: null,
        compiled: [],
        layoutChains: new Map([[route.id, []]]),
    }
}

describe('collectFactoryModules', () => {
    it('маршрут без prefetchConfig и без *.loader.ts → пустой список', async () => {
        const route: TustenRoute = {
            id: 'static',
            contentConfig: { workspaceConfig: { template: 'Static/view:View' } },
        }
        const scanResult: ScanResult = { routeModules: [], loaderModules: [] }

        await expect(
            collectFactoryModules('/project', makeTree(route), scanResult, '/project/client'),
        ).resolves.toEqual([])
    })

    it('глобальные загрузчики собираются без prefetchConfig у страницы', async () => {
        const route: TustenRoute = {
            id: 'static',
            contentConfig: { workspaceConfig: { template: 'Static/view:View' } },
        }
        const scanResult: ScanResult = {
            routeModules: [],
            loaderModules: [
                { file: '/project/client/User.loader.ts', map: { userInfo: { dataFactoryName: 'User:userInfo' } } },
            ],
        }

        await expect(
            collectFactoryModules('/project', makeTree(route), scanResult, '/project/client'),
        ).resolves.toEqual(['User:userInfo'])
    })
})
