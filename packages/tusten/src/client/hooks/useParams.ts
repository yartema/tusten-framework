import { useResourceContext } from '../context/RootProvider'

/**
 * Динамические сегменты текущего маршрута (Phase 2.5, пока `{}`).
 *
 * @deprecated Используйте `useNavigation().params`.
 * @returns объект `params`.
 */
export function useParams(): Record<string, string> {
    return useResourceContext().router.params
}
