import type { JSX } from 'react'
import { useNavigation, useSlice } from '@tusten/core/client'
import type { AppInfoSlice } from './Factories/appInfo'

/**
 * Главная страница.
 *
 * Данные приходят из JSON-RPC `App.Info` через фабрику `AppInfo`:
 * на SSR — до рендера, в браузере — из состояния страницы.
 *
 * @returns JSX-элемент.
 */
export function View(): JSX.Element {
    const info = useSlice<AppInfoSlice>('AppInfo')
    const nav = useNavigation()
    const state = info?.state

    /**
     * Перезапускает `loadData` текущей страницы: снова вызывает `App.Info`
     * (кэш `Service` сбрасывается, потому что reload запрашивает свежие данные).
     */
    const refresh = (): void => {
        void nav.reload().catch((err: unknown) => console.error('[AppInfo] reload failed:', err))
    }

    return (
        <section className="card">
            <h1 className="title">{state?.name ?? 'tusten'}</h1>
            <p className="text">
                React 19 + Fastify + Vite. Данные пришли через JSON-RPC <code>App.Info</code> ещё на сервере.
            </p>
            <ul className="list">
                {state?.stack.map((item) => (
                    <li key={item}>{item}</li>
                ))}
            </ul>
            <button className="button" type="button" onClick={refresh}>
                Обновить через JSON-RPC
            </button>
        </section>
    )
}
