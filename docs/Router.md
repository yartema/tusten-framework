# Роутер в tusten — руководство пользователя

Клиентская навигация: `useNavigation()`, `<Link>`, `getRouter()`, prefetch и
`reload()`. Все примеры рассчитаны на прикладной код в `client/`.

> Краткая версия — раздел «Навигация» в корневом `README.md`.

В примерах импорты `react` и `@tusten/core/client` иногда опущены, чтобы не
загромождать код; хуки и `<Link>` импортируются оттуда.

## Содержание

- [Что умеет](#что-умеет)
- [Быстрый старт](#быстрый-старт)
- [`useNavigation()`](#usenavigation)
- [Чтение состояния](#чтение-состояния)
- [Программная навигация](#программная-навигация)
- [`<Link>`](#link)
- [Prefetch](#prefetch)
- [Обновление данных: `reload()`](#обновление-данных-reload)
- [Маршруты, params и query](#маршруты-params-и-query)
- [Каталог навигации: `getNavigation()`](#каталог-навигации-getnavigation)
- [Навигация вне React](#навигация-вне-react)
- [SSR, SPA и первая загрузка](#ssr-spa-и-первая-загрузка)
- [Ошибки и гонки](#ошибки-и-гонки)
- [Кэш `Service`](#кэш-service)
- [Заголовок и meta](#заголовок-и-meta)
- [Устаревшие хуки](#устаревшие-хуки)
- [Ограничения](#ограничения)
- [Частые ошибки](#частые-ошибки)
- [Чек-лист](#чек-лист)

## Что умеет

- `useNavigation()` — единый хук: `pathname`, `params`, `query`, `route` и
  методы `push` / `replace` / `back` / `prefetch` / `reload`.
- `<Link>` — SPA-ссылка с перехватом клика и опциональным prefetch по hover.
- `getRouter()` — те же методы без React-контекста: в обработчиках, сервисах,
  таймерах и JSON-RPC-колбэках.
- `nav.prefetch()` и `<Link prefetch>` греют кэш `Service` и чанки маршрута.
- `nav.reload()` перезапускает лоадеры текущего маршрута без перезагрузки
  браузера и без изменения URL/history.
- URL и history обновляются через `pushState` / `replaceState`; `back`
  обрабатывает `popstate` вместе с query-параметрами.
- Ошибки SPA-навигации показываются через `components.error`; в dev — ещё и
  оверлеем.

Маршруты и `loadData` выполняются на клиенте через `Service` (JSON-RPC), как и
при SSR. Server Actions и RSC не используются.

## Быстрый старт

```tsx
// client/HomePage/View.tsx
import { Link, useNavigation } from '@tusten/core/client'

export function View(): JSX.Element {
    const nav = useNavigation()

    return (
        <div>
            <p>Текущий путь: {nav.pathname}</p>

            <Link href="/about" prefetch className="nav-link">
                О проекте
            </Link>

            <button onClick={() => void nav.push('/blog/hello')}>Открыть блог</button>
            <button onClick={() => void nav.reload()}>Обновить данные</button>
        </div>
    )
}
```

`useNavigation()` работает в root controller, layouts и страницах — везде, где
есть React-контекст `<RootProvider>` (его создаёт client-entry).

## `useNavigation()`

```ts
import { useNavigation } from '@tusten/core/client'
```

```ts
interface TustenNavigation {
    // Состояние текущего маршрута
    pathname: string
    params: Record<string, string>
    query: Record<string, string>
    route: TustenClientRoute | null
    /** true, пока идёт переход (middleware + prefetch + commit). */
    pending: boolean

    // Действия
    push(path: string): Promise<void>
    replace(path: string): Promise<void>
    back(): void
    prefetch(path: string): Promise<void>
    reload(options?: RouterReloadOptions): Promise<void>
}
```

| Поле / метод       | Что делает                                                   |
| ------------------ | ------------------------------------------------------------ |
| `pathname`         | Текущий путь без query, например `/blog/hello`               |
| `params`           | Динамические сегменты маршрута, например `{ slug: 'hello' }` |
| `query`            | Query-параметры, например `{ tab: 'users' }`                 |
| `route`            | Публичный конфиг маршрута `TustenClientRoute` или `null`     |
| `pending`          | `true`, пока переход не закоммичен (данные + чанки)          |
| `push(path)`       | Перейти и добавить запись в history                          |
| `replace(path)`    | Перейти, заменив текущую запись history                      |
| `back()`           | Шаг назад по history                                         |
| `prefetch(path)`   | Прогреть данные и чанки маршрута без перехода                |
| `reload(options?)` | Перезапустить лоадеры текущего маршрута                      |

Хук реактивен: после `push` / `replace` / `back` компонент получит новые
`pathname`, `params`, `query` и `route`.

### Полоска загрузки и `pending`

Новое дерево рендерится в `startTransition`: пока грузятся данные, middleware и
чанки, старая страница остаётся на экране и полностью рабочая. `nav.pending`
(`useNavigationPending()`) становится `true` в начале перехода и снимается после
commit нового дерева. Слайсы старой страницы уничтожаются в этот же момент, а не
раньше.

Готовая полоска — `<NavigationProgress />`:

```tsx
import { NavigationProgress, type RootControllerProps } from '@tusten/core/client'

export function Root({ children }: RootControllerProps) {
    return (
        <div>
            <NavigationProgress />
            {children}
        </div>
    )
}
```

Пропсы: `color`, `height`, `delay` (не мигать на быстрых переходах), `zIndex`.
При SSR полоска отдаётся невидимой, поэтому hydration не расходится.

### `route`: что внутри

`nav.route` — JSON-safe проекция маршрута, одна и та же на сервере и клиенте.

```tsx
function RouteInfo(): JSX.Element | null {
    const route = useNavigation().route
    if (!route) return null

    return (
        <div>
            <p>id: {route.id}</p>
            <p>path: {route.path}</p>
            <p>title: {route.title}</p>
            <p>layouts: {route.layoutChain.join(' → ')}</p>
        </div>
    )
}
```

Поля `TustenClientRoute`: `id`, `path`, `title`, `description`, `parentId`,
`parentIds`, `index`, `slug`, `ssr`, `meta`, `metaConfig`, `contentConfig`,
`middleware`, `layoutChain`.

На 404 и для неизвестного маршрута `route === null`.

Если нужен только конфиг маршрута, можно использовать `useRoute()` — он
возвращает тот же `TustenClientRoute | null`.

## Чтение состояния

```tsx
function CurrentPage(): JSX.Element {
    const nav = useNavigation()

    return (
        <p>
            {nav.pathname} / {nav.params.id} / {nav.query.tab}
        </p>
    )
}
```

### Query-параметры

`nav.query` — обычный объект `Record<string, string>`. Значения всегда строки.
Повторяющиеся ключи в URL (`?tag=a&tag=b`) сейчас не поддерживаются: останется
последнее значение.

Чтобы изменить query, соберите новый URL и вызовите `push` / `replace`:

```tsx
function Tabs(): JSX.Element {
    const nav = useNavigation()

    const openTab = (tab: string): void => {
        const query = new URLSearchParams(nav.query)
        query.set('tab', tab)

        void nav.push(`${nav.pathname}?${query.toString()}`)
    }

    return <button onClick={() => openTab('users')}>Пользователи</button>
}
```

Удалить параметр:

```tsx
// внутри компонента, где уже объявлен `const nav = useNavigation()`
const query = new URLSearchParams(nav.query)
query.delete('tab')
const search = query.toString()

void nav.replace(`${nav.pathname}${search ? `?${search}` : ''}`)
```

Полный текущий URL с query:

```ts
const fullUrl = window.location.pathname + window.location.search
```

## Программная навигация

### `push`

Добавляет новую запись в history. Используйте для обычных переходов по клику,
кнопке, после успешной мутации.

```tsx
import { Service } from '@tusten/core'

const usersService = new Service()

function SaveButton(): JSX.Element {
    const nav = useNavigation()

    const save = async (): Promise<void> => {
        await usersService.call('Users.Update', { id: 1, name: 'Аня' })
        await nav.push('/users')
    }

    return <button onClick={() => void save()}>Сохранить</button>
}
```

`push` возвращает Promise, который завершается после попытки навигации. Это
удобно для индикатора загрузки:

```tsx
function AboutButton(): JSX.Element {
    const nav = useNavigation()
    const [pending, setPending] = useState(false)

    const go = async (): Promise<void> => {
        setPending(true)
        try {
            await nav.push('/about')
        } finally {
            setPending(false)
        }
    }

    return (
        <button onClick={() => void go()} disabled={pending}>
            {pending ? 'Загрузка…' : 'О проекте'}
        </button>
    )
}
```

### `replace`

Заменяет текущую запись history. Типичные случаи: редирект после логина, миграция
старого URL, закрытие модалки с параметром.

```tsx
await nav.replace('/dashboard')
```

### `back`

Вызывает `window.history.back()`. Возврат из `/about?tab=router` сохраняет
query-параметры: client-entry слушает `popstate` и передаёт `pathname + search`.

```tsx
<button onClick={() => nav.back()}>Назад</button>
```

### Неизвестный маршрут

Если `push(path)` не находит маршрут, выполняется обычная навигация документа:
страницу отдаст сервер (и его 404). Это не SPA-переход с `components.error`:

```tsx
void nav.push('/no-such-page') // полная загрузка → серверный 404
```

### Отмена и гонки

Если во время перехода пользователь кликнул ещё раз, побеждает последняя
операция. Устаревшая навигация не перезаписывает более свежую страницу.

## `<Link>`

```tsx
import { Link } from '@tusten/core/client'

export function Nav(): JSX.Element {
    return (
        <Link href="/about" prefetch className="nav-link">
            О проекте
        </Link>
    )
}
```

Пропсы:

| Проп        | Тип         | По умолчанию | Описание                              |
| ----------- | ----------- | ------------ | ------------------------------------- |
| `href`      | `string`    | —            | Целевой путь                          |
| `children`  | `ReactNode` | —            | Содержимое ссылки                     |
| `prefetch`  | `boolean`   | `false`      | Прогреть данные и чанки при наведении |
| `className` | `string`    | —            | CSS-класс                             |

`<Link>` рендерит обычный `<a href>` и:

- перехватывает левый клик без модификаторов и вызывает `push(href)`;
- не перехватывает `Ctrl` / `Cmd` / `Shift` / `Alt` — браузер откроет ссылку
  штатно (новая вкладка, новое окно и т.д.);
- не перехватывает клик, если кто-то уже вызвал `preventDefault()`;
- при `prefetch` на `mouseenter` вызывает `prefetch(href)`;
- выставляет `data-active="true"`, если `href` точно совпадает с текущим
  `pathname` (без query).

Активная ссылка:

```tsx
<Link href="/about" className="nav-link">
    О проекте
</Link>
```

```css
.nav-link[data-active='true'] {
    font-weight: 600;
}
```

Для вложенных разделов используйте `nav.pathname.startsWith('/admin')` и
собственный класс: `data-active` сравнивает путь целиком.

### Внешние ссылки, hash и скачивание

`<Link>` предназначен только для SPA-маршрутов. Для внешних URL, якорей и
файлов используйте обычный `<a>`:

```tsx
<a href="https://example.com" target="_blank" rel="noreferrer">
    Внешний сайт
</a>

<a href="#details">К деталям</a>

<a href="/files/report.pdf" download>
    Скачать отчёт
</a>
```

Причины:

- у `<Link>` нет `target`, `rel`, `download`, `aria-*`, `onClick` и других
  атрибутов `<a>`;
- hash не прокручивает страницу: роутер не управляет scroll;
- внешний URL технически уйдёт в полную навигацию, но потеряет нужные атрибуты.

Если нужен analytics-обработчик, навесьте его на обёртку — событие всплывёт от
ссылки, а переход выполнит `<Link>`:

```tsx
<span onClick={() => analytics.track('open-about')}>
    <Link href="/about">О проекте</Link>
</span>
```

## Prefetch

Prefetch греет две вещи:

1. чанки шаблона и layouts маршрута;
2. кэш `Service` для вызовов `loadData`.

Prefetch использует временный реестр: слайсы текущей страницы не подменяются, а
заготовки уничтожаются. При клике `clientPrefetch` отработает снова, но
HTTP-запросы возьмутся из кэша.

```tsx
<Link href="/blog/hello" prefetch>
    Открыть пост
</Link>
```

Вручную:

```tsx
// внутри компонента, где уже объявлен `const nav = useNavigation()`
<button onMouseEnter={() => void nav.prefetch('/blog/hello')}>Открыть пост</button>
```

`prefetch` — best-effort: ошибки (сеть, чанк) не блокируют клик и не показывают
страницу ошибки. Если prefetch не успел, обычная навигация просто загрузит данные
сама.

## Обновление данных: `reload()`

`nav.reload()` перезапускает лоадеры **текущего** маршрута. Это не
`window.location.reload()`: URL и history не меняются, SPA-сессия продолжается.

```tsx
await nav.reload()
```

По умолчанию:

- перезапускаются глобальные (`defineGlobalLoader`) и page-лоадеры;
- сбрасывается клиентский кэш `Service` (`Service.invalidateAll()`);
- локальный React-state страницы сохраняется (формы, открытые табы);
- root controller и layouts не перемонтируются;
- `document.title` обновляется как при навигации (с учётом `metaConfig`);
- meta-теги внутри компонента обновляет `usePageMeta()`;
- scroll не трогается.

### Опции

```ts
interface RouterReloadOptions {
    global?: boolean // по умолчанию true
    cache?: boolean // по умолчанию false — кэш сбрасывается
    remount?: boolean // по умолчанию false
    middleware?: boolean // по умолчанию true
}
```

| Опция        | По умолчанию | Что делает                                                          |
| ------------ | ------------ | ------------------------------------------------------------------- |
| `global`     | `true`       | Перезапускать глобальные лоадеры. `false` — только page-лоадеры     |
| `cache`      | `false`      | `false` — сбросить кэш `Service`; `true` — разрешить кэш            |
| `remount`    | `false`      | `true` — пересоздать шаблон страницы (локальный state сбрасывается) |
| `middleware` | `true`       | Прогнать клиентскую middleware-цепочку                              |

Примеры:

```tsx
await nav.reload({ global: false }) // только данные страницы
await nav.reload({ cache: true }) // быстрее, но данные могут быть из кэша
await nav.reload({ remount: true }) // как «настоящий refresh» страницы
await nav.reload({ middleware: false }) // без клиентской middleware
```

### `reload` и `listState.reload()`

Это разные вещи:

- `listState.reload()` — ваш собственный метод в state слайса, обновляет только
  его данные;
- `nav.reload()` — перезапускает все лоадеры маршрута (и глобальные по
  умолчанию), сбрасывает кэш `Service` и обновляет дерево.

Если нужно обновить одну таблицу — используйте метод слайса. Если «покажи
актуальные данные страницы» — `nav.reload()`.

Подробно про state, `setState`, хуки и жизненный цикл —
[`Slices.md`](Slices.md); про фабрики и `loadData` — [`Factories.md`](Factories.md).

### Индикатор загрузки

```tsx
function RefreshButton(): JSX.Element {
    const nav = useNavigation()
    const [reloading, setReloading] = useState(false)

    const refresh = async (): Promise<void> => {
        setReloading(true)
        try {
            await nav.reload()
        } catch (err) {
            console.error('[reload]', err)
        } finally {
            setReloading(false)
        }
    }

    return (
        <button onClick={() => void refresh()} disabled={reloading}>
            {reloading ? 'Обновляю…' : 'Обновить'}
        </button>
    )
}
```

Если клиентская middleware вернёт `redirect`, вместо обновления данных будет
обычный переход на новый адрес (`replace`). Отключить цепочку —
`middleware: false`.

### Ошибки

В отличие от навигации, ошибка `reload` **не заменяет** страницу на
`components.error`. Пользователь остаётся на текущей странице, ошибка уходит в
dev-оверлей/лог, Promise реджектится. Так «обновить данные» не выглядит как
«сломать страницу».

### 404 и до инициализации

- На 404 `reload()` — no-op: лоадеров нет.
- До инициализации client-entry `reload()` делает полную перезагрузку документа.

## Маршруты, params и query

### `path`

Абсолютный путь. Динамические сегменты начинаются с `:`.

```ts
// client/UserPage/router.ts
export default defineRoute([
    {
        id: 'user',
        path: '/users/:id',
        contentConfig: {
            workspaceConfig: { template: 'UserPage/view:View' },
            prefetchConfig: { configLoader: 'UserPage/Factories/Root' },
        },
    },
])
```

```tsx
// внутри компонента, где уже объявлен `const nav = useNavigation()`
nav.pathname // '/users/42'
nav.params.id // '42'
void nav.push('/users/43')
```

### `slug`

`slug` добавляет сегменты к цепочке `parentId → id`:

```ts
export default defineRoute([
    { id: 'blog', path: '/blog', contentConfig: {/* ... */} },
    {
        id: 'blogPost',
        parentId: 'blog',
        slug: [':slug'],
        contentConfig: {/* ... */},
    },
])
```

URL поста: `/blog/hello`, `nav.params.slug === 'hello'`.

`path` и `slug` взаимоисключающие: у маршрута может быть только один из них.

### Query

Query не является частью маршрута: `matchRoute` смотрит только на `pathname`.
Меняйте query через `push` / `replace` с новым URL.

```tsx
function StatusFilter(): JSX.Element {
    const nav = useNavigation()

    const filterBy = (status: string): void => {
        const query = new URLSearchParams(nav.query)
        query.set('status', status)
        void nav.push(`${nav.pathname}?${query.toString()}`)
    }

    return <button onClick={() => filterBy('active')}>Активные</button>
}
```

### Layouts

`route.layout` не влияет на навигацию, но входит в `nav.route.layoutChain`.
Layout задаётся в `defineRoute`, а не в `client.layouts`:

```ts
{ id: 'home', index: true, layout: 'layouts/Main' }
```

## Каталог навигации: `getNavigation()`

`getNavigation()` — это **не** «где я сейчас» (для этого `useNavigation()`), а
«какие пункты есть в приложении». Каталог собирается из маршрутов на сборке и
одинаков в SSR, SPA-навигации, гидрации и `reload()`.

### Участие маршрута

Пункт появляется только при явном объекте `navigation`:

```ts
// client/AboutPage/router.ts
export default defineRoute([
    {
        id: 'about',
        navigation: { title: 'О нас', icon: 'info', order: 20 },
        // ...
    },
])
```

Ключи (`title`, `icon`, `order`, `permission`) придумывает приложение — ядро их
не знает. Контракт ужесточается через module augmentation:

```ts
// client/types/navigation.d.ts
declare module '@tusten/core' {
    interface TustenRouteNavigation {
        title: string
        icon?: string
        order?: number
        permission?: string
    }
}
```

Значения должны быть JSON-safe: `navigation` попадает в `routesData` через
`JSON.stringify`, поэтому функция, `Date` или классовый инстанс — `TustenError`
на сборке.

### Что отдаёт ядро

```ts
interface TustenNavigationItem {
    id: string
    href?: string
    parentId?: string
    dynamic: boolean
    slug?: string[]
    // + все ключи из navigation
}
```

- `href` для статического маршрута — `route.path`; явный непустой
  `navigation.href` побеждает.
- У динамического маршрута (`/blog/:id`, regex-slug) дефолтного `href` нет —
  только явный `navigation.href`.
- `id`, `href`, `parentId`, `dynamic`, `slug` — зарезервированы: payload не
  может их подменить.
- Порядок — порядок объявления в `defineRoute([...])`. `order` — прикладной
  ключ, ядро не сортирует.

```ts
import { getNavigation } from '@tusten/core'

const items = getNavigation()
```

`getNavigation()` возвращает новый массив (сортировать/фильтровать на месте
можно), элементы заморожены. Пока каталог не засеян — `[]` (и один `console.warn`
в dev), поэтому вызывайте функцию в компоненте или обработчике, а не на верхнем
уровне модуля.

Для своего дерева маршрутов (тесты, `sitemap.xml`, серверный код) есть чистая
функция `buildNavigation(routes)`.

### Динамические пункты

Ядро не угадывает slug: пункт отдаётся с `dynamic: true` и без `href`.

```tsx
const items = getNavigation().map((item) =>
    item.dynamic && item.id === 'blog' ? { ...item, href: `/blog/${latestPost.slug}` } : item,
)
```

Пропустить динамику — `filter((item) => !item.dynamic)`.

### Права и фильтрация

Каталог возвращает **все** пункты — фильтр это прикладная логика:

```tsx
const permissions = useSlice(userSlice).state.permissions

const items = getNavigation().filter((item) => !item.permission || permissions.has(item.permission))
```

- Считайте в рендере, а не один раз при инициализации: после логина/логаута
  меню должно обновиться.
- SSR и первый клиентский рендер должны видеть одинаковые права, иначе
  hydration mismatch. Источник прав — глобальный loader (`__ROOT_STATE_STR__`).
- Скрытие пункта — UX, а не защита. Реальная проверка — `route.middleware` и
  `auth` у RPC-методов.
- Серверная фильтрация легальна: RPC-обработчик может вызвать `getNavigation()`,
  отфильтровать по `ctx`/`request` и вернуть готовый список.

`getNavigation()` импортируется из client-safe `@tusten/core`, поэтому один и
тот же вызов работает и в браузере, и в серверном JSON-RPC-обработчике:

```ts
// server/navigation/Navigation.meta.ts
import { defineObject } from '@tusten/core/server'
import { getNavigation } from '@tusten/core'

export default defineObject({
    name: 'Navigation',
    methods: {
        List: {
            auth: true,
            handler: async (_params, ctx) => {
                const permissions = await loadPermissions(ctx)
                return getNavigation().filter((item) => !item.permission || permissions.has(item.permission))
            },
        },
    },
})
```

Клиент получает список обычным `Service.call('Navigation.List')` — отдельного
транспорта для навигации нет.

`getNavigation()` не сортирует по `order`, не группирует, не переводит `title`,
не делает `isActive` и не ходит за данными — всё это приложение.

## Навигация вне React

```ts
import { getRouter } from '@tusten/core/client'

await getRouter().push('/login')
```

Подходит для обработчиков, сервисов, таймеров и колбэков JSON-RPC.

```ts
getRouter().replace('/session-expired')
getRouter().back()
await getRouter().reload()
```

Ограничения:

- вне React нет реактивных `pathname` / `params` / `query` / `route` — читайте
  `window.location` или берите данные из своего состояния;
- на сервере методы — no-op;
- до инициализации client-entry `push` / `replace` / `reload` делают полную
  перезагрузку документа, `prefetch` — no-op.

Для компонентов используйте `useNavigation()`.

## SSR, SPA и первая загрузка

- Первый запрос по умолчанию рендерится на сервере (SSR). `useNavigation()`
  получает начальные `pathname` / `params` / `query` / `route` из `<RootProvider>`.
- После гидратации клики по `<Link>` и вызовы `push` не перезагружают документ.
- `?noSSR=true` и `route.ssr: false` — SPA-режим: страница грузится на клиенте,
  `useNavigation()` работает после старта client-entry.
- Если `push` вызван до старта client-entry (например, очень ранний обработчик),
  сработает запасной навигатор с полной перезагрузкой.
- Серверная middleware при SPA-переходе не выполняется. Клиентская
  middleware-цепочка выполняется; если она вернула `redirect`, переход уйдёт на
  новый адрес.

## Ошибки и гонки

| Ситуация                                                 | Поведение                                               |
| -------------------------------------------------------- | ------------------------------------------------------- |
| `loadData` или чанк маршрута упали при `push` / `<Link>` | Рендерится `components.error` (в dev + оверлей)         |
| Ошибка клиентской middleware                             | Навигация останавливается, ошибка в консоль/dev-оверлей |
| Ошибка `prefetch`                                        | Игнорируется, клик загрузит данные сам                  |
| Ошибка `reload`                                          | Текущая страница остаётся, Promise реджектится          |
| Быстрые переходы / reload                                | Побеждает последняя операция, устаревшая отбрасывается  |
| Неизвестный `path` в `push`                              | Полная навигация документа → серверный 404              |

`push` / `replace` не пробрасывают ошибку загрузки страницы в Promise: ошибка уже
показана пользователю. Для индикатора ориентируйтесь на завершение Promise, а не
на `catch`. `reload` — наоборот, реджектится: его ошибку можно обработать.

## Кэш `Service`

`loadData` на клиенте вызывает `Service.call`. У `Service` есть TTL-кэш и LRU
(по умолчанию 500 записей).

- `<Link prefetch>` и `nav.prefetch()` заполняют кэш до клика.
- `push` / `replace` используют кэш; если данные устарели — инвалидируйте их
  вручную.
- `nav.reload()` по умолчанию сбрасывает **весь** клиентский кэш
  (`Service.invalidateAll()`), чтобы лоадеры действительно сходили за свежими
  данными.
- `nav.reload({ cache: true })` кэш не сбрасывает.

Точечная инвалидация:

```ts
import { Service } from '@tusten/core'

const usersService = new Service({ endpoint: 'Users' })

usersService.invalidate() // все методы Users.*
usersService.invalidate('List') // все вызовы Users.List
Service.invalidateAll() // весь клиентский кэш
```

`prefetch` не создаёт слайсы — только греет кэш и чанки. Поэтому после prefetch
страница всё равно проходит обычный клиентский prefetch, но без сетевых
задержек.

## Заголовок и meta

- При `push` / `replace` client-entry обновляет `document.title` из
  `route.title`, затем, если у маршрута есть `metaConfig`, асинхронно резолвит
  meta и может обновить title ещё раз.
- `usePageMeta()` — для динамического title/meta внутри компонента.
- `nav.route.title` — статический title из `metaConfig`; динамический title из
  `readMethod` живёт в `document.title`.
- Scroll при навигации не сбрасывается и не восстанавливается. Если нужен
  scroll-to-top:

```tsx
import { useEffect } from 'react'
import { useNavigation } from '@tusten/core/client'

function Page(): JSX.Element {
    const nav = useNavigation()

    useEffect(() => {
        window.scrollTo({ top: 0 })
    }, [nav.pathname])

    return <div>{/* ... */}</div>
}
```

## Устаревшие хуки

| Было            | Стало                                   |
| --------------- | --------------------------------------- |
| `useRouter()`   | `useNavigation()`                       |
| `usePathname()` | `nav.pathname`                          |
| `useParams()`   | `nav.params`                            |
| `useQuery()`    | `nav.query`                             |
| `useRoute()`    | `nav.route` (или оставить `useRoute()`) |
| `getRouter()`   | без изменений — для кода вне React      |

`useRouter()`, `usePathname()`, `useParams()` и `useQuery()` пока работают как
тонкие обёртки, но помечены `@deprecated`. Новый код пишите на
`useNavigation()`.

## Ограничения

- `useNavigation()` вне `<RootProvider>` не реактивен: `pathname` читается из
  `window.location`, `params` / `query` пустые, `route === null`.
- `<Link>` поддерживает только `href`, `children`, `prefetch`, `className`.
  Нет `target`, `rel`, `download`, `aria-*`, `onClick`.
- `<Link>` не управляет hash и scroll.
- `nav.query` — `Record<string, string>`; повторяющиеся query-ключи теряются.
- Нет отдельного API для «только query» — собирайте URL через
  `URLSearchParams` и вызывайте `push` / `replace`.
- SPA-навигация не выполняет серверную middleware.
- `nav.reload()` не меняет URL; для смены query используйте `push` / `replace`.

## Частые ошибки

| Симптом                                  | Причина / решение                                                                                           |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `<Link>` перезагружает всю страницу      | Не загрузился client-entry (полная загрузка — fallback) или ссылка внешняя/якорная                          |
| `push` не меняет страницу                | `push` до инициализации client-entry или маршрут не найден — проверьте `path` / `slug`                      |
| `nav.params` пустой                      | Динамический сегмент объявлен через `path: '/users/:id'` или `slug: [':id']`; проверьте, что URL совпал     |
| `nav.query.tab` не обновляется           | Query меняется только через новый URL (`push` / `replace`), прямая мутация объекта ничего не делает         |
| Данные после перехода старые             | TTL-кэш `Service`; инвалидируйте точечно или используйте `nav.reload()`                                     |
| `nav.reload()` не обновил данные         | Передан `cache: true` или лоадер не зависит от маршрута                                                     |
| `data-active` не работает                | `data-active` сравнивает `pathname` целиком; для вложенных путей используйте `nav.pathname.startsWith(...)` |
| `useNavigation()` показывает старый путь | Хук вызван вне `<RootProvider>` или страница не перерендерилась после внешнего изменения URL                |

## Чек-лист

- Для переходов в компонентах используйте `useNavigation()` и `<Link>`.
- Для внешних ссылок, якорей и файлов — обычный `<a>`.
- Динамические сегменты читайте из `nav.params`, query — из `nav.query`.
- Меняйте query через новый URL и `push` / `replace`.
- Добавляйте `prefetch` на ссылки, куда пользователь часто ходит.
- Для «обновить данные на странице» используйте `nav.reload()`, для одной
  таблицы — метод слайса.
- Помните: `reload` по умолчанию сбрасывает весь клиентский кэш `Service`.
- Вне React используйте `getRouter()`, но не ждите от него реактивного состояния.
- Проверяйте сценарии `back` с query и прямые заходы по URL.
