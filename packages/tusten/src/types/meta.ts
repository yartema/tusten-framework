/** Один мета-тег. */
export interface MetaTag {
    name: string
    content: string
    /** HTML-атрибут: `name` (дефолт) или `property` (Open Graph, Twitter). */
    attribute?: 'name' | 'property'
}

/** Возврат `readMethod` / `getMetaCallback`. */
export interface MetaResult {
    /** Динамический `<title>`. Переопределяет `metaConfig.title`. */
    title?: string
    meta?: MetaTag[]
    microdata?: Record<string, unknown>
}

/** Конфиг meta для маршрута. */
export interface MetaConfig {
    readMethod?: string
    getMetaCallback?: string
    cache?: number
    title?: string
    meta?: MetaTag[]
    microdata?: Record<string, unknown>
}

/** Готовая meta для рендера. */
export interface PageMeta {
    title: string
    meta: MetaTag[]
    microdata: Record<string, unknown>
}
