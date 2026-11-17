import type { Slice } from '../client/slices/Slice'
import type { FastifyServerOptions } from 'fastify'

/**
 * Конфигурация фабрики данных.
 *
 * Возвращается из `getConfig` (см. `configLoader`) и из `defineGlobalLoader`.
 */
export interface FactoryDef {
    /** Путь до модуля-фабрики (`<file>:<export>` или `<file>` для default). */
    dataFactoryName: string
    /** Статические аргументы, передаваемые в `loadData`. */
    dataFactoryArguments?: Record<string, unknown>
    /**
     * Зависимости: имена других фабрик текущей страницы
     * или глобальных loaders. Коллизии запрещены (A3).
     */
    dependencies?: string[]
    /** Fastify-опции (пробрасываются как есть). */
    fastify?: FastifyServerOptions
}

/**
 * Карта фабрик: имя → описание.
 *
 * Используется как возвращаемое значение `getConfig` и как содержимое
 * `defineGlobalLoader`.
 */
export type FactoryMap = Record<string, FactoryDef>

/**
 * Реализация фабрики (то, что экспортируется по `dataFactoryName`).
 *
 * Имя слайса в реестре = ключ фабрики в `getConfig` / `defineGlobalLoader`.
 * Поле `slice` — конструктор класса, наследника `Slice<TState>`.
 */
export interface FactoryImplementation<TState = unknown> {
    /**
     * Загружает данные фабрики.
     *
     * @param args смерженные аргументы.
     * @param deps уже загруженные зависимости.
     * @param ctx контекст (`router`, служебные поля).
     * @returns объект, который попадёт в `slice` через `hydrate`.
     */
    loadData: (
        args: Record<string, unknown>,
        deps: Record<string, unknown>,
        ctx: Record<string, unknown>,
    ) => Promise<unknown>

    /** Класс слайса. */
    slice: new () => Slice<TState>

    /** Динамическое обогащение `args` (мержится поверх `dataFactoryArguments`). */
    getDataFactoryArguments?: () => Promise<Record<string, unknown>>
}
