/** CRUD-операции для `IBinding`. */
export type CrudOp = 'read' | 'query' | 'create' | 'update' | 'destroy'

/**
 * Соответствие CRUD-методов `Service` именам методов объекта БЛ.
 *
 * Если не задано — дефолты: `read → Read`, `query → List`,
 * `create → Create`, `update → Update`, `destroy → Delete`.
 */
export type IBinding = Partial<Record<CrudOp, string>>

/** Опции `Service`. */
export interface ServiceOptions {
    /** URL endpoint. По умолчанию `/service`. */
    url?: string
    /** Имя объекта БЛ (`Users`, `Staff`, ...). */
    endpoint?: string
    /** Конкретный метод (`List`) — для `call`-style без binding. */
    method?: string
    /** Маппинг CRUD → метод. */
    binding?: IBinding
    /** Таймаут запроса в миллисекундах. */
    timeout?: number
    /**
     * TTL кэша по умолчанию (ms). Не задан / `0` — кэш выключен.
     * Per-call override — `call(method, params, { cache })`.
     */
    cache?: number
    /**
     * Максимум записей в клиентском кэше (LRU-эвикция).
     * По умолчанию 500. На сервере (per-request) не применяется.
     */
    cacheMaxEntries?: number
}

/** Запись в кэше `TustenService`. */
export interface ServiceCacheEntry {
    /** Результат вызова. */
    value: unknown
    /** Timestamp истечения (ms, `Date.now()`). */
    expiresAt: number
}

/** Опции per-call (`service.call(method, params, opts)`). */
export interface CallOptions {
    /** TTL кэша для этого вызова (ms). `false` — не кэшировать. */
    cache?: number | false
}
