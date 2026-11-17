/**
 * Общие константы и проверки locale для клиента и сервера.
 *
 * Модуль client-safe: без `node:*`, чтобы его можно было импортировать и в браузере,
 * и в конфиге, и в SSR.
 */

/** Имя cookie с выбранным пользователем языком. Читает сервер (SSR), пишет `setLocale`. */
export const LOCALE_COOKIE = 'lang'

/**
 * Допустимый формат locale (`en`, `pt-BR`). Только буквы, цифры и дефисы:
 * locale попадает в путь `lang/<locale>/` и в virtual-id модуля, поэтому
 * разделители пути и `..` недопустимы.
 */
const LOCALE_PATTERN = /^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/

/**
 * Допустимое имя cookie (token по RFC 6265): буквы, цифры и символы
 * `!#$%&'*+-.^_`|~`. Пробелы, `;`, `=`, `,` и прочие разделители запрещены —
 * иначе браузер обрежет или исказит `document.cookie`, а сервер не найдёт ключ.
 */
const COOKIE_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/

/**
 * Проверяет, что значение — строка допустимого формата locale.
 *
 * @param value проверяемое значение.
 * @returns `true`, если это допустимый locale.
 */
export function isValidLocale(value: unknown): value is string {
    return typeof value === 'string' && LOCALE_PATTERN.test(value)
}

/**
 * Проверяет, что значение — допустимое имя cookie (RFC 6265 token).
 *
 * @param value проверяемое значение.
 * @returns `true`, если имя можно писать в `document.cookie` и искать в `Cookie`.
 */
export function isValidCookieName(value: unknown): value is string {
    return typeof value === 'string' && COOKIE_NAME_PATTERN.test(value)
}
