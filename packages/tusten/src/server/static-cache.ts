/** `Cache-Control` для файлов с хэшем в имени: имя меняется вместе с содержимым. */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable'

/**
 * `Cache-Control` для нехешированных файлов (`robots.txt`, `favicon.ico`, ...).
 *
 * `no-cache` не запрещает кэш — он требует ревалидацию, поэтому после деплоя
 * браузер не застревает со старой версией.
 */
export const REVALIDATE_CACHE_CONTROL = 'no-cache'

/**
 * Регулярное выражение хэша Vite: `-[A-Za-z0-9_-]{6,}` перед расширением.
 *
 * Длина хэша в Vite 6/8 — 8 символов, но закладываемся на минимум 6, чтобы
 * правило пережило смену алгоритма и не «посеребрило» обычные файлы.
 */
const HASHED_ASSET_RE = /-[A-Za-z0-9_-]{6,}\.[^./\\]+$/

/**
 * Определяет `Cache-Control` для файла статики по его пути.
 *
 * immutable получают только реальные артефакты сборки (`chunks/*-<hash>.js`,
 * `assets/*-<hash>.*`). Entry-бандл тоже хэшируется и лежит в `assets/`.
 * Файлы из `public/` не хэшируются — для них нужна ревалидация: иначе после
 * деплоя клиент застрянет на старой версии.
 *
 * @param filePath абсолютный путь файла (как его отдаёт `@fastify/static`).
 * @returns значение заголовка `Cache-Control`.
 */
export function resolveStaticCacheControl(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/')
    const segments = normalized.split('/')
    // `@fastify/static` отдаёт `setHeaders` логический путь (без `.br`/`.gz`),
    // но функция публичная — терпим и вариант с суффиксом сжатия.
    const base = (segments[segments.length - 1] ?? '').replace(/\.(?:br|gz)$/i, '')

    // Вложенность внутри assets/chunks допустима (`assets/fonts/...`).
    const fromBuildDir = /(?:^|\/)(?:chunks|assets)\//.test(normalized)
    if (fromBuildDir && HASHED_ASSET_RE.test(base)) return IMMUTABLE_CACHE_CONTROL

    return REVALIDATE_CACHE_CONTROL
}
