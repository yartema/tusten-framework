// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, renderHook } from '@testing-library/react'
import {
    isNavigationPending,
    setNavigationPending,
    subscribeNavigationPending,
} from '../../../../packages/tusten/src/client/navigation/status'
import { useNavigationPending } from '../../../../packages/tusten/src/client/hooks/useNavigationPending'
import { useNavigation } from '../../../../packages/tusten/src/client/hooks/useNavigation'
import { NavigationProgress } from '../../../../packages/tusten/src/client/navigation/NavigationProgress'

describe('navigation status', () => {
    beforeEach(() => {
        setNavigationPending(false)
    })

    afterEach(() => {
        cleanup()
        setNavigationPending(false)
    })

    it('setNavigationPending меняет снапшот и нотифицирует подписчиков', () => {
        const listener = vi.fn()
        const unsubscribe = subscribeNavigationPending(listener)

        expect(isNavigationPending()).toBe(false)

        setNavigationPending(true)
        expect(isNavigationPending()).toBe(true)
        expect(listener).toHaveBeenCalledTimes(1)

        // Повторный вызов с тем же значением — без лишней нотификации.
        setNavigationPending(true)
        expect(listener).toHaveBeenCalledTimes(1)

        setNavigationPending(false)
        expect(isNavigationPending()).toBe(false)
        expect(listener).toHaveBeenCalledTimes(2)

        unsubscribe()
        setNavigationPending(true)
        expect(listener).toHaveBeenCalledTimes(2)
    })

    it('useNavigationPending читает стор', () => {
        const { result } = renderHook(() => useNavigationPending())
        expect(result.current).toBe(false)

        act(() => setNavigationPending(true))
        expect(result.current).toBe(true)

        act(() => setNavigationPending(false))
        expect(result.current).toBe(false)
    })

    it('useNavigation отдаёт pending', () => {
        const { result } = renderHook(() => useNavigation())
        expect(result.current.pending).toBe(false)

        act(() => setNavigationPending(true))
        expect(result.current.pending).toBe(true)
    })
})

describe('NavigationProgress', () => {
    beforeEach(() => {
        vi.useFakeTimers()
        setNavigationPending(false)
    })

    afterEach(() => {
        cleanup()
        vi.useRealTimers()
        setNavigationPending(false)
    })

    it('показывает полоску во время перехода и прячет после завершения', () => {
        const { container } = render(<NavigationProgress />)
        const root = container.querySelector('[data-tusten-progress]') as HTMLElement
        expect(root.dataset.state).toBe('idle')
        expect(root.style.opacity).toBe('0')

        act(() => setNavigationPending(true))
        expect(root.dataset.state).toBe('pending')
        expect(root.style.opacity).toBe('1')

        act(() => setNavigationPending(false))
        expect(root.dataset.state).toBe('finishing')

        act(() => vi.advanceTimersByTime(250))
        expect(root.dataset.state).toBe('idle')
        expect(root.style.opacity).toBe('0')
    })

    it('delay не показывает полоску для мгновенного перехода', () => {
        const { container } = render(<NavigationProgress delay={200} />)
        const root = container.querySelector('[data-tusten-progress]') as HTMLElement

        act(() => setNavigationPending(true))
        expect(root.dataset.state).toBe('idle')

        act(() => vi.advanceTimersByTime(200))
        expect(root.dataset.state).toBe('pending')
    })

    it('не перехватывает клики', () => {
        const { container } = render(<NavigationProgress />)
        const root = container.querySelector('[data-tusten-progress]') as HTMLElement
        expect(root.style.pointerEvents).toBe('none')
        expect(root.getAttribute('aria-hidden')).toBe('true')
    })
})
