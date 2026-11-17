/**
 * Парсит query-строку.
 *
 * `URLSearchParams` (в отличие от ручного `decodeURIComponent`) не бросает
 * `URIError` на битом percent-encoding и понимает `+` как пробел.
 *
 * @param url полный URL.
 * @returns объект query (при повторе ключа побеждает последнее значение).
 */
export function queryToObject(url: string): Record<string, string> {
    const idx = url.indexOf('?')
    if (idx === -1) return {}
    const result: Record<string, string> = {}
    for (const [key, value] of new URLSearchParams(url.slice(idx + 1))) {
        result[key] = value
    }
    return result
}
