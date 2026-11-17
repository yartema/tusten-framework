// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RootProvider } from '../../../../packages/tusten/src/client/context/RootProvider'
import { SliceRegistry } from '../../../../packages/tusten/src/client/slices/SliceRegistry'
import { useRoute } from '../../../../packages/tusten/src/client/hooks/useRoute'
import { toClientRoute } from '../../../../packages/tusten/src/core/client-route'
import type { TustenClientRouter, TustenRoute } from '../../../../packages/tusten/src/types'

/** Роутер для теста. */
const router: TustenClientRouter = {
    path: '/',
    params: {},
    query: {},
    routeId: 'home',
}

/** Минимальный маршрут. */
const route: TustenRoute = {
    id: 'home',
    metaConfig: { title: 'Главная' },
    contentConfig: {
        workspaceConfig: { template: 'Home/View:View' },
        prefetchConfig: { configLoader: 'Home/Root' },
    },
}

/**
 * Компонент, читающий `useRoute`.
 *
 * @returns текст с id маршрута.
 */
function Probe(): ReactNode {
    const current = useRoute()
    return createElement('span', null, current?.id ?? 'none')
}

describe('useRoute', () => {
    it('возвращает конфиг маршрута из RootProvider', () => {
        const clientRoute = toClientRoute(route, { path: '/', layoutChain: ['main'] })
        render(
            createElement(
                RootProvider,
                { sliceRegistry: new SliceRegistry(), router, route: clientRoute },
                createElement(Probe),
            ),
        )

        expect(screen.getByText('home')).toBeTruthy()
    })

    it('возвращает null для 404', () => {
        render(
            createElement(
                RootProvider,
                { sliceRegistry: new SliceRegistry(), router: { ...router, routeId: '__not-found__' }, route: null },
                createElement(Probe),
            ),
        )

        expect(screen.getByText('none')).toBeTruthy()
    })
})
