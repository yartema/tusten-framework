# Tusten Framework

> **Fullstack React framework** on **React 19** + **Fastify 5** + **Vite**.

[![npm beta](https://img.shields.io/npm/v/@tusten/core/beta.svg?label=npm%20beta&color=blue)](https://www.npmjs.com/package/@tusten/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/Node-%3E%3D20-339933.svg)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev)
[![Fastify](https://img.shields.io/badge/Fastify-5-000000.svg)](https://fastify.dev)
[![Vite](https://img.shields.io/badge/Vite-6%20%7C%208-646CFF.svg)](https://vitejs.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6.svg)](https://www.typescriptlang.org)

**tusten** — мета-фреймворк уровня Nuxt/Next, который собирается из трёх проверенных инструментов: React, Fastify, Vite. Устанавливается как зависимость, сканирует `client/`, строит карту маршрутов, поднимает сервер с SSR/SPA и JSON-RPC 2.0 — без магии, без RSC, без Server Actions.

> ⚠️ **Beta (`@tusten/core@0.2.0-beta.6`).**
>
> - Установка: `pnpm add @tusten/core@beta`
> - Импорт: `import { defineConfig } from '@tusten/core'`
> - Bin: `tusten dev`, `tusten build`, `tusten start`, `tusten inspect`
> - **API стабилизируется**, breaking changes — только в минорных версиях.
> - **Не для production** без тестов и ревью.
> - Что нового в beta.6 — настраиваемое имя cookie для i18n (`i18n.key`) и исправление чтения cookie на SSR: [`packages/tusten/CHANGELOG.md`](packages/tusten/CHANGELOG.md).
> - Следите за [Releases](https://github.com/yartema/tusten-framework/releases).

---

## ✨ Что внутри

- **SSR из коробки** — `renderToPipeableStream` + `hydrateRoot`, стриминг, единый React Context между сервером и клиентом.
- **SPA по требованию** — глобально (`ssr: false`), per-route (`route.ssr: false`) или через `?noSSR=true` для отладки.
- **Файловый роутинг** — `client/*/router.ts` → `defineRoute([...])`. Динамические сегменты через `slug: ['/regex:[a-z0-9-]+']` или `path: '/blog/:slug'`.
- **Вложенные layouts** — `route.layout` (строка/массив), наследование по `parentId`, замена/сброс цепочки; layout всегда опционален. `<Outlet/>` или `props.children` на выбор.
- **Root controller** — `client.root`: одна оболочка приложения на все страницы и состояния (SSR, loading, error, 404) с route/router/status и своим React-контекстом.
- **SEO / meta** — `metaConfig` на маршруте: статика (`title`, `meta[]`, `microdata`) + динамика через `readMethod` (JSON-RPC) или `getMetaCallback`. Плюс `usePageMeta` для компонента. JSON-LD из коробки.
- **i18n клиентских модулей** — `import rk from 'i18n!HomePage'`, словари `client/<Module>/lang/<locale>/<locale>.json`, `template()` с ICU-plural, `setLocale()` через cookie. SSR встраивает переводы в HTML — гидрация без mismatch.
- **JSON-RPC 2.0 из коробки** — `defineObject` в `server/**/*.meta.ts`, endpoint `/service`, batch, валидация через Standard Schema (valibot / zod / arktype), auth, `ctx.call`, `System.Describe`.
- **Три реестра middleware** — client-page, server-page, server-api. Не смешиваются, наследуются по `parentId`.
- **Слайсы** — собственный реактивный store (`Slice` / `AbstractSlice` / `SliceRegistry`). Page-scoped и global, `destroy()` / `isDestroyed()` при навигации, `_initState(result, config)` с сериализацией `config` в SSR-state, мерж `setState` для plain-объектов, атомарная подмена страницы через `adoptPage()`, `useSlice` / `useStrictSlice` / `useSliceRef`.
- **Навигация** — единый хук `useNavigation()` (`pathname` / `params` / `query` / `route` + `push` / `replace` / `back` / `prefetch` / `reload`); `getRouter()` доступен обработчикам, сервисам и таймерам вне React.
- **Cross-page кэш в `Service`** — TTL, `invalidate()`, LRU-эвикция (`cacheMaxEntries`, default 500), `<Link prefetch>` заполняет кэш по hover. Не на уровне страниц — на уровне вызовов.
- **`devalue` для сериализации** — `Map`, `Set`, `Date`, `BigInt`, `undefined`, `NaN`, циклы переживают SSR и восстанавливаются на клиенте.
- **Client-safe разделение** — три runtime-точки входа: `@tusten/core` (pure TS), `@tusten/core/server` (Node-only), `@tusten/core/client` (React), плюс types-only `@tusten/core/i18n` для `i18n!*`. `@tusten/core` не тянет jiti/fastify/vite.
- **Error boundaries / Loading / Not Found** — через `client.components`, с дефолтами `RootErrorBoundary` / `RootLoading` / `RootNotFound`.
- **Prod build** — `tusten build` → `dist/client` + `dist/server`. `tusten start` — Fastify + статика.
- **549 unit-тестов** (Vitest, 40 файлов, `tests/tusten`) — ядро покрыто на 90%+, CI на GitHub Actions.

---

## 🚀 Быстрый старт

### Из npm

```bash
mkdir my-app && cd my-app
pnpm init -y
pnpm add @tusten/core@beta react react-dom fastify vite @vitejs/plugin-react
pnpm add -D typescript @types/react @types/react-dom
```

Создайте `tusten.config.ts`:

```ts
import { defineConfig } from '@tusten/core'

export default defineConfig({
    ssr: true,
    client: {
        css: ['styles/main.css'],
    },
})
```

Создайте `client/HomePage/router.ts`, `client/HomePage/view.tsx`, `client/layouts/Main.tsx` (примеры ниже) и запустите:

```bash
pnpm exec tusten dev
# → http://127.0.0.1:3000
```

### Из монорепо (для разработки)

```bash
git clone https://github.com/yartema/tusten-framework.git
cd tusten-framework
pnpm install
pnpm dev:basic
```

Откройте **http://127.0.0.1:3000** — демо на Tailwind v4 с 4 страницами (Home / About / Blog / Admin), API, JSON-RPC, meta, i18n (ru/en) и вложенными layouts. На Windows используйте `127.0.0.1`, а не `localhost` (последний может резолвиться в `::1`).

**Другие команды:**

```bash
pnpm lint                                        # ESLint
pnpm typecheck                                   # tsc --noEmit
pnpm test                                        # Vitest (549 тестов, 40 файлов)
pnpm inspect:basic                               # dump маршрутов, RPC-методов и i18n-словарей
pnpm build:basic                                 # prod-сборка
pnpm start:basic                                 # prod-сервер
```

---

## 🧑‍💻 Как это выглядит

### Маршрут

```ts
// client/HomePage/router.ts
import { defineRoute } from '@tusten/core'

export default defineRoute([
    {
        id: 'home',
        index: true, // URL: /
        layout: 'layouts/Main', // путь до layout'а; можно не задавать
        middleware: [{ id: 'auth', handler: 'client/middleware/auth' }],
        metaConfig: {
            title: 'Главная',
            meta: [{ name: 'description', content: 'Home page' }],
        },
        contentConfig: {
            workspaceConfig: { template: 'HomePage/view:View' },
            prefetchConfig: {
                configLoader: 'HomePage/Factories/Root',
                dependencies: ['userInfo'], // глобальный loader
            },
        },
    },
])
```

**Динамический маршрут с meta из RPC:**

```ts
// client/BlogPage/router.ts
export default defineRoute([
    {
        id: 'blog',
        slug: ['/regex:[a-z0-9-]+'],
        layout: 'layouts/Main',
        metaConfig: {
            readMethod: 'Blogs.ReadMetaInfo', // вернёт { title, meta[], microdata }
            cache: 60_000,
            meta: [
                // статика мержится: [...static, ...fromMethod]
                { name: 'og:type', content: 'article', attribute: 'property' },
            ],
        },
        contentConfig: {/* ... */},
    },
])
```

### SEO / meta

Три уровня (по убыванию приоритета):

1. **`readMethod`** — путь до JSON-RPC метода (`'Blogs.ReadMetaInfo'`). Вызывается с полным URL. Возвращает `{ title?, meta?: MetaTag[], microdata?: object }`.
2. **`getMetaCallback`** — путь до функции `(metaConfig) => Promise<MetaResult>`. Вызывается, если `readMethod` не задан.
3. **Статика** в `metaConfig`: `title`, `meta: MetaTag[]`, `microdata`.

**Мерж статики и метода:**

- `meta` — конкатенация: `[...static, ...fromMethod]` (статика первая).
- `microdata` — shallow merge: `{ ...static, ...fromMethod }`.
- `title` — приоритет: `fromMethod.title` > `metaConfig.title` > `'Страница'`.

`MetaTag = { name: string; content: string; attribute?: 'name' | 'property' }` — для OG/Twitter указывайте `attribute: 'property'`.

**Серверный handler `readMethod`:**

```ts
// server/blogs/Blogs.meta.ts
import { defineObject } from '@tusten/core/server'
import * as v from 'valibot'

export default defineObject({
    name: 'Blogs',
    description: 'Блог',
    methods: {
        ReadMetaInfo: {
            description: 'Возвращает meta для поста',
            params: v.string(), // url
            handler: async (url) => {
                const slug = new URL(url).pathname.split('/').pop() ?? 'unknown'
                return {
                    title: `Post ${slug} — Blog`,
                    meta: [
                        { name: 'description', content: `Post ${slug}` },
                        { name: 'og:title', content: `Post ${slug}`, attribute: 'property' as const },
                    ],
                    microdata: {
                        '@context': 'https://schema.org',
                        '@type': 'BlogPosting',
                        headline: `Post ${slug}`,
                    },
                }
            },
        },
    },
})
```

**Клиентский `usePageMeta` (client-only, для динамики внутри компонента):**

```tsx
import { usePageMeta } from '@tusten/core/client'

export function View() {
    usePageMeta({
        title: 'Custom title',
        meta: [{ name: 'description', content: '...' }],
        microdata: { '@type': 'Article' },
    })
    return <div>...</div>
}
```

SSR — no-op (meta из `metaConfig` уже в `<head>`).

### Prefetch фабрик

```ts
// client/HomePage/Factories/Root.ts
import type { FactoryMap, TustenRouter } from '@tusten/core'

export default function getConfig(configParams: Record<string, unknown>, router: TustenRouter): FactoryMap {
    return {
        UserList: {
            dataFactoryName: 'HomePage/Factories/usersList:UserListLoader',
            dataFactoryArguments: { limit: 10 },
            dependencies: [],
        },
    }
}
```

### Слайс + изоморфный `loadData`

```ts
// client/HomePage/Factories/usersList.ts
import { Slice, Service, type FactoryImplementation } from '@tusten/core'

interface User {
    id: number
    name: string
}
interface UserListState {
    users: User[]
    total: number
    limit: number
    reload: () => void
}

const usersService = new Service({
    endpoint: 'Users',
    binding: { query: 'List' },
    cache: 30_000, // TTL
    cacheMaxEntries: 500, // LRU limit (default 500)
})

export class UserListSlice extends Slice<UserListState> {
    protected override _initState(result: unknown, config?: unknown): UserListState {
        const { users } = result as { users: User[] }
        // `config` — это `dataFactoryArguments` фабрики (`getConfig`).
        // Он сериализуется в __ROOT_STATE_STR__, поэтому при SSR-гидратации
        // `_initState` получит те же значения, что и на сервере.
        const { limit = 10 } = (config ?? {}) as { limit?: number }
        return {
            users,
            total: users.length,
            limit,
            reload: () => {
                /* создаётся заново и на сервере, и на клиенте */
            },
        }
    }
}

// `slice.setState({ total: 0 })` для plain-объектов мержит патч в текущий state:
// переданные ключи заменяются, остальные (`users`, `reload`) сохраняются.
// Для массивов, `Map`/`Date` и экземпляров классов `setState` заменяет значение.
// Если переопределяете `destroy()`, обязательно вызывайте `super.destroy()`.

export const UserListLoader: FactoryImplementation<UserListState> = {
    async loadData(args) {
        const limit = (args.limit as number) ?? 10
        const users = await usersService.query<{ limit: number }, User[]>({ limit })
        return { users }
    },
    slice: UserListSlice,
    // Необязательно: динамические args поверх `dataFactoryArguments`, изоморфно.
    // getDataFactoryArguments: async () => ({ limit: 20 }),
}
```

### Компонент

```tsx
// client/HomePage/view.tsx
import { useSlice, useNavigation, Link } from '@tusten/core/client'
import type { UserListSlice } from './Factories/usersList'

export function View() {
    const slice = useSlice<UserListSlice>('UserList')
    const state = slice?.state
    const nav = useNavigation()

    if (!state) return <div>Loading…</div>

    return (
        <div>
            <h1>HomePage ({nav.pathname})</h1>
            <p>Users: {state.total}</p>
            <Link href="/about" prefetch>
                → About (SPA, prefetch on hover)
            </Link>
        </div>
    )
}
```

### Обновление данных (SPA)

Все навигационные возможности собраны в одном хуке — `useNavigation()`:

```tsx
const nav = useNavigation()

nav.pathname // текущий путь
nav.params // динамические сегменты
nav.query // query-параметры
nav.route // конфиг маршрута (TustenClientRoute | null)

await nav.push('/about')
await nav.replace('/about')
await nav.reload()
```

`nav.reload()` перезапускает лоадеры текущего маршрута, **не перезагружая
браузер**: URL и history не меняются, root controller и layouts остаются
смонтированными.

```tsx
await nav.reload() // все лоадеры + свежие данные
await nav.reload({ global: false }) // только page-лоадеры
await nav.reload({ remount: true }) // перемонтировать страницу
```

`useRouter()`, `usePathname()`, `useParams()` и `useQuery()` остались как
deprecated-обёртки; `getRouter()` — для кода вне React.

Подробное руководство по навигации, `<Link>`, prefetch и `reload` —
[`docs/Router.md`](docs/Router.md).

| Опция        | По умолчанию | Что делает                                                             |
| ------------ | ------------ | ---------------------------------------------------------------------- |
| `global`     | `true`       | Перезапускает глобальные loader'ы (`defineGlobalLoader`)               |
| `cache`      | `false`      | `false` — сбрасывает клиентский кэш `Service`; `true` — разрешает кэш  |
| `remount`    | `false`      | `true` — новый `key` у шаблона страницы (локальный state сбрасывается) |
| `middleware` | `true`       | Прогоняет клиентскую middleware-цепочку                                |

Ошибка `reload` **не** заменяет страницу на `components.error`: пользователь
остаётся на текущей странице, ошибка уходит в dev-оверлей/лог, а Promise
реджектится. Если во время reload началась навигация — побеждает последняя
операция. До инициализации client-entry `reload()` делает полную перезагрузку.

### JSON-RPC-объект

```ts
// server/users/Users.meta.ts
import { defineObject } from '@tusten/core/server'
import type { RpcContext } from '@tusten/core/server'
import * as v from 'valibot'

export default defineObject({
    name: 'Users',
    description: 'Пользователи',
    methods: {
        List: {
            description: 'Список',
            params: v.object({ limit: v.optional(v.number()) }),
            handler: async (params, ctx) => {
                return ctx.db.users.findMany({ take: params.limit })
            },
        },
        Update: {
            auth: true,
            handler: async (params, ctx) => {
                const updated = await ctx.db.users.update(params)
                // ctx.stomp.message(...) — в разработке
                return updated
            },
        },
    },
})
```

### Конфиг

```ts
// tusten.config.ts
import { defineConfig } from '@tusten/core'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
    ssr: true,
    client: {
        root: {
            component: 'Page/Controller:Root',
            container: {
                tag: 'div',
                id: 'app',
                attributes: { class: 'theme-default', 'data-qa': 'main-container' },
            },
        },
        components: {
            error: 'shared/ErrorBoundary:ErrorBoundary',
            loading: 'shared/Loading:Loading',
            notFound: 'shared/NotFound:NotFound',
        },
        css: ['styles/main.css'],
    },
    server: {
        routes: 'server/api/routes.ts',
        plugins: 'server/plugins',
        rpc: { enabled: true, url: '/service' },
    },
    i18n: { key: 'lang', defaultLocale: 'ru', locales: ['ru', 'en'] },
    vite: { plugins: [tailwindcss()] },
})
```

Все пути в `client.*` (`components`, `root.component`, `root.container`, `css`) — относительно `clientDir`, без `./`: `Page/Controller:Root`, `layouts/Main`. Старый вид с `./` поддерживается и нормализуется при загрузке конфига.

`client.layouts` и `client.rootElement` **удалены**: если они есть в конфиге, загрузчик выведет предупреждение и проигнорирует их. Layout задаётся в `defineRoute`, контейнер — в `client.root.container`.

### i18n

Локализация клиентских модулей. Словари лежат рядом с модулем:

```
client/HomePage/lang/ru/ru.json   # основной язык — ключи (текст на исходном языке)
client/HomePage/lang/en/en.json
```

```ts
// tusten.config.ts
export default defineConfig({
    // key — имя cookie с выбранным языком; по умолчанию `lang`.
    i18n: { key: 'lang', defaultLocale: 'ru', locales: ['ru', 'en'] },
})
```

```tsx
import rk from 'i18n!HomePage'
import { template, getLocale, setLocale } from '@tusten/core/client'

rk('Помощь') // перевод из lang/<locale>/<locale>.json
rk('Помощь', 'Поддержка') // сначала ищется "Поддержка@@Помощь"
template(rk('Привет, {name}!'), { name }) // интерполяция
template(rk('{n, plural, one {# файл} few {# файла} other {# файлов}}'), { n })

getLocale() // текущая locale (string | undefined)
setLocale('en') // cookie (имя из `i18n.key`, по умолчанию `lang`) + перезагрузка страницы
```

- Нет словаря или ключа — возвращается исходный ключ, без ошибок. Битый JSON и нестроковое значение — ошибка сборки.
- `template()` — подмножество ICU: `{name}`, `plural` (`one` / `few` / `many` / `other`, `other` обязателен), точное `=N`, `#` → число. Экранирование — `\{`, `\}`, `\#`, `\\`.
- Locale: cookie `i18n.key` (по умолчанию `lang`) → `Accept-Language` (с учётом `q`, только из `locales`) → `defaultLocale`. На сервере locale хранится в `AsyncLocalStorage`, поэтому параллельные запросы не смешивают языки.
- Имя cookie валидируется при загрузке конфига (token по RFC 6265, обрезается по краям): пустая строка и недопустимые символы — `TustenError`. Миграция с beta.5: дефолт сменился с `tusten_locale` на `lang`; чтобы сохранить старое имя — `i18n: { key: 'tusten_locale', ... }`.
- SSR, SPA и 404 рендерят `<html lang="…">` с locale запроса; при выключенном i18n атрибут не выводится.
- Словари использованных модулей уходят в HTML вместе с SSR; при SPA-навигации догружаются отдельным чанком вместе с маршрутом.
- Синтаксис импорта — только `i18n!<Module>`; `i18n:<Module>` — внутренний virtual module. Типы подключаются через `@tusten/core/client` (или `@tusten/core/i18n`, если React не нужен).
- Тесты: в `vitest.config.ts` подключите `i18nTestPlugin()` из `@tusten/core/server` — `rk(key)` вернёт `key`.
- `tusten inspect` показывает модули, число ключей по locale и отсутствующие словари.

### Root controller

Компонент-оболочка приложения, которая рендерится **всегда**: SSR, гидрация, SPA-loading, ошибка и 404. Один раз на приложение — не нужно оборачивать каждый маршрут.

```ts
// tusten.config.ts
export default defineConfig({
    client: {
        root: {
            component: 'Page/Controller:Root',
            container: { tag: 'div', id: 'app' },
        },
    },
})
```

```tsx
// client/Page/Controller.tsx
import type { RootControllerProps } from '@tusten/core/client'

export function Root({ children, route, status }: RootControllerProps): JSX.Element {
    return (
        <AppProviders route={route}>
            <Header />
            {children}
            <Footer />
        </AppProviders>
    )
}
```

- Пропсы: `children` (layout chain или Loading/Error/NotFound), `route` (`TustenClientRoute | null`), `router`, `status` (`ready` / `loading` / `error` / `not-found`), `error`.
- `route` — одна и та же проекция на сервере и клиенте; для потомков есть `useRoute()`.
- `status` отражает состояние: initial SPA-prefetch (`loading`), ошибка навигации/prefetch (`error`), 404 (`not-found`).
- Корень не перемонтируется при SPA-навигации: контекст, тема и открытые меню живут. Страница перемонтируется при смене URL.
- Ошибки страницы рендерит `components.error` **внутри** корня; фатальные — dev-оверлей / prod-500.
- `route.layout` необязателен: без него маршрут наследует цепочку родителя (`parentId`) или рендерится без layout'ов. `client.layouts` больше нет — layout объявляется в `defineRoute`.
- `RootErrorBoundary` сбрасывает пойманную ошибку при навигации (`resetKey`).

### Layouts

Layout — это часть маршрута, как `template`. Глобального реестра `client.layouts` нет.

```ts
// client/HomePage/router.ts
export default defineRoute([{ id: 'home', index: true, layout: 'layouts/Main' /* ... */ }])
```

Семантика `route.layout`:

| Значение                            | Результат                                                     |
| ----------------------------------- | ------------------------------------------------------------- |
| `undefined`                         | наследуется цепочка родителя (`parentId`); у корневого — `[]` |
| `'layouts/Main'`                    | только этот layout (заменяет унаследованную цепочку)          |
| `['layouts/Main', 'layouts/Admin']` | явная вложенность root → leaf                                 |
| `false` или `[]`                    | без layout'ов (в том числе сброс унаследованного)             |

- Спека — путь относительно `clientDir` в формате `<file>:<export>` или `<file>` для default-export: `Page/Layout:Main`, `layouts/Main`.
- Общие layout'ы удобно держать в TS-константах (`export const MAIN_LAYOUT = 'layouts/Main'`), а не в конфиге.
- Дубликаты подряд удаляются: `['layouts/Main', 'layouts/Main']` → `['layouts/Main']`.

### Контейнер приложения

По умолчанию SSR отдаёт `<div id="root" data-tusten-root>`. Тег, id и атрибуты настраиваются в `client.root.container`:

```ts
// tusten.config.ts
export default defineConfig({
    client: {
        root: {
            container: {
                tag: 'app-root', // вместо div; можно любой обычный/custom-тег
                id: 'app', // по умолчанию 'root'; false — без id
                attributes: { class: 'app-shell', 'data-theme': 'light' },
            },
        },
    },
})
```

- `data-tusten-root` — служебный маркер: по нему клиент находит контейнер, поэтому менять `id` и `tag` безопасно.
- `attributes` принимает строки, числа и `true` (boolean-атрибут, например `hidden`). `false`/`undefined` пропускаются, `on*` запрещены — это статичный HTML, не обработчики.
- `id: false` убирает id; клиент всё равно найдёт контейнер по `data-tusten-root`.
- Совсем без элемента нельзя: React нужен контейнер для `hydrateRoot`/`createRoot`, а boot-скрипты живут в `<body>`. Но `tag: 'app-root'`/`section`/custom element убирает лишний `div`.

### Ошибки в браузере (dev)

В dev ошибка не теряется в консоли:

- **Падение SSR** — отдельная страница с описанием, стеком и code frame. Стек маппится по sourcemap (`vite.ssrFixStacktrace`), поэтому в кадрах исходные `.tsx`, а не результат трансформации; клик по кадру открывает файл в редакторе.
- **Ошибка после отправки shell** (стриминг) — ошибки собираются в HTML (`window.__TUSTEN_SSR_ERRORS__`) и показываются оверлеем поверх частично отрендеренной страницы.
- **Клиент** — оверлей с описанием, стеком, кнопкой «Скопировать» и переходом в редактор: гидрация, SPA-навигация, initial prefetch и ошибки, пойманные `RootErrorBoundary` (наличие fallback не скрывает баг).
- **SPA-навигация больше не «молчит»**: если `loadData` или чанк маршрута упали, рендерится `components.error`, а в dev дополнительно поднимается оверлей.

Оверлей — отдельная точка входа `@tusten/core/client/dev-overlay`: клиентский entry импортирует её только внутри `if (import.meta.env.DEV)`, поэтому в production-бандл её код не попадает.

В production:

- 500-страница без стека и путей, с коротким «Кодом ошибки»;
- тот же код пишется в лог — `[tusten] SSR error [1a2b3c4d]: …` — по нему находится конкретный запрос;
- фатальный сбой клиента в SPA (без SSR) показывает «Не удалось загрузить страницу. Обновите её» вместо пустого экрана.

---

## 🏗 Архитектура

```
┌─────────────────────── Браузер ───────────────────────┐
│                                                        │
│  client/*/router.ts ──► defineRoute([...])             │
│  client/*/Factories ──► getConfig → Service            │
│  client/*/view.tsx ───► useSlice / useNavigation / <Link>  │
│                         usePageMeta                    │
│                                                        │
└─────────────────┬──────────────────────────────────────┘
                  │ HTTP / WebSocket
                  ▼
┌────────────────── Fastify ────────────────────────────┐
│                                                        │
│  POST /service        ← JSON-RPC 2.0 (defineObject)    │
│  GET  /stomp          ← WebSocket (в планах)          │
│  GET  /api/*          ← defineServerRoutes            │
│  GET  /*              ← SSR / SPA HTML + meta         │
│                                                        │
│  ── при SSR: Service.call идёт через ALS executor ──   │
│     (прямой вызов handler'а из реестра, без HTTP)      │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**Ключевые архитектурные решения:**

- **`loadData` изоморфный** — работает на сервере и клиенте, только `fetch('/api/...')` или `Service.call(...)`. Никаких прямых обращений к БД, никаких Server Actions.
- **JSON-RPC для чтения и мутаций** — единый протокол, типизация через Standard Schema, `ctx.call` для композиции методов.
- **`metaConfig` + `resolveMeta`** — meta резолвится **параллельно** с prefetch (`Promise.all`), поэтому SSR latency = max(prefetch, meta), не сумма.
- **SPA-переход атомарный** — page-слайсы новой страницы прогреваются в отдельном `SliceRegistry` и подменяют старые (`adoptPage`) только после успешных `loadData` + загрузки шаблона. Ошибка → остаёмся на текущей странице с живыми слайсами; global-слайсы переживают переход.
- **i18n на SSR** — locale определяется по cookie / `Accept-Language`, словари реально использованных модулей встраиваются в HTML до `hydrateRoot`; `Vary: Accept-Language, Cookie` не даёт кэшу смешать языки.
- **Безопасные SSR-ответы** — `Cache-Control: no-store` на HTML, JSON-404 и редиректах; `Vary` учитывает `Accept` для контент-негоциации.
- **Быстрая доставка** — `modulepreload` для `client.js`, чанка маршрута и слайсов; независимые фабрики, layout и Error-компонент грузятся параллельно.
- **`ctx.stomp.message(key, payload)`** — real-time push (в разработке).
- **Три реестра middleware** — не смешиваются, каждый со своим контекстом.
- **`@tusten/core` / `@tusten/core/server` / `@tusten/core/client`** — client-safe разделение, `@tusten/core` не тянет Node.
- **497 unit-тестов** (Vitest, 32 файла) — ядро покрыто на 90%+.

---

## 📂 Структура репозитория

```
tusten-framework/
├── packages/
│   └── tusten/                  # пакет @tusten/core
│       ├── src/
│       │   ├── index.ts         # @tusten/core (client-safe)
│       │   ├── server.ts        # @tusten/core/server (Node-only)
│       │   ├── client/          # @tusten/core/client (React, slices, hooks, i18n)
│       │   ├── shared/          # prefetch, meta-resolver, locale (изоморфный)
│       │   ├── server/          # Fastify, SSR, RPC, i18n (ALS)
│       │   ├── build/           # build pipeline
│       │   └── vite/            # Vite-плагин (virtual modules)
│       ├── types/               # ambient-типы i18n!*
│       ├── scripts/             # postbuild (d.ts для i18n)
│       ├── CHANGELOG.md         # история изменений (источник истины)
│       └── README.md            # генерируется из корневого (prepack)
│
├── examples/
│   └── basic/                   # демо на Tailwind v4
│       ├── client/              # Home / About / Blog / Admin, i18n (ru/en)
│       ├── server/              # API + JSON-RPC meta
│       └── tusten.config.ts
```

**Документация фреймворка** — [`README.md`](README.md) (этот файл). Там всё: API, схемы, подводные камни, roadmap.

---

## 🗺 Roadmap

### ✅ Готово

- **Phase 1** — SSR, SPA, prod build, CSS (Tailwind / per-component), enriched `_initState`
- **Phase 2** — `defineServerRoutes`, `defineServerPlugins`, 3 реестра middleware, `useRouter` / `<Link>`, JSON-RPC 2.0 (`/service`), `Service` с ALS executor
- **Phase 3** — динамические сегменты (`slug` / `path`), вложенные layouts по `parentId`, per-route `ssr: false`, error boundaries / loading / notFound
- **Phase 4** — `System.Describe`, рекурсивный CSS-scan, `devalue` (`Map` / `Date` / cyclic), cross-page кэш в `Service` (LRU, `cacheMaxEntries`)
- **Phase 5** — 425 unit-тестов (Vitest), GitHub Actions CI (`format:check` + `lint` + `typecheck` + `test`), Prettier + ESLint, публикация `@tusten/core@0.2.0-beta.4` в npm
- **Phase 6** — SEO / meta: `metaConfig` (статика), `readMethod` (JSON-RPC), `getMetaCallback` (функция), `usePageMeta` (client), `microdata` (JSON-LD), `resolveMeta` (SSR, параллельно с prefetch)
- **Phase 7** — i18n клиентских модулей (`i18n!<Module>`, словари по locale, `template()` с ICU-plural, SSR-гидрация без mismatch, locale в ALS) и доработка слайсов по мотивам DataEnv (`destroy` / `isDestroyed`, `_initState(result, config)`, сериализация `config`, мерж `setState`, `getDataFactoryArguments`, атомарный `adoptPage`), публикация `@tusten/core@0.2.0-beta.5` в npm

### 🚧 В разработке

- **STOMP-слой** — `ctx.stomp.message(key, payload)` + `useStomp(key, fn)` + автопереподключение (дизайн готов)

### 📋 Запланировано

- `create-tusten-app` — CLI-скаффолдер (`pnpm dlx create-tusten-app my-app`)
- Пресеты (`defineConfig({ preset: 'tailwind' })`)
- Сайт документации (сам tusten на tusten)
- `tusten i18n extract` — скан `rk(...)` через TS AST и типизированные ключи
- `sliceExtraValues` / `loaderExtraValues` — реактивные связи между слайсами (DataEnv, P2)
- Тесты для `ssr-handler.ts`, `create-server.ts`, `vite/plugin.ts` (Vite mock + `inject`)
- Redis-adapter для STOMP (PM2 / cluster)
- Auto-invalidate при мутациях (`create`/`update`/`destroy` → сброс `List`)
- `@fastify/rate-limit` на `/service` + CSRF-защита
- Мемоизация `useParams` / `useQuery`
- `<Link prefetch>` — `onTouchStart` для мобильных
- `<link rel="canonical">` и `alternates` в `metaConfig`
- Множественные `<meta>` с одинаковым `name` (Open Graph galleries)

### ❌ Не планируется

- **React Server Components** — осознанно. Другая архитектура, месяцы работы, ломает `Slice` / `loadData` / `defineObject`.
- **Server Actions** — осознанно. JSON-RPC + `Service.call` покрывает мутации.

---

## 🛠 Разработка

```bash
# Установка
pnpm install

# Проверки
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test

# Dev-сервер демо
pnpm dev:basic
TUSTEN_DEBUG=1 pnpm dev:basic      # + логи __ROOT_STATE_STR__

# Prod
pnpm build:basic
pnpm start:basic

# Дамп маршрутов и RPC-методов
pnpm inspect:basic

# Публикация
pnpm publish:alpha
pnpm publish:beta
pnpm publish:latest
```

### Требования

- **Node.js** ≥ 20
- **pnpm** ≥ 9 (через `corepack enable`)

### Стиль кода

- Весь код документирован JSDoc (`@param`, `@returns`, `@throws`).
- Framework `.tsx` — через `createElement`, не JSX (иначе jiti ломает classic runtime).
- User `.tsx` — обычный JSX через Vite.
- Не-тривиальная логика — inline-комментарии (почему, а не что).

### Подводные камни (для контрибьюторов)

Перед правкой `vite/plugin.ts` или `server/ssr-handler.ts` прочитайте раздел «Подводные камни» ниже. Особенно:

- `RootProvider` / `SliceRegistry` / `devalueParse` — **только** через `vite.ssrLoadModule` (dev) / `dist/server/entry.js` (prod).
- `@tusten/core` не должен тянуть Node-зависимости.
- После правок `plugin.ts` / `serialize.ts` — **всегда** `rm -rf examples/basic/node_modules/.vite`.
- Всё, что `create-server.ts` передаёт в Vite-плагин, должен передавать и `build-client.ts` / `build-server.ts` (иначе dev ≠ prod).
- Windows: `import(absolutePath)` требует `pathToFileURL()` — иначе `ERR_UNSUPPORTED_ESM_URL_SCHEME`.
- Тесты: мутации слайса (`slice.setState`, `registry.setPage`) после `render()` — только в `act()`.
- `resolveMeta` резолвится **параллельно** с `runPagePrefetch` (`Promise.all`) — не переделывать в sequential, это удвоит SSR latency.
- `getMetaCallback`-пути должны быть добавлены в `specToPath`/`allSsrSpecs` в Vite-плагине, иначе `resolveModule` их не найдёт.
- i18n-модули (`i18n!<Module>`, `i18n:<Module>`, `i18n-dict:*`) — только virtual modules Vite-плагина. В серверном коде и через jiti их импортировать нельзя.
- Locale SSR-запроса — только `AsyncLocalStorage`; глобальная переменная смешает языки параллельных запросов.
- `Vary: Accept-Language, Cookie` на SSR-ответах обязателен при включённом i18n, иначе кэш отдаст чужой язык.
- Пути модулей канонизируются через `realpathSync.native` (`resolveRealPath`): на Windows/macOS иначе HMR не видит правку при другом регистре в спеке (`'HomePage/view'` ↔ `View.tsx`).

---

## ❓ Зачем ещё один фреймворк

Потому что:

1. **Next.js тянет RSC и Server Actions** — мощно, но сложно. Если они не нужны, платите за них bundle size, когнитивной нагрузкой и временем сборки.
2. **Nuxt — Vue.** Отличный, но если вы на React — не подходит.
3. **Astro — контент-фреймворк.** Для дашбордов и админок неудобен.
4. **React Router 7 / Remix** — ментальная модель другая (loader'ы в route-модулях, actions, form-first). Не всем подходит.

**tusten** — для тех, кому нужен:

- **React 19 + Fastify + Vite** — три понятных инструмента, без магии.
- **JSON-RPC вместо REST** — типизированный, валидируемый, batch-friendly.
- **Изоморфный `loadData`** — один код на сервере и клиенте, только `fetch('/api/...')`.
- **`Slice` вместо Redux/Zustand** — встроенный, per-route, auto-destroy.
- **Client-safe разделение** — `@tusten/core` (pure), `@tusten/core/server` (Node), `@tusten/core/client` (React). Явно, без сюрпризов.
- **Контроль** — не «чёрный ящик», а ~8 000 строк читаемого TypeScript (ядро + тесты).

Если узнали себя — попробуйте демо.

---

## 🧪 Стабильность API

Фреймворк в статусе **beta**. Это значит:

### Что может измениться без предупреждения

- **Публичный API** — сигнатуры `defineRoute`, `defineGlobalLoader`, `defineObject`, `Service`, `Slice`, хуков (`useSlice`, `useNavigation`, `usePageMeta`), i18n (`rk`, `template`, `getLocale`, `setLocale`).
- **Формат конфига** (`tusten.config.ts`) — поля могут переименовываться, получать новые опции, менять дефолты; `i18n` тоже входит сюда.
- **Схема маршрута** (`TustenRoute`) — `path`, `slug`, `ssr`, `middleware`, `metaConfig`, `contentConfig` и т.д.
- **JSON-RPC** — wire-протокол, формат `System.Describe`, коды ошибок.
- **Meta**: `MetaTag`, `MetaResult`, `MetaConfig`, `PageMeta` — форма может расширяться.
- **Внутренние детали**, которые просачиваются наружу: `__ROOT_STATE_STR__`, `__ROOT_MIDDLEWARE__`, `__ROOT_I18N__`, `virtual:tusten/*`, `i18n:*` / `i18n-dict:*`, `dist/server/entry.js`.
- **Поведение** — например, дефолтный `cacheMaxEntries` в `Service` может измениться.

### Что стабилизируется раньше

- **`defineConfig`** — базовая структура (`ssr`, `client`, `server`) может изменится.
- **`defineRoute`** — структура маршрута (id, parentId, type, metaConfig) — фундаментальная.
- **`Slice` / `AbstractSlice`** — `hydrate(result, config)`, `state`, `setState`, `subscribe`, `destroy` — ядро реактивности.
- **`loadData(args, deps, ctx)`** — сигнатура.
- **`MetaTag`** — `{ name, content, attribute? }`.
- **i18n-контракт** — `rk(key, ctx?)` → `string`, `template(str, params, locale?)` → `string`, словари `lang/<locale>/<locale>.json`.

### Философия версионирования

- **`0.x.y` (alpha / beta)** — API стабилизируется, breaking changes возможны в минорных версиях, но редко.
- **`0.x.0`** — обязательно breaking changes (например, `0.2.0` → `0.3.0`).
- **`0.x.y` (patch)** — багфиксы, без breaking.
- **`1.0.0`** — первый стабильный релиз. После — semver: breaking changes только в мажорных версиях.

### Как отслеживать

- **GitHub Releases** — каждое изменение, помеченное `BREAKING` или `feat`.
- **[`packages/tusten/CHANGELOG.md`](packages/tusten/CHANGELOG.md)** — полная история изменений (Keep a Changelog + SemVer).
- **[`README.md`](README.md)** — актуальная документация.

### Если вы уже используете tusten

- **Читайте Release Notes** перед `pnpm update @tusten/core`.
- **Фиксируйте точную версию** в проде — `pnpm add @tusten/core@0.2.0-beta.6` (не `@beta`).
- **Пишите обёртки** над публичным API — если сигнатура изменится, поправите в одном месте.
- **Сообщайте о проблемах** — [Issues](https://github.com/yartema/tusten-framework/issues) помогают стабилизировать API раньше.

---

## 📄 Лицензия

[MIT](LICENSE) © 2026 yartema

---

## 🙏 Благодарности

- [React](https://react.dev) — UI, `renderToPipeableStream`, `hydrateRoot`
- [Fastify](https://fastify.dev) — HTTP-сервер
- [Vite](https://vitejs.dev) — сборщик и dev-сервер
- [devalue](https://github.com/Rich-Harris/devalue) — сериализация богатых типов
- [jiti](https://github.com/unjs/jiti) — загрузка `.ts` без сборки
- [Valibot](https://valibot.dev) — Standard Schema валидация (в демо)
