# Фабрики данных в tusten — руководство пользователя

Фабрика — это описание загрузчика: что вызвать (`loadData`), с какими
аргументами и какой класс слайса создать. Из фабрик складывается состояние
страницы и глобальное состояние приложения.

> Про слайсы — [`Slices.md`](Slices.md). Краткая версия — раздел «Данные» в
> корневом `README.md`.

## Содержание

- [Что умеет](#что-умеет)
- [Быстрый старт](#быстрый-старт)
- [Два вида фабрик](#два-вида-фабрик)
- [`FactoryMap` и `FactoryDef`](#factorymap-и-factorydef)
- [`FactoryImplementation`](#factoryimplementation)
- [`getConfig` страницы](#getconfig-страницы)
- [Глобальные фабрики](#глобальные-фабрики)
- [Три источника аргументов](#три-источника-аргументов)
- [Зависимости](#зависимости)
- [Путь до модуля фабрики](#путь-до-модуля-фабрики)
- [`loadData`: контракт](#loaddata-контракт)
- [`Service`: изоморфный RPC](#service-изоморфный-rpc)
- [SSR, SPA и гидратация](#ssr-spa-и-гидратация)
- [Рецепты](#рецепты)
- [Частые ошибки](#частые-ошибки)
- [Справочник API](#справочник-api)
- [Чек-лист](#чек-лист)

## Что умеет

- **Page-scoped фабрики** — данные конкретной страницы. Задаются в
  `route.contentConfig.prefetchConfig.configLoader` и возвращаются из
  `getConfig`.
- **Global-scoped фабрики** — данные, общие для приложения (текущий
  пользователь, настройки). Задаются в `*.loader.ts` через
  `defineGlobalLoader`.
- **Зависимости** между фабриками: граф, топологическая сортировка,
  параллельное выполнение независимых веток.
- **Три источника аргументов**: `configParams` (только для `getConfig`),
  `dataFactoryArguments` (статические аргументы фабрики) и
  `getDataFactoryArguments()` (динамические).
- **Изоморфность**: один и тот же `loadData` выполняется на SSR и на клиенте.
  На сервере `Service` ходит в JSON-RPC executor напрямую, в браузере — через
  `POST /service`.
- **SSR без повторной загрузки**: результат `loadData` и аргументы фабрики
  уезжают в `__ROOT_STATE_STR__`, клиент восстанавливает слайсы при гидратации.

## Быстрый старт

Минимальная страница с одной фабрикой:

```ts
// client/HomePage/router.ts
import { defineRoute } from '@tusten/core'

export default defineRoute([
    {
        id: 'home',
        index: true,
        contentConfig: {
            workspaceConfig: { template: 'HomePage/view:View' },
            prefetchConfig: {
                configLoader: 'HomePage/Factories/Root',
            },
        },
    },
])
```

```ts
// client/HomePage/Factories/Root.ts
import type { FactoryMap } from '@tusten/core'

export default function getConfig(): FactoryMap {
    return {
        UserList: {
            dataFactoryName: 'HomePage/Factories/usersList:UserListLoader',
            dataFactoryArguments: { limit: 10 },
        },
    }
}
```

```ts
// client/HomePage/Factories/usersList.ts
import { Slice, Service, type FactoryImplementation } from '@tusten/core'

/** Элемент списка. */
interface User {
    id: number
    name: string
}

/** Состояние слайса. */
interface UserListState {
    users: User[]
}

const usersService = new Service({
    endpoint: 'Users',
    binding: { query: 'List' },
    cache: 30_000,
})

/** Класс слайса. */
export class UserListSlice extends Slice<UserListState> {}

/** Фабрика: имя экспорта должно совпадать с `dataFactoryName`. */
export const UserListLoader: FactoryImplementation<UserListState> = {
    async loadData(args) {
        const limit = (args.limit as number | undefined) ?? 10
        const users = await usersService.query<{ limit: number }, User[]>({ limit })
        return { users }
    },
    slice: UserListSlice,
}
```

```tsx
// client/HomePage/view.tsx
import { useSlice } from '@tusten/core/client'
import type { UserListSlice } from './Factories/usersList'

export function View() {
    const list = useSlice<UserListSlice>('UserList')
    const state = list?.state

    if (!state) return <div>Загрузка…</div>
    return (
        <ul>
            {state.users.map((user) => (
                <li key={user.id}>{user.name}</li>
            ))}
        </ul>
    )
}
```

Ключ слайса (`'UserList'`) — это **ключ в `FactoryMap`**, а не имя класса и не
имя модуля. Именно по нему слайс лежит в реестре и читается хуками.

## Два вида фабрик

|                                 | Page-scoped                                          | Global-scoped                                                                        |
| ------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Где объявляется                 | `route.contentConfig.prefetchConfig.configLoader`    | `client/**/*.loader.ts`                                                              |
| Что возвращает                  | `getConfig(configParams, router): FactoryMap`        | `defineGlobalLoader(map)`                                                            |
| Ключ слайса                     | ключ `FactoryMap`                                    | ключ `FactoryMap`                                                                    |
| Когда грузится                  | при загрузке страницы                                | когда маршрут указал её в `prefetchConfig.dependencies` (или она пришла транзитивно) |
| Живёт                           | до конца текущей страницы (SPA: до commit следующей) | до полной перезагрузки / `reload({ global: true })`                                  |
| Попадает в `__ROOT_STATE_STR__` | да, `scope: 'page'`                                  | да, `scope: 'global'`                                                                |

Один и тот же ключ **нельзя** объявить и на странице, и глобально — это
ошибка `A3 violation` (см. [Частые ошибки](#частые-ошибки)).

## `FactoryMap` и `FactoryDef`

`FactoryMap` — обычный объект `имя → описание`:

```ts
interface FactoryDef {
    /** Модуль фабрики: 'путь/от/clientDir:Экспорт' или 'путь' (default). */
    dataFactoryName: string
    /** Статические аргументы: уходят в loadData и в _initState(result, config). */
    dataFactoryArguments?: Record<string, unknown>
    /** Имена других фабрик, от которых зависит эта. */
    dependencies?: string[]
}
```

- Имя ключа — публичное: по нему вы читаете слайс (`useSlice('UserList')`).
- `dataFactoryArguments` должны быть **JSON-safe**: `Map`, `Date`, функции и
  экземпляры классов не переживут `JSON.stringify` клиентского бандла.
- `dependencies` — массив имён, а не спек. Имена разрешаются в том же
  `FactoryMap`, в глобальном реестре или в `prefetchConfig.dependencies`.

## `FactoryImplementation`

То, что экспортируется из модуля `dataFactoryName`:

```ts
interface FactoryImplementation<TState> {
    loadData(
        args: Record<string, unknown>,
        deps: Record<string, unknown>,
        ctx: Record<string, unknown>,
    ): Promise<unknown>

    slice: new () => Slice<TState>

    getDataFactoryArguments?(): Promise<Record<string, unknown>>
}
```

- `args` — `dataFactoryArguments`, поверх которых смержены результаты
  `getDataFactoryArguments()`.
- `deps` — **результаты `loadData` зависимостей**, а не их `slice.state`.
  Например, если зависимость вернула `{ users }`, в `deps.имя` будет
  `{ users }`.
- `ctx` — сейчас всегда `{ router }`; `router` содержит `id`, `path`,
  `params`, `query` и `request` (на сервере — `FastifyRequest`, на клиенте —
  `null`).
- `slice` — конструктор класса без аргументов. Ядро само создаёт экземпляр и
  вызывает `hydrate(result, config)`.
- `getDataFactoryArguments()` не принимает аргументов. Он выполняется и на
  сервере, и на клиенте; возвращённые значения **не** попадают в сериализуемый
  `config`.

Имя экспорта в модуле должно совпадать с `dataFactoryName` после двоеточия. Если
двоеточия нет, берётся `default`.

## `getConfig` страницы

```ts
// client/BlogPage/Factories/Root.ts
import type { FactoryMap, TustenRouter } from '@tusten/core'

export default function getConfig(configParams: Record<string, unknown>, router: TustenRouter): FactoryMap {
    return {
        BlogPost: {
            dataFactoryName: 'BlogPage/Factories/blogPost:BlogPostLoader',
            dataFactoryArguments: { category: configParams.category ?? 'all' },
            dependencies: ['userInfo'],
        },
    }
}
```

- `configParams` — статический объект из `prefetchConfig.configParams`.
  Должен быть JSON-safe.
- `router` — контекст маршрута. В `getConfig` он есть, но лучше использовать
  его только для аргументов: `router.params` и `router.query` на этапе сборки
  неизвестны (см. ниже).
- `getConfig` может быть `async`.
- `getConfig` выполняется **на этапе сборки** (сканирование `dataFactoryName`)
  и **в рантайме** (SSR и SPA). На сборке `router.params`, `router.query` и
  `router.request` пустые, а `configParams` — те, что записаны в `router.ts`.
- Поэтому **не стройте `dataFactoryName` от `router.params`**: на сборке модуль
  не попадёт в бандл. Меняйте только аргументы, а путь берите из `ctx.router`
  внутри `loadData`:

```ts
// Хорошо: путь статический, данные зависят от URL.
export default function getConfig(): FactoryMap {
    return {
        BlogPost: {
            dataFactoryName: 'BlogPage/Factories/blogPost:BlogPostLoader',
        },
    }
}

export const BlogPostLoader: FactoryImplementation<Post> = {
    async loadData(_args, _deps, ctx) {
        const router = ctx.router as TustenRouter
        const slug = router.params.id ?? 'unknown'
        return fetchPost(slug)
    },
    slice: PostSlice,
}
```

Если `prefetchConfig` не задан, у страницы нет page-слайсов: компонент живёт на
глобальных слайсах (которые перечислены в `dependencies`) и своих props.

## Глобальные фабрики

Файл должен называться `*.loader.ts` (или `*.loader.js`) и лежать в любом месте
`clientDir`. Экспорт по умолчанию — `defineGlobalLoader`.

```ts
// client/User.loader.ts
import { defineGlobalLoader } from '@tusten/core'

export default defineGlobalLoader({
    userInfo: {
        dataFactoryName: 'User/loaders/userInfo:UserInfoLoader',
    },
})
```

```ts
// client/User/loaders/userInfo.ts
import { Slice, Service, type FactoryImplementation } from '@tusten/core'

interface UserInfo {
    id: number
    name: string
}

const usersService = new Service({ endpoint: 'Users', cache: 30_000 })

export class UserInfoSlice extends Slice<UserInfo | null> {}

export const UserInfoLoader: FactoryImplementation<UserInfo | null> = {
    async loadData() {
        return usersService.call<{ id: number; name: string }>('Read', { id: 1 })
    },
    slice: UserInfoSlice,
}
```

Маршрут подключает глобальную фабрику через `prefetchConfig.dependencies`:

```ts
prefetchConfig: {
    configLoader: 'HomePage/Factories/Root',
    dependencies: ['userInfo'],
}
```

Объявление в `*.loader.ts` **само по себе ничего не загружает**: глобальная
фабрика попадает в реестр, только когда её запросил маршрут (напрямую или через
`dependencies` другой фабрики). Если layout читает `userInfo` на всех
страницах — добавьте `userInfo` в `dependencies` каждого маршрута.

Зависимости глобальных фабрик транзитивны: если `userInfo` зависит от
`permissions`, `permissions` загрузится автоматически.

## Три источника аргументов

| Источник                    | Где задаётся                                      | Куда попадает                                            | Ограничения                                             |
| --------------------------- | ------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------- |
| `configParams`              | `route.contentConfig.prefetchConfig.configParams` | только в `getConfig`                                     | JSON-safe                                               |
| `dataFactoryArguments`      | `FactoryDef` в `getConfig` / `defineGlobalLoader` | в `loadData` (как база) и в `_initState(result, config)` | JSON-safe, сериализуется в HTML                         |
| `getDataFactoryArguments()` | `FactoryImplementation`                           | только в `loadData` (мерж поверх статических)            | выполняется при реальной загрузке (SSR / SPA-навигация) |

`loadData` получает `{ ...dataFactoryArguments, ...await getDataFactoryArguments() }`.
Динамические аргументы **не** сериализуются в `config`, поэтому `_initState`
вторым аргументом видит только статические. Если динамическое значение нужно в
состоянии — верните его из `loadData`:

```ts
const PAGE_SIZE = 20

export const ListLoader: FactoryImplementation<ListState> = {
    async getDataFactoryArguments() {
        return { limit: PAGE_SIZE }
    },
    async loadData(args) {
        const limit = args.limit as number
        const users = await usersService.query({ limit })
        // `limit` вернётся в state, а не потеряется в config.
        return { users, limit }
    },
    slice: ListSlice,
}
```

`getDataFactoryArguments` не получает ни аргументов, ни `router`. Он подходит для
значений, known на обеих сторонах (константы модуля, feature-флаг сборки). Для
всего, что зависит от пользователя или URL, используйте `getConfig(configParams,
router)` — его `dataFactoryArguments` тоже пересчитываются на каждый запрос — или
`ctx.router` внутри `loadData`. Не берите `localStorage` / `window`: на SSR их
нет, а модульные переменные на сервере общие для всех запросов.

## Зависимости

```ts
export default function getConfig(): FactoryMap {
    return {
        Profile: {
            dataFactoryName: 'Profile/Factories/profile:ProfileLoader',
            dependencies: ['userInfo'], // глобальная фабрика
        },
        Feed: {
            dataFactoryName: 'Profile/Factories/feed:FeedLoader',
            dependencies: ['Profile'], // page-фабрика этой же страницы
        },
    }
}
```

Что гарантирует ядро:

- **Топологический порядок** коммита: состояние и `__ROOT_STATE_STR__`
  детерминированы, независимо от того, какая фабрика ответила раньше.
- **Параллельность**: независимые ветки `loadData` стартуют одновременно;
  каждая ждёт только свои `dependencies`.
- **Циклы** — `TustenError: Cycle detected: A → B → A`.
- **Неизвестная зависимость** — `TustenError`, если имени нет ни в
  `FactoryMap`, ни среди загруженных глобальных фабрик.
- **Коллизия имён** page/global — `TustenError: A3 violation`.

В `deps` попадают результаты `loadData`, а не `slice.state`:

```ts
export const FeedLoader: FactoryImplementation<FeedState> = {
    async loadData(_args, deps) {
        const profile = deps.Profile as { id: number }
        return feedService.query({ userId: profile.id })
    },
    slice: FeedSlice,
}
```

Не путайте два места, где живут зависимости:

- `route.contentConfig.prefetchConfig.dependencies` — **только глобальные**
  имена из `*.loader.ts`; page-фабрик там быть не может.
- `FactoryDef.dependencies` — зависимости конкретной фабрики; здесь можно
  ссылаться и на page-фабрики того же `getConfig`, и на глобальные.

## Путь до модуля фабрики

- Путь — относительно `clientDir`, без `./`:
  `'HomePage/Factories/usersList:UserListLoader'`.
- Расширение можно не указывать: ядро ищет `.tsx`, `.ts`, `.jsx`, `.js`.
- После двоеточия — имя экспорта; без двоеточия — `default`.
- Регистр файла сохраняется: `View.tsx` и `view.tsx` — разные файлы, в том
  числе на Windows.
- Модуль фабрики должен быть статически обнаружим: page-фабрики собираются
  выполнением `getConfig` на сборке, глобальные — чтением `*.loader.ts`.

## `loadData`: контракт

- Возвращает данные для слайса. Они попадут в `_initState(result, config)`.
- Результат должен переживать `devalue` (см.
  [`Slices.md`](Slices.md#ssr-гидратация-и-сериализация)): plain-объекты,
  массивы, `Map`, `Set`, `Date`, `BigInt`, `undefined`, `NaN`, `Infinity`,
  циклические ссылки. **Функции и экземпляры классов — нельзя.**
- Не кладите в state секреты: на SSR всё состояние уезжает в HTML.
- Ошибка (`throw` / reject) означает ошибку загрузки страницы:
    - SSR — 500/страница ошибки (в dev — оверлей);
    - SPA-навигация — `components.error` и dev-оверлей;
    - `router.reload()` — текущая страница остаётся, Promise реджектится.
- Аргументы и `ctx` — только для чтения; не мутируйте их.

## `Service`: изоморфный RPC

`Service` — рекомендуемый способ добывать данные в `loadData`. Один и тот же
код работает на сервере и клиенте:

```ts
import { Service } from '@tusten/core'

const users = new Service({
    endpoint: 'Users',
    binding: { query: 'List', read: 'Read' },
    cache: 30_000, // TTL, мс
    cacheMaxEntries: 500, // LRU на клиенте
})

await users.query({ limit: 10 }) // Users.List
await users.read({ id: 1 }) // Users.Read
await users.call('Custom.Method', {}) // без binding
users.invalidate() // сбросить кэш endpoint'а
users.invalidate('List', { limit: 10 }) // точечно
Service.invalidateAll() // весь клиентский кэш
```

- На сервере кэш — per-request (ALS), без LRU: данные не утекают между
  пользователями.
- На клиенте кэш — модульный LRU.
- `router.reload()` по умолчанию вызывает `Service.invalidateAll()`; с
  `{ cache: true }` кэш сохраняется.
- `<Link prefetch>` и `nav.prefetch()` прогревают и кэш `Service`, и чанки.

## SSR, SPA и гидратация

**SSR-запрос:**

```text
runGlobalPrefetch(dependencies)
→ server middleware
→ runPagePrefetch(getConfig → loadData)
→ serializeState (state + config)
→ renderToPipeableStream
```

**SPA-переход:**

```text
client middleware
→ runGlobalPrefetch({ skipExisting: true })
→ runPagePrefetch в отдельном SliceRegistry
→ adoptPage + startTransition
→ commit → уничтожение старых page-слайсов
```

**Гидратация:**

```text
devalueParse(__ROOT_STATE_STR__)
→ hydrateSlicesFromState (hydrate(state, config))
→ hydrateRoot
```

На гидратации `loadData` **не выполняется повторно** — состояние берётся из
HTML. Поэтому `_initState` обязан быть детерминированным и не зависеть от
`Date.now()` / `Math.random()` / `window`.

## Рецепты

### Аргументы из URL

```ts
export default function getConfig(configParams: Record<string, unknown>, router: TustenRouter): FactoryMap {
    // router.query доступен и на SSR, и на клиенте.
    return {
        Search: {
            dataFactoryName: 'Search/Factories/search:SearchLoader',
            dataFactoryArguments: { q: router.query.q ?? '' },
        },
    }
}
```

Если параметр нужен только в `loadData`, проще взять `ctx.router` — не придётся
сериализовать его в `config`.

### Глобальный текущий пользователь

1. `client/User.loader.ts` → `userInfo`.
2. На каждом маршруте: `prefetchConfig.dependencies: ['userInfo']`.
3. В layout: `const user = useStrictSlice<UserInfoSlice>('userInfo')`.

### Страница без page-фабрик

Не задавайте `prefetchConfig` вовсе. Шаблон получит глобальные слайсы,
перечисленные в `dependencies` (если они нужны). Отдельный `configLoader` с
пустым `FactoryMap` не нужен.

### Зависимость от результата другой фабрики

Используйте `dependencies` и второй аргумент `loadData` — не читайте реестр
из `loadData` вручную. Так ядро само построит граф и не запустит фабрику
раньше времени.

### Фильтры и пагинация

Держите параметры в URL (`router.query`), а не в модульной переменной: тогда
SSR и клиент увидят одно и то же, а `reload()` пересчитает данные.

## Частые ошибки

| Симптом                                                                   | Причина                                                                                   |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `Global dependency "x" not found in any *.loader.ts`                      | имя в `dependencies` не объявлено ни в одном `*.loader.ts`                                |
| `Unknown dependency "x"`                                                  | page-фабрика ссылается на имя, которого нет в `getConfig` и среди глобальных              |
| `A3 violation: "x" declared both in page's getConfig and global registry` | одинаковый ключ на странице и глобально                                                   |
| `Cycle detected: A → B → A`                                               | циклические `dependencies`                                                                |
| `Invalid factory "x": expected loadData + slice`                          | модуль не экспортирует `loadData` и/или `slice`                                           |
| `Module not found: ...`                                                   | неверный путь/экспорт или `dataFactoryName` зависит от `router.params` (на сборке их нет) |
| `devalue cannot stringify non-POJOs`                                      | `loadData` вернул функцию/экземпляр класса                                                |
| Слайс есть на одной странице и нет на другой                              | маршрут не указал глобальную фабрику в `dependencies`                                     |
| Данные не обновились после `reload()`                                     | кэш `Service` (`{ cache: true }`) или `loadData` вернул то же значение                    |
| Сборка предупреждает `getConfig of route "x" failed`                      | `getConfig` бросает на этапе сборки; фабрики маршрута могут не попасть в бандл            |

## Справочник API

| API                                     | Импорт         | Назначение                                                |
| --------------------------------------- | -------------- | --------------------------------------------------------- |
| `defineGlobalLoader(map)`               | `@tusten/core` | объявить глобальные фабрики в `*.loader.ts`               |
| `FactoryMap`                            | `@tusten/core` | `Record<string, FactoryDef>`                              |
| `FactoryDef`                            | `@tusten/core` | `dataFactoryName`, `dataFactoryArguments`, `dependencies` |
| `FactoryImplementation<T>`              | `@tusten/core` | `loadData`, `slice`, `getDataFactoryArguments`            |
| `TustenRouter`                          | `@tusten/core` | `id`, `path`, `params`, `query`, `request`                |
| `Service`                               | `@tusten/core` | изоморфный JSON-RPC-клиент с TTL/LRU-кэшем                |
| `runGlobalPrefetch` / `runPagePrefetch` | `@tusten/core` | низкоуровневый prefetch (для инструментов/тестов)         |

## Чек-лист

- [ ] Ключ `FactoryMap` уникален и не пересекается с глобальными.
- [ ] `dataFactoryName` — путь от `clientDir` с правильным экспортом.
- [ ] `dataFactoryArguments` / `configParams` — JSON-safe.
- [ ] `loadData` возвращает сериализуемые данные (без функций и классов).
- [ ] `dataFactoryName` не зависит от `router.params` / `router.query`.
- [ ] Глобальные фабрики перечислены в `dependencies` нужных маршрутов.
- [ ] `getConfig` не имеет побочных эффектов и переживает пустой `router`.
- [ ] В state нет секретов и лишних тяжёлых данных: он уезжает в HTML.
- [ ] Ошибки `loadData` осмысленны: пользователь увидит страницу ошибки, а не пустоту.
