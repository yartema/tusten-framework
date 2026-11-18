import type { FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import type { RpcRegistry } from './rpc-registry'
import type { ResolvedTustenConfig } from '../types'
import { processBody } from './rpc/process'

/** Опции `createRpcHandler`. */
export interface RpcHandlerOptions {
    registry: RpcRegistry
    config: ResolvedTustenConfig
}

/**
 * Создаёт Fastify handler для `POST /service` (JSON-RPC 2.0).
 *
 * @param options опции.
 * @returns Fastify handler.
 */
export function createRpcHandler(options: RpcHandlerOptions) {
    const { registry, config } = options

    return async function handler(req: FastifyRequest, reply: FastifyReply): Promise<FastifyReply> {
        const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID()
        reply.header('X-Request-Id', requestId)

        let extension: Record<string, unknown> = {}
        if (config.server.rpc.extendContext) {
            try {
                extension = await config.server.rpc.extendContext(req)
            } catch (err) {
                console.error('[tusten] rpc.extendContext failed:', err)
            }
        }

        const response = await processBody(req.body, registry, requestId, extension)
        // `return` обязателен: при `reply.send()` без возврата цепочка
        // `@fastify/compress` + Fastify 5 завершает ответ пустым телом
        // (`content-length: 0`). Все точки фреймворка возвращают результат.
        return reply.code(200).type('application/json').send(response)
    }
}
