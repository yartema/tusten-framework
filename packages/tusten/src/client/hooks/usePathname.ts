import { useResourceContext } from '../context/RootProvider'

/**
 * Текущий путь.
 *
 * @deprecated Используйте `useNavigation().pathname`.
 * @returns pathname.
 */
export function usePathname(): string {
    return useResourceContext().router.path
}
