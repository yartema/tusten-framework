import { useResourceContext } from '../context/RootProvider'

/**
 * Query-параметры текущего URL.
 *
 * @deprecated Используйте `useNavigation().query`.
 * @returns объект `query`.
 */
export function useQuery(): Record<string, string> {
    return useResourceContext().router.query
}
