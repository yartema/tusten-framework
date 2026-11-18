/**
 * Максимальная длина имени npm-пакета.
 *
 * https://github.com/npm/validate-npm-package-name — 214 символов.
 */
const MAX_PACKAGE_NAME_LENGTH = 214

/**
 * Приводит имя каталога к валидному имени npm-пакета.
 *
 * Папка пользователя может называться как угодно (`My App`, `Проект`), но
 * `package.json#name` обязан быть URL-safe и в нижнем регистре. Для не-ASCII
 * имён остаётся fallback `tusten-app`.
 *
 * @param input имя каталога или явно заданное имя.
 * @returns валидное имя пакета.
 */
export function toPackageName(input: string): string {
    let name = input
        .trim()
        .toLowerCase()
        // Пробелы и подчёркивания — допустимые разделители, но не часть имени.
        .replace(/[\s_]+/g, '-')
        // Всё, что npm не разрешает в имени пакета.
        .replace(/[^a-z0-9._-]/g, '-')
        // Ведущие точки/подчёркивания запрещены.
        .replace(/^[._-]+/, '')
        // Хвостовые разделители бессмысленны.
        .replace(/[-.]+$/, '')
        // Схлопываем повторы.
        .replace(/-{2,}/g, '-')

    if (!name) name = 'tusten-app'
    if (name.length > MAX_PACKAGE_NAME_LENGTH) name = name.slice(0, MAX_PACKAGE_NAME_LENGTH).replace(/[-.]+$/, '')

    return name
}
