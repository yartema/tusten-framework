// @vitest-environment jsdom
import { createElement, type ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RootErrorBoundary } from '../../../packages/tusten/src/client/error-boundary'

/** Управляет тем, должен ли ребёнок падать. */
let shouldThrow = false

/**
 * Ребёнок, который падает по флагу.
 *
 * @returns элемент.
 */
function Bomb(): ReactNode {
    if (shouldThrow) throw new Error('boom')
    return createElement('span', null, 'ok')
}

afterEach(() => {
    shouldThrow = false
    vi.restoreAllMocks()
})

describe('RootErrorBoundary', () => {
    it('сбрасывает ошибку при смене resetKey', () => {
        // React и сам boundary пишут в консоль ожидаемую ошибку — не засоряем вывод.
        vi.spyOn(console, 'error').mockImplementation(() => undefined)

        shouldThrow = true
        const { rerender } = render(createElement(RootErrorBoundary, { resetKey: '/a' }, createElement(Bomb)))

        expect(screen.getByText(/Error: boom/)).toBeTruthy()

        shouldThrow = false
        rerender(createElement(RootErrorBoundary, { resetKey: '/b' }, createElement(Bomb)))

        expect(screen.queryByText(/Error: boom/)).toBeNull()
        expect(screen.getByText('ok')).toBeTruthy()
    })
})
