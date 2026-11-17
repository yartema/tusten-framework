# Changelog

Все заметные изменения проекта **tusten**.
Формат — [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/), версии — [SemVer](https://semver.org/lang/ru/).
Breaking changes помечены **BREAKING**.

## [0.2.0-beta.6] — 2026-11-18

### Breaking

- **Дефолтное имя cookie с выбранным языком — `lang`** (было `tusten_locale`). Старые cookie больше не читаются: пользователь один раз получит язык из `Accept-Language` / `defaultLocale`. Вернуть прежнее имя — `defineConfig({ i18n: { key: 'tusten_locale', defaultLocale, locales } })`.
- **`client.layouts` и `route.type` удалены.** Layout теперь задаётся в `defineRoute` через `route.layout`: `'Page/Layout:Main'`, массив для вложенности или `false`/`[]` для отказа. Если в конфиге есть `client.layouts`, загрузчик выведет warning и проигнорирует его. Если в маршруте остался `type`, `buildRouteTree` тоже выведет warning.
- **`client.rootElement` удалён** и заменён на `client.root.container`. `client.root` теперь объект `{ component?, container? }`; короткая строка `root: 'Page/Controller:Root'` поддерживается только для `component`.

### Added

- **`slice.state`** — прямое чтение состояния слайса как свойства (`slice.state`). `getState()` оставлен `@deprecated`-алиасом и больше не используется внутри фреймворка, в примерах и документации.
- **Root controller (`client.root.component`)** — компонент-оболочка всего приложения, которая рендерится всегда: SSR, гидрация, SPA-loading, ошибка и 404. Получает `children`, `route`, `router`, `status` (`ready` / `loading` / `error` / `not-found`) и `error`. Внутри доступны `useSlice`/`useRouter`/`useRoute`, а React-контекст корня видят все layouts и страницы. Не задан — поведение как раньше, без обёртки.
- **`useRoute()`** — публичный конфиг текущего маршрута в root controller, layouts и страницах. Новый тип `TustenClientRoute` — JSON-safe проекция `TustenRoute`; на сервере и клиенте используется одна функция проекции, поэтому нет hydration mismatch.
- **`route.layout`** — layout как часть маршрута: строка (полная цепочка), массив (явная вложенность root → leaf), `undefined` (наследовать от `parentId`), `false`/`[]` (без layout'ов). Строка/массив заменяют унаследованную цепочку, дубликаты подряд удаляются. Layout всегда опционален.
- **`client.root.container`** — настройка контейнера приложения: `tag` (по умолчанию `div`), `id` (по умолчанию `root`, `false` — без id) и `attributes` (`class`, `data-*`, `aria-*`, `style`, ...). Клиент находит контейнер по служебному `data-tusten-root`, поэтому смена id/тега не ломает гидрацию. Событийные атрибуты (`on*`) запрещены — это статичный HTML.
- **`i18n.key`** — имя cookie с выбранным языком. Действует и на сервере (`resolveRequestLocale`), и на клиенте (`setLocale`); ключ уезжает в `window.__ROOT_I18N__` (`cookieKey`), поэтому SSR и гидрация используют одно и то же имя. Дефолт — `LOCALE_COOKIE` (`lang`). Имя валидируется при загрузке конфига (RFC 6265 token, обрезается по краям): пустая строка, пробелы и разделители — `TustenError`.
- **`<html lang>`** — SSR, SPA и 404 отдают атрибут `lang` с locale запроса (нужен скринридерам, SEO, спеллчекеру и CSS `:lang()`). При выключенном i18n атрибут не рендерится.
- `RootErrorBoundary` получил `resetKey`: при SPA-навигации пойманная ошибка больше не «залипает» после перехода на другую страницу.
- Тесты на кастомный ключ cookie: `config`, `negotiate`, `boot`, `locale`, `runtime`, `ssr-head`. Всего 497 тестов (32 файла).
- **Dev-оверлей ошибок в браузере.** Падение SSR отдаёт отдельную страницу с описанием, стеком и code frame вокруг строки; стек маппится по sourcemap через `vite.ssrFixStacktrace` (в кадрах исходные `.tsx`), кадры кликабельны и открывают файл в редакторе (`/__open-in-editor`).
- **Ошибки SSR после отправки shell** (стриминг) уезжают в HTML как `window.__TUSTEN_SSR_ERRORS__`; клиент показывает их оверлеем поверх частичной страницы, потому что статус ответа уже отправлен.
- **Клиентский оверлей** (`@tusten/core/client/dev-overlay`, shadow DOM): описание, стек, копирование, переход в редактор, закрытие по Esc. Ловит гидрацию (`onRecoverableError`), SPA-навигацию, initial prefetch, `window.error` / `unhandledrejection` и ошибки, пойманные `RootErrorBoundary`. Одинаковые ошибки дедуплицируются; при сбое динамического импорта оверлей подсказывает проверить, запущен ли dev-сервер.
- **Prod-страница 500** с коротким `Код ошибки` и без стека/путей; код пишется в лог (`[tusten] <label> [id]: …`) и связывает ответ пользователя с записью.
- Новая точка входа пакета `@tusten/core/client/dev-overlay` (tsup entry + `exports`); в prod-бандл не попадает — entry импортирует её динамически внутри `if (import.meta.env.DEV)`.
- **`useNavigation()`** — единый хук навигации: `pathname`, `params`, `query`, `route` и методы `push` / `replace` / `back` / `prefetch` / `reload`. Заменяет связку `useRouter()` + `usePathname()` + `useParams()` + `useQuery()`.
- **`router.reload(options?)`** — перезапуск лоадеров текущего маршрута без смены URL и history. По умолчанию обновляет глобальные и page-слайсы, сбрасывает клиентский кэш `Service` и сохраняет локальный state компонентов. Опции: `global` (по умолчанию `true`), `cache` (`false` — сбросить кэш), `remount` (перемонтировать страницу), `middleware` (прогнать клиентскую цепочку). Ошибка не заменяет страницу на `components.error`; при гонке с навигацией побеждает последняя операция. До инициализации client-entry — полная перезагрузка.
- **`SliceRegistry.adoptGlobal(source)`** — атомарная подмена global-слайсов (используется `router.reload`, чтобы при ошибке не оставить частично обновлённые глобальные состояния).

### Deprecated

- `useRouter()`, `usePathname()`, `useParams()`, `useQuery()` — используйте `useNavigation()`. Старые хуки остаются тонкими обёртками.

### Fixed

- **После `router.reload()` переставали обновляться слайсы.** `adoptPage` / `adoptGlobal` заменяют инстансы без `notifyKey`, а `useSlice` оставался подписан на уничтоженный слайс: `setState` нового инстанса не вызывал re-render. Теперь `subscribe` для `useSyncExternalStore` зависит от текущего инстанса и переподписывается после подмены.
- **SSR игнорировал cookie с locale.** В `readLocaleCookie` условие `pair.slice(0, idx).trim() !== key || LOCALE_COOKIE` было всегда истинным, поэтому выбор пользователя (`setLocale`) не учитывался — locale всегда бралась из `Accept-Language` / `defaultLocale`.
- **SPA-навигация при ошибке больше не молчит.** Если `clientPrefetch` или загрузка чанка маршрута падают, рендерится `components.error` (в dev плюс оверлей), а не остаётся старая страница без объяснения.
- **Back в SPA терял query-параметры.** Обработчик `popstate` передавал только `window.location.pathname`, поэтому back с `/about?tab=router` вёл на `/about`, а `replaceState` затирал предыдущие записи истории. Теперь учитывается `pathname + search`, и back возвращает на предыдущую вкладку/страницу.
- **Фатальный сбой клиента в SPA** (без SSR) показывает текст «Не удалось загрузить страницу. Обновите её» вместо пустого экрана; SSR-разметка при этом не затирается.
- В dev- и prod-ответах 500 используется один и тот же путь `fail()`: раньше dev отдавал `<pre>` с одним `message`, без стека и без code frame.

### Changed

- Пути в `client.*` задаются относительно `clientDir` без `./`: `Page/Controller:Root`, `layouts/Main`. Старый вид с `./` поддерживается — нормализуется при загрузке конфига.
- `window.__ROOT_I18N__` содержит `cookieKey`; `I18nBootstrap.cookieKey` применяется в `initI18n` через `setLocaleCookieKey`.
- CHANGELOG переехал в `packages/tusten/CHANGELOG.md` и отслеживается git; `prepack` больше не копирует его из корня.
- README: цепочка определения locale и пример конфига описывают `i18n.key` и дефолт `lang`.

## [0.2.0-beta.5] — 2026-11-14

### Breaking

- **Формат `tusten.config.ts`** приведён к структуре `ResolvedTustenConfig`:
    ```ts
    export default defineConfig({
        ssr: true,
        client: {
            clientDir: 'client',
            layouts: { main: './layouts/Main.tsx' },
            css: ['styles/main.css'],
            components: { error, loading, notFound },
        },
        server: { serverDir: 'server', port, host, routes, plugins, rpc },
        middleware,
        vite,
        build,
        runtimeConfig,
        fastify,
    })
    ```
    - `clientDir`, `layouts`, `css`, `components` переехали в `client`;
    - `serverDir` и `rpc` переехали в `server`;
    - `css` теперь **массив** путей (было `{ main: string }`) — в dev каждый файл даёт свой `<link>`.
- **`Slice.dispose()` → `Slice.destroy()`**. `dispose()` оставлен как `@deprecated`-алиас, но теперь тоже очищает state. Уничтоженный слайс: `setState` — no-op (+ `console.warn` вне production), `subscribe` — пустая отписка.
- **`SerializedState.slices[*].config`** — новый элемент `__ROOT_STATE_STR__` (в типе `optional` для чтения старых снимков).

### Added

- `AbstractSlice.destroy()` / `isDestroyed()`; уничтожение освобождает подписчиков и state.
- `_initState(result, config)` / `hydrate(result, config)`: вторым аргументом приходит `dataFactoryArguments` фабрики. Config сериализуется в `__ROOT_STATE_STR__`, поэтому SSR-гидратация на клиенте получает те же значения, что и сервер.
- `SliceRegistry.adoptPage(source)` — атомарная подмена page-слайсов при SPA-навигации; `setPage` / `setGlobal` уничтожают заменяемый инстанс.
- `setState` для plain-объектов делает **поверхностный мерж** (было — полная замена): `setState({ total: 0 })` сохраняет остальные ключи. Для массивов, `Map`/`Date` и экземпляров классов — замена. Новый публичный тип `SlicePatch<TState>`.
- SSR: заголовки `Cache-Control: no-store` и `Vary: Accept` (404), кэш `loadModule` в prod, статические фрагменты документа вынесены из per-request пути.
- `utils/fs`: `resolveRealPath()` и `toVitePath()` — канонический регистр путей для Vite/HMR.
- `getRouter()` — навигатор без React-контекста для обработчиков, сервисов и таймеров. Тот же API, что у `useRouter()`.
- **i18n клиентских модулей.** Импорт `import rk from 'i18n!<Module>'` (единственный синтаксис). Словари — `client/<Module>/lang/<locale>/<locale>.json`; конфиг — `defineConfig({ i18n: { defaultLocale, locales } })`.
    - `rk(key, ctx?)` — ключ = текст на исходном языке, поиск `ctx@@key` → `key`; нет перевода → ключ, без ошибок. Битый JSON и нестроковые значения — ошибка сборки.
    - `template(str, params, locale?)` — `{name}` и `{n, plural, one {…} few {…} many {…} other {…}}` (подмножество ICU, `other` обязателен).
    - Locale: cookie `tusten_locale` → `Accept-Language` (с `q`) → `defaultLocale`. SSR-рендер и словари встраиваются в HTML; гидрация без mismatch. Параллельные запросы изолированы через `AsyncLocalStorage`.
    - `setLocale(l)` (`@tusten/core/client`) — cookie и перезагрузка страницы. Реактивного переключения нет.
    - Типы: `declare module 'i18n!*'` подключается через `@tusten/core/client`.
    - Тесты: `i18nTestPlugin()` из `@tusten/core/server` — в Vitest `i18n!X` превращается в заглушку, `rk(key)` возвращает `key`.
    - `tusten inspect` печатает i18n-модули: число ключей по locale, отсутствующие словари, ошибки JSON.

### Fixed

- **HMR на Windows/macOS**: правка компонента не подхватывалась без перезапуска dev, если регистр в спеке не совпадал с файлом (`'HomePage/view'` ↔ `View.tsx`). Причина — Vite регистрировал модуль под `view.tsx`, а watcher присылал `View.tsx`. Пути канонизируются через `realpathSync.native` в `module-loader`, `vite/plugin` и `serialize`.
- `serialize`: `modulePath` ломался, когда `projectDir` был коротким путём (`C:\Users\AV-BAR~1\...`), а `realpath` — длинным (`../../../../../...`).
- SSR: исключение после `reply.hijack()` (парсинг URL, 404-рендер, middleware) оставляло запрос висеть до таймаута — добавлен внешний `try/catch` и guard на повторный `end()`. В production клиенту больше не уходит текст внутренней ошибки.
- `queryToObject` падал с `URIError` на битом percent-encoding (`?a=%`) — заменён на `URLSearchParams`.
- SPA-переход: при ошибке `loadData` новая страница больше не оставляет пользователя с уже уничтоженными слайсами — prefetch идёт в отдельный реестр, подмена только после успеха.
- независимые фабрики грузятся параллельно, и для `runPagePrefetch`, и для `runGlobalPrefetch`. Каждая ждёт только свои зависимости. Порядок записи в `slices` и `registry` остался прежним (топологический)
- чанки шаблона и `layout`, `Error` и классы слайсов грузятся параллельно. `Loading` в `SSR` больше не качается. Добавил защиту от устаревшей навигации, `onRecoverableError` для `hydration` `mismatch` и прогрев чанка шаблона при prefetch. resolveMeta больше не блокирует `SPA-переход`, и `document.title` перестал затираться (раньше `route.title` перетирал заголовок из `meta`).
- `CSS` берётся по всей цепочке `layout` и из imports. В `<head>` добавлен `modulepreload` для `client.js`, чанков маршрута и слайсов. Слои и шаблон грузятся параллельно, `ErrorComponent` стартует до `prefetch`.

### Changed

- `../../examples/basic` переведён на новую структуру конфига; `UserListState.limit` демонстрирует второй аргумент `_initState`.
- Документация: `README.md` — генерируемая копия корневого (`prepack`), правило зафиксировано в `AGENTS.md`; файл добавлен в `.gitignore`.
- `useRouter()` — тонкая обёртка над `getRouter()`. Вызов вне `<RootProvider>` больше не бросает `TustenError`.

## [0.2.0-beta.4] — 2026-11-12

### Added

- `resolveMeta`: динамический `<title>` из `readMethod` / `getMetaCallback` (`MetaResult.title`); приоритет — метод > `metaConfig.title` > `'Страница'`.
- `Service`: LRU-кэш (`cacheMaxEntries`, по умолчанию 500) и `cacheSize()` для тестов.

### Changed

- `Service` и `RpcError` экспортируются как есть, без префикса `Tusten`.

### Published

- `@tusten/core@0.2.0-beta.4` в npm (`beta` / `latest`).

## [0.2.0-beta.1] — 2026-11-11

### Added

- Публикация под именем **`@tusten/core`** (ранее пакет назывался `setti`).
- Три entry points: `@tusten/core` (client-safe), `@tusten/core/server` (Node), `@tusten/core/client` (React).
- SSR / SPA / prod build: `renderToPipeableStream` + `hydrateRoot`, per-route `ssr: false`, `?noSSR=true`, стриминг, CSS (Tailwind и per-component).
- Файловый роутинг `defineRoute`: `index`, `parentId`, `path` / `slug` (динамические сегменты), вложенные layouts, error boundary / loading / notFound.
- JSON-RPC 2.0: `defineObject`, `/service`, batch, Standard Schema (valibot / zod / arktype), `auth`, `ctx.call`, `System.Describe`, ALS executor для SSR.
- `defineServerRoutes` / `defineServerPlugins`, три реестра middleware.
- Слайсы: `AbstractSlice` / `Slice` / `SliceRegistry` (page + global), `useSlice` / `useStrictSlice` / `useSliceRef`, изоморфный `loadData`.
- SEO / meta: `metaConfig`, `readMethod`, `getMetaCallback`, `usePageMeta`, `microdata` (JSON-LD).
- `devalue` в `__ROOT_STATE_STR__` (`Map`, `Set`, `Date`, `BigInt`, `undefined`, `NaN`, циклы).
- Cross-page кэш `Service`: TTL, `invalidate()`, `<Link prefetch>`.
- Unit-тесты (Vitest), CI GitHub Actions (`format:check`, `lint`, `typecheck`, `test`), Prettier + ESLint.

### Added

- Первый коммит: структура монорепо (`..` + `examples/basic`), скаффолд клиента и сервера, базовая документация.

[Unreleased]: https://github.com/yartema/tusten-framework/compare/v0.2.0-beta.6...HEAD
[0.2.0-beta.6]: https://github.com/yartema/tusten-framework/compare/v0.2.0-beta.5...v0.2.0-beta.6
[0.2.0-beta.5]: https://github.com/yartema/tusten-framework/compare/v0.2.0-beta.4...v0.2.0-beta.5
[0.2.0-beta.4]: https://github.com/yartema/tusten-framework/compare/v0.2.0-beta.1...v0.2.0-beta.4
[0.2.0-beta.1]: https://github.com/yartema/tusten-framework/compare/v0.2.0-alpha.3...v0.2.0-beta.1
[0.2.0-alpha.3]: https://github.com/yartema/tusten-framework/compare/b07c3ae...v0.2.0-alpha.3
[0.1.0]: https://github.com/yartema/tusten-framework/commit/b07c3ae
