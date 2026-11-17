import { createContext, useContext, type JSX, type ReactNode } from 'react'
import type { RootControllerProps, TustenClientRoute } from '@tusten/core/client'

/** Значение контекста корневой оболочки. */
interface AppShellContextValue {
    /** Публичный конфиг текущего маршрута. */
    route: TustenClientRoute | null
}

const AppShellContext = createContext<AppShellContextValue | null>(null)

/**
 * Пример доступа к контексту root controller из любой страницы или layout'а.
 *
 * @returns контекст приложения.
 * @throws {Error} если вызван вне `<Root>`.
 */
export function useAppShell(): AppShellContextValue {
    const value = useContext(AppShellContext)
    if (!value) throw new Error('useAppShell must be used within <Root>')
    return value
}

/**
 * Root controller демо: единая оболочка и провайдер для всех страниц.
 *
 * В реальном приложении здесь обычно живут тема, i18n-провайдер, клиент
 * запросов и общий каркас. `children` — это либо layout chain со страницей,
 * либо Loading/Error/NotFound.
 *
 * @param props пропсы root controller.
 * @param props.children дерево страницы или состояние (loading/error/not-found).
 * @param props.route конфиг текущего маршрута.
 * @param props.status состояние страницы.
 * @returns JSX-элемент.
 */
export function Root({ children, route, status }: RootControllerProps): JSX.Element {
    return (
        <AppShellContext.Provider value={{ route }}>
            <div className="min-h-screen" data-app-shell="" data-status={status}>
                {children as ReactNode}
            </div>
        </AppShellContext.Provider>
    )
}
