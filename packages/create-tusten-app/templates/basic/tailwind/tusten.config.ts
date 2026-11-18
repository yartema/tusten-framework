import { defineConfig } from '@tusten/core'
import tailwindcss from '@tailwindcss/vite'

/**
 * Конфигурация приложения.
 *
 * `127.0.0.1` вместо `localhost`: на Windows Node может резолвить `localhost`
 * в IPv6 (`::1`), и сервер будет недоступен по IPv4.
 */
export default defineConfig({
    ssr: true,
    // Статика с корня сайта: `public/` рядом с `client/` и `server/`.
    // В dev её отдаёт Vite, при сборке копируется в `dist/client`.
    publicDir: 'public',
    client: {
        clientDir: 'client',
        css: ['styles/main.css'],
    },
    server: {
        serverDir: 'server',
        host: '127.0.0.1',
        port: 3000,
        // JSON-RPC включён по умолчанию: объекты в `server/**/*.meta.ts`
        // вызываются через `Service` (на SSR — без HTTP, в браузере — POST /service).
        rpc: { enabled: true, url: '/service' },
        // Сжатие (brotli/gzip) включено по умолчанию.
        // Если сжимает прокси или CDN — раскомментируйте:
        // compress: false,
    },
    // Алиасы берутся из `compilerOptions.paths` в tsconfig.json — одна точка
    // правды для редактора, `tsc` и Vite. Серверные модули (routes/plugins/
    // middleware/RPC) грузятся через jiti, он тоже читает `paths`.
    vite: {
        resolve: {
            tsconfigPaths: true,
        },
        plugins: [tailwindcss()],
    },
})
