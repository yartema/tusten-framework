import type { ComponentType, ReactNode } from 'react'
import type { TustenClientRoute } from '../../types'

/** Пропсы `RootProvider` (оболочка клиентского рантайма). */
export interface RootProviderProps {
    children?: ReactNode
    sliceRegistry: unknown
    router: unknown
    route?: TustenClientRoute | null
}

/** Компонент `RootProvider`. */
export type RootProviderComponent = ComponentType<RootProviderProps>

/** Конструктор реестра слайсов запроса. */
export type SliceRegistryConstructor = new () => unknown
