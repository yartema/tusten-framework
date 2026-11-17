import { useCallback, useSyncExternalStore } from 'react'
import type { AbstractSlice } from '../slices/AbstractSlice'
import { useResourceContext } from '../context/RootProvider'

/** Опции внутреннего хука. */
export interface UseSliceInternalOptions {
    /** Подписка на state (true) или только на присутствие слайса (false). */
    observeState?: boolean
    /** Кидать, если slice не найден. */
    strict?: boolean
}

/**
 * Внутренняя реализация `useSlice`.
 *
 * `S` — конкретный тип слайса; реестр хранит `AbstractSlice<unknown>`,
 * каст в точке возврата — ответственность вызывающего.
 *
 * @param key имя слайса.
 * @param options опции (observeState, strict).
 * @returns слайс или undefined (в strict-режиме — только слайс).
 */
export function useSliceInternal<S extends AbstractSlice<unknown>>(
    key: string,
    options: UseSliceInternalOptions = {},
): S | undefined {
    const { sliceRegistry } = useResourceContext()
    const { observeState = true, strict = false } = options
    // Инстанс может быть заменён без notifyKey (SliceRegistry.adoptPage /
    // adoptGlobal при router.reload). Если не включить его в зависимости
    // subscribe, useSyncExternalStore останется подписан на уничтоженный
    // слайс, и setState нового инстанса не будет перерисовывать компонент.
    const slice = sliceRegistry.get(key) as S | undefined

    // Подписка: следим и за изменениями state текущего инстанса, и за
    // сменой инстанса по ключу (setPage/setGlobal/dispose).
    const subscribe = useCallback(
        (listener: () => void) => {
            let current: AbstractSlice<unknown> | undefined = sliceRegistry.get(key)
            let unsubSlice = current?.subscribe(listener)

            const unsubKey = sliceRegistry.subscribeKey(key, () => {
                const next = sliceRegistry.get(key)
                if (next !== current) {
                    unsubSlice?.()
                    current = next
                    unsubSlice = next?.subscribe(listener)
                }
                listener()
            })

            return () => {
                unsubKey()
                unsubSlice?.()
            }
        },
        [sliceRegistry, key, slice],
    )

    const getSnapshot = useCallback(() => {
        const slice = sliceRegistry.get(key)
        if (!slice) return undefined
        return observeState ? slice.state : slice
    }, [sliceRegistry, key, observeState])

    useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

    return (strict ? sliceRegistry.require(key) : sliceRegistry.get(key)) as S | undefined
}
