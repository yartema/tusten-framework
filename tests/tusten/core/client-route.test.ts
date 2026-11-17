import { describe, expect, it } from 'vitest'
import { collectParentIds, pickClientRoute, toClientRoute } from '../../../packages/tusten/src/core/client-route'
import type { TustenRoute } from '../../../packages/tusten/src/types'

/**
 * Маршрут с дефолтами для тестов.
 *
 * @param partial переопределения.
 * @returns маршрут.
 */
function makeRoute(partial: Partial<TustenRoute> & { id: string }): TustenRoute {
    return {
        metaConfig: {
            title: 'Главная',
            meta: [{ name: 'description', content: 'Описание' }],
        },
        contentConfig: {
            workspaceConfig: { template: `${partial.id}/view:View` },
            prefetchConfig: { configLoader: `${partial.id}/Factories/Root` },
        },
        ...partial,
    }
}

describe('toClientRoute', () => {
    it('переносит конфиг и вычисляет title/description', () => {
        const route = makeRoute({ id: 'home', meta: { custom: true } })
        const client = toClientRoute(route, {
            path: '/',
            parentIds: [],
            layoutChain: ['Page/Layout:Main'],
        })

        expect(client).toMatchObject({
            id: 'home',
            path: '/',
            title: 'Главная',
            description: 'Описание',
            meta: { custom: true },
            layoutChain: ['Page/Layout:Main'],
        })
    })

    it('маршрут без layout и metaConfig', () => {
        const route = makeRoute({ id: 'plain', metaConfig: undefined })
        const client = toClientRoute(route, { path: '/plain' })

        expect(client.metaConfig).toBeNull()
        expect(client.title).toBe('Страница')
        expect(client.description).toBeNull()
        expect(client.parentIds).toEqual([])
        expect(client.layoutChain).toEqual([])
    })

    it('pickClientRoute отбрасывает внутренние поля и совпадает с toClientRoute', () => {
        const route = makeRoute({ id: 'home' })
        const client = toClientRoute(route, {
            path: '/',
            parentIds: ['root'],
            layoutChain: ['Page/Layout:Main'],
        })
        const entry = { ...client, templatePath: '/client/Home/View.tsx', templateExport: 'View' }

        const picked = pickClientRoute(entry)

        expect(picked).toEqual(client)
        expect(Object.keys(picked)).toEqual(Object.keys(client))
        expect('templatePath' in picked).toBe(false)
    })
})

describe('collectParentIds', () => {
    it('идёт от корня к родителю', () => {
        const root = makeRoute({ id: 'root' })
        const middle = makeRoute({ id: 'middle', parentId: 'root' })
        const leaf = makeRoute({ id: 'leaf', parentId: 'middle' })
        const byId = new Map([
            ['root', root],
            ['middle', middle],
            ['leaf', leaf],
        ])

        expect(collectParentIds('leaf', byId)).toEqual(['root', 'middle'])
        expect(collectParentIds('root', byId)).toEqual([])
        expect(collectParentIds('missing', byId)).toEqual([])
    })

    it('не зацикливается на битом parentId', () => {
        const a = makeRoute({ id: 'a', parentId: 'b' })
        const b = makeRoute({ id: 'b', parentId: 'a' })
        const byId = new Map([
            ['a', a],
            ['b', b],
        ])

        expect(collectParentIds('a', byId)).toEqual(['b'])
    })
})
