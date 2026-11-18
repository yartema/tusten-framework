import { beforeEach, describe, expect, it } from 'vitest'
import { buildNavigation, getNavigation, setNavigationCatalog } from '../../../packages/tusten/src/core/navigation'
import type { TustenClientRoute, TustenRouteNavigation } from '../../../packages/tusten/src/types'

/**
 * Клиентская запись маршрута с дефолтами.
 *
 * @param partial обязательные поля (`id`, `path`) + переопределения.
 * @returns маршрут в клиентской проекции.
 */
function makeRoute(partial: Partial<TustenClientRoute> & { id: string; path: string }): TustenClientRoute {
    return {
        title: 'Страница',
        description: null,
        parentIds: [],
        meta: {},
        metaConfig: null,
        contentConfig: { workspaceConfig: { template: `${partial.id}/view:View` } },
        middleware: [],
        layoutChain: [],
        ...partial,
    }
}

/**
 * Маршрут, участвующий в навигации.
 *
 * @param id id.
 * @param path путь.
 * @param navigation payload.
 * @param rest прочие поля.
 * @returns клиентская запись.
 */
function makeNavRoute(
    id: string,
    path: string,
    navigation: TustenRouteNavigation,
    rest: Partial<TustenClientRoute> = {},
): TustenClientRoute {
    return makeRoute({ id, path, navigation, ...rest })
}

beforeEach(() => {
    setNavigationCatalog([])
})

describe('buildNavigation', () => {
    it('статический маршрут получает href из route.path', () => {
        const items = buildNavigation([makeNavRoute('about', '/about', { title: 'О нас' })])

        expect(items).toEqual([{ id: 'about', href: '/about', dynamic: false, title: 'О нас' }])
    })

    it('navigation.href перебивает дефолт', () => {
        const items = buildNavigation([makeNavRoute('about', '/about', { title: 'О нас', href: '/company' })])

        expect(items[0].href).toBe('/company')
        expect(items[0].dynamic).toBe(false)
    })

    it('динамический маршрут: dynamic true и без href', () => {
        const items = buildNavigation([makeNavRoute('blog', '/blog/:id', { title: 'Блог' }, { slug: [':id'] })])

        expect(items[0]).toMatchObject({ id: 'blog', dynamic: true, slug: [':id'], title: 'Блог' })
        expect('href' in items[0]).toBe(false)
    })

    it('динамический + navigation.href: ссылка есть, динамика остаётся', () => {
        const items = buildNavigation([
            makeNavRoute('blog', '/blog/:id', { title: 'Статьи', href: '/blog/hello' }, { slug: [':id'] }),
        ])

        expect(items[0].href).toBe('/blog/hello')
        expect(items[0].dynamic).toBe(true)
    })

    it('динамика определяется по regex-slug после computePath', () => {
        const items = buildNavigation([makeNavRoute('post', '/post/:slug', { title: 'Пост' })])

        expect(items[0].dynamic).toBe(true)
    })

    it('маршрут без navigation не попадает в каталог', () => {
        const items = buildNavigation([makeRoute({ id: 'hidden', path: '/hidden' })])

        expect(items).toEqual([])
    })

    it('payload проходит насквозь, включая вложенные объекты', () => {
        const items = buildNavigation([
            makeNavRoute('about', '/about', {
                title: 'О нас',
                icon: 'info',
                badge: { count: 3, tone: 'muted' },
            }),
        ])

        expect(items[0]).toMatchObject({
            title: 'О нас',
            icon: 'info',
            badge: { count: 3, tone: 'muted' },
        })
    })

    it('зарезервированные ключи не перебиваются payload-ом', () => {
        const items = buildNavigation([
            makeNavRoute(
                'about',
                '/about',
                { id: 'fake', href: '', parentId: 'fake', dynamic: true, slug: ['fake'] },
                { parentId: 'root' },
            ),
        ])

        // Пустой href — «не задан»: берётся дефолт из path. Payload `slug`
        // удаляется: у маршрута своего slug нет.
        expect(items[0]).toMatchObject({
            id: 'about',
            href: '/about',
            parentId: 'root',
            dynamic: false,
        })
        expect('slug' in items[0]).toBe(false)
    })

    it('slug без маршрута не появляется из payload-а', () => {
        const items = buildNavigation([makeNavRoute('about', '/about', { title: 'О нас', slug: ['fake'] })])

        expect('slug' in items[0]).toBe(false)
    })

    it('порядок = порядок объявления, order не сортирует', () => {
        const items = buildNavigation([
            makeNavRoute('first', '/first', { title: 'First', order: 30 }),
            makeNavRoute('second', '/second', { title: 'Second', order: 10 }),
            makeNavRoute('third', '/third', { title: 'Third', order: 20 }),
        ])

        expect(items.map((item) => item.id)).toEqual(['first', 'second', 'third'])
    })

    it('элементы заморожены', () => {
        const items = buildNavigation([makeNavRoute('about', '/about', { title: 'О нас' })])

        expect(Object.isFrozen(items[0])).toBe(true)
    })
})

describe('getNavigation', () => {
    it('до сидинга возвращает пустой массив', () => {
        delete (globalThis as { __rootNavigation?: unknown }).__rootNavigation

        expect(getNavigation()).toEqual([])
    })

    it('возвращает новый массив с замороженными элементами', () => {
        setNavigationCatalog(buildNavigation([makeNavRoute('about', '/about', { title: 'О нас' })]))

        const first = getNavigation()
        const second = getNavigation()

        expect(first).not.toBe(second)
        expect(first).toEqual(second)
        expect(Object.isFrozen(first[0])).toBe(true)

        first.pop()
        expect(getNavigation()).toHaveLength(1)
    })

    it('setNavigationCatalog копирует входной массив', () => {
        const items = buildNavigation([makeNavRoute('about', '/about', { title: 'О нас' })])
        setNavigationCatalog(items)
        items.length = 0

        expect(getNavigation()).toHaveLength(1)
    })
})
