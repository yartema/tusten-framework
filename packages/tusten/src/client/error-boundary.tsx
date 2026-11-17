import { Component, createElement, type ComponentType, type ReactNode } from 'react'
import { reportDevError } from './dev-report'

/** Пропсы `RootErrorBoundary`. */
export interface RootErrorBoundaryProps {
    children?: ReactNode
    /** Fallback-компонент, получает `{ error }`. */
    fallback?: ComponentType<{ error: Error }>
    /**
     * Ключ сброса: при изменении пойманная ошибка забывается.
     *
     * Нужен SPA-навигации: иначе fallback «залипнет» после перехода на другую
     * страницу, потому что компонент не перемонтируется.
     */
    resetKey?: unknown
}

/** Состояние. */
interface RootErrorBoundaryState {
    error: Error | null
}

/**
 * Error Boundary фреймворка. Оборачивает дерево страницы.
 *
 * Работает в SSR (`renderToPipeableStream` ловит ошибки через boundary)
 * и на клиенте. Если `fallback` не задан — минимальная заглушка.
 */
export class RootErrorBoundary extends Component<RootErrorBoundaryProps, RootErrorBoundaryState> {
    state: RootErrorBoundaryState = { error: null }

    /**
     * @param error ошибка из дочернего дерева.
     * @returns новое состояние.
     */
    static getDerivedStateFromError(error: Error): RootErrorBoundaryState {
        return { error }
    }

    /**
     * Логирует ошибку.
     *
     * @param error ошибка.
     * @param info React error info.
     */
    componentDidCatch(error: Error, info: unknown): void {
        console.error('[tusten] error boundary caught:', error, info)
        // В dev оверлей показывает и пойманные ошибки: наличие fallback не отменяет баг.
        // В prod хука нет — вызов почти бесплатен.
        reportDevError(error, 'boundary')
    }

    /**
     * Сбрасывает ошибку при навигации: без этого fallback остаётся навсегда,
     * потому что React переиспользует инстанс boundary между страницами.
     *
     * @param prevProps предыдущие пропсы.
     */
    componentDidUpdate(prevProps: RootErrorBoundaryProps): void {
        if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
            this.setState({ error: null })
        }
    }

    /**
     * Рендер: fallback при ошибке, иначе `children`.
     *
     * @returns ReactNode.
     */
    render(): ReactNode {
        if (this.state.error) {
            const Fallback = this.props.fallback
            if (Fallback) {
                return createElement(Fallback, { error: this.state.error })
            }
            return createElement(
                'div',
                {
                    style: {
                        padding: '1rem',
                        color: 'crimson',
                        fontFamily: 'system-ui, sans-serif',
                    },
                },
                'Error: ' + this.state.error.message,
            )
        }
        return this.props.children
    }
}
