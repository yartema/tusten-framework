import { createElement, useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useNavigationPending } from '../hooks/useNavigationPending'

/** Пропсы индикатора перехода. */
export interface NavigationProgressProps {
    /** Цвет полоски. По умолчанию `#2563eb`. */
    color?: string
    /** Толщина полоски в пикселях. По умолчанию 2. */
    height?: number
    /** `z-index` контейнера. По умолчанию `2147483000`. */
    zIndex?: number
    /** Задержка показа, мс: короткие переходы не мигают полоской. По умолчанию 0. */
    delay?: number
    /** Дополнительный CSS-класс контейнера. */
    className?: string
}

/** Длительность анимации завершения, мс. */
const FINISH_MS = 200

/**
 * Полоска загрузки сверху страницы.
 *
 * Показывает `true`, пока `useNavigationPending()` сообщает о переходе
 * (middleware + prefetch + commit нового дерева). Рендерится в root controller
 * и при SSR тоже — в невидимом состоянии, поэтому hydration не расходится:
 *
 * ```tsx
 * export function Root({ children }: RootControllerProps) {
 *     return createElement('div', null, createElement(NavigationProgress), children)
 * }
 * ```
 *
 * @param props цвет, толщина, задержка.
 * @returns полоска (fixed, не перехватывает клики).
 */
export function NavigationProgress(props: NavigationProgressProps = {}): ReactNode {
    const { color = '#2563eb', height = 2, zIndex = 2147483000, delay = 0, className } = props
    const pending = useNavigationPending()
    const [visible, setVisible] = useState(false)
    const [finishing, setFinishing] = useState(false)

    useEffect(() => {
        if (pending) {
            if (delay > 0) {
                const timer = setTimeout(() => {
                    setFinishing(false)
                    setVisible(true)
                }, delay)
                return () => clearTimeout(timer)
            }
            setFinishing(false)
            setVisible(true)
            return
        }

        if (!visible) return
        setFinishing(true)
        const timer = setTimeout(() => {
            setVisible(false)
            setFinishing(false)
        }, FINISH_MS)
        return () => clearTimeout(timer)
    }, [pending, visible, delay])

    const containerStyle: CSSProperties = {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height,
        pointerEvents: 'none',
        zIndex,
        opacity: visible ? 1 : 0,
        transition: `opacity ${FINISH_MS}ms linear`,
    }

    const barStyle: CSSProperties = {
        width: '100%',
        height: '100%',
        background: color,
        transformOrigin: 'left center',
        transform: pending ? 'scaleX(0.85)' : finishing ? 'scaleX(1)' : 'scaleX(0)',
        // Пока идёт переход — медленно «ползём» к 85 %; финал — короткий рывок.
        transition: pending ? 'transform 8000ms cubic-bezier(0.1, 0.05, 0, 1)' : `transform ${FINISH_MS}ms ease-out`,
    }

    return createElement(
        'div',
        {
            className,
            'data-tusten-progress': '',
            'data-state': !visible ? 'idle' : pending ? 'pending' : finishing ? 'finishing' : 'idle',
            'aria-hidden': 'true',
            style: containerStyle,
        },
        createElement('div', { style: barStyle }),
    )
}
