/** Ошибка валидации Standard Schema. */
export interface StandardSchemaV1Issue {
    readonly message: string
    readonly path?: ReadonlyArray<PropertyKey | { readonly key: PropertyKey }>
}

/** Успешный результат валидации. */
export interface StandardSchemaV1Success<Output> {
    readonly value: Output
    readonly issues?: undefined
}

/** Неуспешный результат валидации. */
export interface StandardSchemaV1Failure {
    readonly issues: ReadonlyArray<StandardSchemaV1Issue>
}

/** Результат валидации. */
export type StandardSchemaV1Result<Output> = StandardSchemaV1Success<Output> | StandardSchemaV1Failure

/**
 * Standard Schema интерфейс (valibot, zod, arktype, effect-schema).
 *
 * Tusten не зависит от конкретной библиотеки валидации — принимает любую,
 * реализующую `~standard`. Стандарт: https://standardschema.dev
 */
export interface StandardSchemaV1<Input = unknown, Output = Input> {
    readonly '~standard': {
        readonly version: 1
        readonly vendor: string
        readonly validate: (value: unknown) => StandardSchemaV1Result<Output> | Promise<StandardSchemaV1Result<Output>>
    }
    /** Фантомные поля для вывода типа (не используются в рантайме). */
    readonly '~tusten-input'?: Input
    readonly '~tusten-output'?: Output
}

/** Схема параметров RPC-метода. */
export type RpcParamsSchema<P> = StandardSchemaV1<unknown, P>

/** Требование авторизации для метода. */
export type AuthRequirement =
    | false
    | undefined
    | true
    | {
          /** Требуется одна из ролей (массив = OR). */
          roles: string[]
      }

/**
 * Контекст, передаваемый в `RpcMethodDefinition.handler`.
 *
 * Расширяется прикладником через `config.server.rpc.extendContext` +
 * module augmentation (`declare module '@tusten/core/server' { interface RpcContext {...} }`).
 */
export interface RpcContext {
    /** ID запроса (из `X-Request-Id` или сгенерирован tusten). */
    requestId: string
    /**
     * JSON-RPC вызов через `Service` (изоморфный).
     *
     * На сервере — прямой вызов из реестра объектов (без HTTP).
     * На клиенте — `fetch('/service')`.
     * Для `internal: true` — единственный способ вызвать.
     */
    call: <R = unknown>(method: string, params?: unknown) => Promise<R>
    /** Расширения из `config.server.rpc.extendContext`. */
    [key: string]: unknown
}

/**
 * Описание одного RPC-метода.
 *
 * @template P тип параметров (после валидации).
 * @template R тип результата.
 */
export interface RpcMethodDefinition<P = unknown, R = unknown> {
    /** Комментарий для админки. */
    description?: string
    /** Схема параметров (Standard Schema). */
    params?: RpcParamsSchema<P>
    /** `false`/`undefined` — публичный; `true` — нужен пользователь; `{ roles }` — роли. */
    auth?: AuthRequirement
    /**
     * Обработчик бизнес-логики.
     *
     * @param params валидированные параметры.
     * @param ctx контекст (requestId, call, расширения из `config.server.rpc.extendContext`).
     * @returns результат (сериализуется как `result` в JSON-RPC).
     */
    handler: (params: P, ctx: RpcContext) => R | Promise<R>
    /** Произвольные метаданные (UI, аудит); не участвуют в обработке. */
    meta?: Record<string, unknown>
    /**
     * Внутренний метод: доступен только через `ctx.call`.
     * Снаружи (HTTP → `/service`) вернёт `-32601 Method not found`.
     */
    internal?: boolean
}

/**
 * Описание объекта бизнес-логики (Users, Staff, Employees...).
 *
 * Имя уникально; методы объекта задаются в `methods`.
 * Полное имя метода: `${name}.${methodKey}`, например `Users.List`.
 */
export interface RpcObjectDefinition {
    /** Имя объекта: `[A-Za-z][A-Za-z0-9_]*`. */
    name: string
    /** Комментарий для админки. */
    description?: string
    /** Методы объекта (ключи — `List`, `Read`, `Create`, ...). */
    methods: Record<string, RpcMethodDefinition<unknown, unknown>>
    /** Произвольные метаданные. */
    meta?: Record<string, unknown>
}

/** Опции RPC-слоя. */
export interface RpcOptions {
    /** Включён ли RPC. По умолчанию `true`. */
    enabled?: boolean
    /** URL endpoint. По умолчанию `/service`. */
    url?: string
    /** Включить `System.Describe` (по умолчанию `true`). */
    describe?: boolean
    /**
     * Расширение контекста. Вызывается на каждый `/service` запрос и на каждый
     * `ctx.call` при SSR (чтобы контекст был изолирован).
     *
     * @param req Fastify-запрос (только на сервере).
     * @returns объект для мержа в `RpcContext`.
     */
    extendContext?: (req: unknown) => Promise<Record<string, unknown>> | Record<string, unknown>
}

/** Резолвнутые опции RPC. */
export interface ResolvedRpcOptions {
    enabled: boolean
    url: string
    describe: boolean
    extendContext?: (req: unknown) => Promise<Record<string, unknown>> | Record<string, unknown>
}

/** Изоморфный исполнитель JSON-RPC (регистрируется сервером в ALS). */
export type RpcExecutor = (payload: string, headers: Record<string, string>) => Promise<Response>
