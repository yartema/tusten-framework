import type { TustenClientRoute } from '../../types'
import { useResourceContext } from '../context/RootProvider'

/**
 * Конфиг текущего маршрута из контекста `<RootProvider>`.
 *
 * Работает в root controller, layouts и страницах. На 404 и на странице
 * ошибки возвращает `null`.
 *
 * @returns публичный конфиг маршрута или `null`.
 * @throws {Error} если вызван вне `<RootProvider>`.
 */
export function useRoute(): TustenClientRoute | null {
    return useResourceContext().route
}
