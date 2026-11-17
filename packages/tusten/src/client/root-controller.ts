import type { ReactNode } from 'react'
import type { TustenClientRoute, TustenClientRouter } from '../types'

/** Состояние страницы, которое видит root controller. */
export type RootControllerStatus = 'ready' | 'loading' | 'error' | 'not-found'

/**
 * Пропсы root controller — компонента-оболочки всего приложения
 * (`config.client.root`).
 *
 * Контроллер рендерится **всегда** и один раз: на SSR, при гидрации,
 * в SPA-loading, на 404 и на странице ошибки. Внутри него доступны хуки
 * `useSlice`/`useRouter`/`useRoute`, а его React-контекст видят все layouts
 * и страницы.
 */
export interface RootControllerProps {
    /** Готовое дерево: layouts + страница, либо Loading/Error/NotFound. */
    children?: ReactNode
    /** Конфиг текущего маршрута; `null` — 404. */
    route: TustenClientRoute | null
    /** Текущий роутер: path, params, query, routeId. */
    router: TustenClientRouter
    /** Что сейчас рендерится внутри оболочки. */
    status: RootControllerStatus
    /** Ошибка для `status='error'`. */
    error?: unknown
}
