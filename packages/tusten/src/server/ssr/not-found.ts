import { createElement, type ComponentType, type ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import type { RootControllerProps } from '../../client/root-controller'
import type { ResolvedTustenConfig, TustenClientRouter } from '../../types'
import type { RootProviderComponent, SliceRegistryConstructor } from './contracts'
import type { I18nRequest } from './i18n-request'

/** Опции рендера 404. */
export interface NotFoundOptions {
    /** URL запроса без query. */
    url: string
    /** Query-параметры запроса. */
    query: Record<string, string>
    /** Нормализованный конфиг (root controller и `notFound`-компонент). */
    config: ResolvedTustenConfig
    /** Конструктор реестра слайсов. */
    SliceRegistry: SliceRegistryConstructor
    /** Оболочка клиентского рантайма. */
    RootProvider: RootProviderComponent
    /** Дефолтный 404. */
    RootNotFound: ComponentType
    /** Загрузчик модулей с кэшем prod. */
    loadModuleCached: (spec: string) => Promise<unknown>
    /** i18n-состояние запроса. */
    i18n: I18nRequest
}

/**
 * Рендерит тело 404 в структуру, которую гидрирует клиент.
 *
 * Структура совпадает с клиентской (`RootProvider` + `<NotFound/>` с
 * `routeId: '__not-found__'`), иначе `hydrateRoot` даст mismatch. Root controller
 * нужен и здесь: без него оболочка/провайдеры исчезнут с сервера.
 *
 * Ошибка загрузки root controller пробрасывается (ответ 500), ошибка рендера
 * кастомного `notFound` — откатывается на дефолтный `RootNotFound`.
 *
 * @param options URL, конфиг и компоненты.
 * @returns HTML-строка тела 404.
 * @throws если root controller не загрузился или не является компонентом.
 */
export async function renderNotFoundBody(options: NotFoundOptions): Promise<string> {
    const { url, query, config, SliceRegistry, RootProvider, RootNotFound, loadModuleCached, i18n } = options

    const registry = new SliceRegistry()
    const router: TustenClientRouter = {
        path: url,
        params: {},
        query,
        routeId: '__not-found__',
    }

    /**
     * @param node содержимое страницы.
     * @param root root controller (или `null`).
     * @returns HTML-строка.
     */
    const render = (node: ReactNode, root: ComponentType<RootControllerProps> | null): string => {
        const tree = root ? createElement(root, { route: null, router, status: 'not-found' }, node) : node
        return renderToString(createElement(RootProvider, { sliceRegistry: registry, router, route: null }, tree))
    }

    let root: ComponentType<RootControllerProps> | null = null
    const rootSpec = config.client.root.component
    if (rootSpec) {
        const rootValue = await loadModuleCached(rootSpec)
        if (typeof rootValue !== 'function') {
            throw new Error(`Root controller is not a component: ${rootSpec}`)
        }
        root = rootValue as ComponentType<RootControllerProps>
    }

    // Словари нужны до рендера: `rk` синхронный и без словаря отдаст ключи.
    await i18n.loadDictionaries()

    try {
        const NotFound = config.client.components.notFound
            ? ((await loadModuleCached(config.client.components.notFound)) as ComponentType)
            : RootNotFound
        return render(createElement(NotFound), root)
    } catch (err) {
        console.warn('[tusten] failed to render config.client.components.notFound, fallback to default:', err)
        return render(createElement(RootNotFound), root)
    }
}
