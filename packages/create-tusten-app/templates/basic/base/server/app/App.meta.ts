import { defineObject } from '@tusten/core/server'

/** Ответ метода `App.Info`. */
export interface AppInfo {
    name: string
    stack: string[]
}

/**
 * JSON-RPC объект `App`.
 *
 * Метод `Info` вызывается через `Service` из `client/Page/Factories/appInfo.ts`:
 * на SSR — напрямую в handler (без HTTP), в браузере — `POST /service`.
 * Endpoint и включение RPC задаются в `tusten.config.ts` (`server.rpc`).
 */
export default defineObject({
    name: 'App',
    description: 'Приложение',
    methods: {
        Info: {
            description: 'Название и стек приложения',
            handler: async (): Promise<AppInfo> => ({
                name: 'tusten',
                stack: ['React 19', 'Fastify 5', 'Vite', 'JSON-RPC 2.0'],
            }),
        },
    },
})
