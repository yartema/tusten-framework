# Слайсы в tusten — руководство пользователя

Слайс — это реактивный store с состоянием, которое создаёт фабрика данных.
Компоненты читают его через `useSlice` / `useStrictSlice` / `useSliceRef`,
а мутируют через `setState`.

> Про то, откуда берутся данные, — [`Factories.md`](Factories.md). Краткая
> версия — раздел «Данные» в корневом `README.md`.

## Содержание

- [Что умеет](#что-умеет)
- [Быстрый старт](#быстрый-старт)
- [`Slice` и `AbstractSlice`](#slice-и-abstractslice)
- [`_initState`: как собрать состояние](#_initstate-как-собрать-состояние)
- [Чтение и `setState`](#чтение-и-setstate)
- [Хуки](#хуки)
- [Жизненный цикл](#жизненный-цикл)
- [Page-scoped и global](#page-scoped-и-global)
- [SSR, гидратация и сериализация](#ssr-гидратация-и-сериализация)
- [SPA-навигация и `reload()`](#spa-навигация-и-reload)
- [`SliceRegistry`](#sliceregistry)
- [Рецепты](#рецепты)
- [Частые ошибки](#частые-ошибки)
- [Справочник API](#справочник-api)
- [Чек-лист](#чек-лист)

## Что умеет

- `Slice<T>` — готовый класс: состояние = результат `loadData` как есть.
- Свой класс — наследник `Slice<T>` с `_initState(result, config)`:
  computed-поля, методы-действия, нормализация данных.
- `slice.state` — чтение; `slice.setState()` — патч + уведомление подписчиков.
- Для plain-объектов `setState` **мержит** поля, а не заменяет объект целиком.
- `useSlice` / `useStrictSlice` / `useSliceRef` — подписка из React.
- Page-слайсы живут до конца страницы, global — до перезагрузки приложения.
- SSR: состояние и `config` едут в `__ROOT_STATE_STR__`, гидратация не
  перезапускает `loadData`.
- `destroy()` снимает подписчики и освобождает ресурсы; после него `setState`
  игнорируется.

## Быстрый старт

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
}

const usersService = new Service({ endpoint: 'Users', binding: { query: 'List' } })

export class UserListSlice extends Slice<UserListState> {
    protected override _initState(result: unknown): UserListState {
        const { users } = result as { users: User[] }
        return { users, total: users.length }
    }
}

export const UserListLoader: FactoryImplementation<UserListState> = {
    async loadData(args) {
        const users = await usersService.query<{ limit: number }, User[]>({
            limit: (args.limit as number | undefined) ?? 10,
        })
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
        <div>
            <p>Всего: {state.total}</p>
            <button onClick={() => list.setState({ total: 0 })}>Сбросить счётчик</button>
        </div>
    )
}
```

`useSlice` возвращает **слайс**, а не состояние: данные лежат в `slice.state`.
Ключ (`'UserList'`) — ключ `FactoryMap`, см. [`Factories.md`](Factories.md).

## `Slice` и `AbstractSlice`

- `AbstractSlice<T>` — базовый класс: подписки, `state`, `setState`, `reset`,
  `destroy`, `hydrate`.
- `Slice<T>` — наследник с identity-`_initState`: `state === result`.
- Свой класс наследуйте от `Slice<T>` и переопределяйте `_initState`, если нужно
  обогатить состояние.

```ts
import { Slice } from '@tusten/core'

export class CartSlice extends Slice<{ items: CartItem[]; total: number }> {
    protected override _initState(result: unknown) {
        const items = result as CartItem[]
        return {
            items,
            total: items.reduce((sum, item) => sum + item.price * item.qty, 0),
        }
    }
}
```

`AbstractSlice` напрямую нужен редко — только если не подходит identity-`Slice`.

## `_initState`: как собрать состояние

```ts
protected _initState(result: unknown, config?: unknown): TState
```

- Вызывается **один раз на экземпляр** из `hydrate(result, config)`.
- `result` — то, что вернул `loadData`.
- `config` — статические `dataFactoryArguments` фабрики (не `configParams`,
  не результат `getDataFactoryArguments()`).
- На SSR и на клиентской гидратации вызывается с одними и теми же `result` и
  `config`, поэтому должен быть **детерминированным**: никаких `Date.now()`,
  `Math.random()`, `localStorage`, `window`.
- Здесь создаются функции и методы состояния — они не сериализуются, а
  пересоздаются на каждой стороне:

```ts
protected override _initState(result: unknown, config?: unknown) {
    const { users } = result as { users: User[] }
    const { limit = 10 } = (config ?? {}) as { limit?: number }

    return {
        users,
        limit,
        get visible() {
            return this.users.slice(0, this.limit)
        },
    }
}
```

Функции и методы в состоянии не сериализуются: на сервере они создаются для
рендера, на клиенте — заново при гидратации. Поэтому в `_initState` нельзя
завязываться на окружение; действия, которым нужен `setState`, удобнее держать
в самом классе слайса.

Повторный `hydrate` — ошибка (`Slice: hydrate уже вызывался`). Для обновления
состояния используйте `setState`.

## Чтение и `setState`

### `slice.state`

```ts
const total = list.state.total
```

Тип — `TState`, но до первого `hydrate`/`setState` фактическое значение
`undefined`. На практике после prefetch состояние уже есть; для page-слайсов
всё равно проверяйте `list?.state`.

### `setState`

```ts
list.setState({ total: 0 }) // патч
list.setState((prev) => ({ total: prev.total + 1 })) // функциональный апдейтер
list.setState(nextUsers) // если TState — массив
list.setState(42) // если TState — примитив
```

Правила:

- **Plain-объект** (`{}`, `Object.create(null)`) — поверхностный мерж:
  переданные ключи заменяются, остальные сохраняются. Вложенные объекты
  заменяются целиком (это не глубокий мерж).
- **Массив, `Map`, `Set`, `Date`, экземпляр класса, примитив** — полная замена.
- Если итоговое значение `Object.is` равно предыдущему, подписчики **не**
  уведомляются. Мутация на месте (`state.users.push(...)`) не сработает —
  создайте новый массив/объект.
- `setState` на уничтоженном слайсе — no-op, вне production пишется warning.

```ts
// Плохо: мутация на месте, React не увидит изменений.
list.state.users.push(newUser)

// Хорошо: новый объект.
list.setState({ users: [...list.state.users, newUser] })
```

### `reset()`

Возвращает состояние к `_initialState` — значению первого `hydrate`/`setState`.
Полезно для фильтров и черновиков:

```ts
list.reset()
```

### `subscribe(listener)`

Подписка без React. Возвращает функцию отписки; у уничтоженного слайса — no-op.

```ts
const unsubscribe = list.subscribe(() => {
    console.log('state changed', list.state)
})
unsubscribe()
```

## Хуки

Все три хука требуют `<RootProvider>` (его создаёт tusten автоматически в
client-entry) и работают в root controller, layouts и страницах.

| Хук                      | Возвращает       | Подписка на `state`            | Поведение при отсутствии |
| ------------------------ | ---------------- | ------------------------------ | ------------------------ |
| `useSlice<T>(key)`       | `T \| undefined` | да                             | `undefined`              |
| `useStrictSlice<T>(key)` | `T`              | да                             | бросает `TustenError`    |
| `useSliceRef<T>(key)`    | `T \| undefined` | нет (только на смену инстанса) | `undefined`              |

```tsx
const user = useSlice<UserInfoSlice>('userInfo')
const userState = user?.state

const list = useStrictSlice<UserListSlice>('UserList') // точно есть
list.setState({ total: 0 })

// Действия без ре-рендера на каждое изменение state:
const actions = useSliceRef<UserListSlice>('UserList')
actions?.setState({ total: 0 })
```

Когда что использовать:

- `useSlice` — обычное чтение данных в рендере.
- `useStrictSlice` — когда отсутствие слайса является ошибкой (нет фабрики,
  забыли `dependencies`); ошибку поймает `RootErrorBoundary`.
- `useSliceRef` — кнопки/обработчики, которым нужен только сам слайс, а не его
  состояние.

Смена инстанса (SPA-переход, `reload`, `adoptPage`) автоматически
переподписывает хук: новые `setState` вызывают ре-рендер.

## Жизненный цикл

```text
new Slice()
  → hydrate(result, config)   // один раз
  → state / setState / subscribe
  → destroy()                 // навигация, reload, конец жизни страницы
```

- `hydrate` вызывается ядром: создавать слайсы вручную в компонентах не нужно.
- `destroy()` снимает подписчиков и очищает state. После него `state` —
  `undefined`, `setState` — no-op, `subscribe` — пустая отписка.
- Если переопределяете `destroy()`, **обязательно** вызывайте `super.destroy()`:

```ts
export class LiveSlice extends Slice<LiveState> {
    private timer?: ReturnType<typeof setInterval>
    private controller = new AbortController()

    protected override _initState(result: unknown): LiveState {
        return startPolling(result, this.controller.signal)
    }

    override destroy(): void {
        this.controller.abort()
        if (this.timer) clearInterval(this.timer)
        super.destroy()
    }
}
```

- `reset()` не уничтожает слайс, только откатывает state.
- `dispose()` — устаревший алиас `destroy()`.
- `getState()` — устаревший алиас `state`.
- `getServerSnapshot()` возвращает `state` (используется React-хуками).

### Когда уничтожаются page-слайсы

SPA-переход рендерится в `startTransition`: новая страница ещё не
закоммичена, старая остаётся на экране. Поэтому `SliceRegistry.adoptPage()`
**не уничтожает** старые слайсы сразу, а возвращает `release()`. Client-entry
вызывает её после commit нового дерева. Прямой вызов `adoptPage()` в
прикладном коде должен делать то же самое:

```ts
const release = registry.adoptPage(nextRegistry)
// ... render нового дерева ...
release()
```

Иначе вытесненные слайсы останутся жить до `disposePage()` / `disposeAll()`.

## Page-scoped и global

|                        | Page-scoped                         | Global                                        |
| ---------------------- | ----------------------------------- | --------------------------------------------- |
| Объявление             | `getConfig` страницы                | `*.loader.ts` → `defineGlobalLoader`          |
| Переживает SPA-переход | нет                                 | да                                            |
| Когда заменяется       | при переходе / `reload`             | при `reload({ global: true })` (по умолчанию) |
| Кто читает             | шаблон страницы, вложенные layout'ы | любой layout/страница                         |

Практическое правило:

- **Page** — данные конкретного экрана: список, пост, статистика страницы.
- **Global** — текущий пользователь, права, тема, справочники, которые нужны
  нескольким страницам.

Глобальный слайс — это не «синглтон на всё приложение»: экземпляр создаётся на
загрузку (SSR-запрос / клиентскую сессию), а не на процесс сервера.

## SSR, гидратация и сериализация

На SSR ядро кладёт в HTML `__ROOT_STATE_STR__`:

```ts
{
    version: 1,
    slices: {
        UserList: {
            modulePath: '/client/HomePage/Factories/usersList.ts',
            exportName: 'UserListSlice',
            state: { users: [...] },
            config: { limit: 10 },
            scope: 'page',
        },
    },
}
```

- Строка сериализуется `devalue`, поэтому поддерживаются `Map`, `Set`, `Date`,
  `BigInt`, `undefined`, `NaN`, `Infinity`, `-0` и циклические ссылки.
- **Функции не сериализуются.** Всё, что нельзя положить в данные, создавайте
  в `_initState` — на сервере и на клиенте оно будет создано заново.
- `config` — статические `dataFactoryArguments` фабрики. Благодаря нему
  `_initState(result, config)` получает одинаковые аргументы на сервере и при
  гидратации.
- **В состоянии нет приватности**: любой пользователь видит его в исходнике
  HTML. Не кладите токены, пароли и чужие персональные данные.
- Объём state влияет на TTFB и размер HTML. Не дублируйте в слайсах то, что уже
  есть в глобальном слайсе, и не храните там огромные списки без пагинации.

На гидратации `loadData` повторно **не вызывается**: состояние берётся из
`__ROOT_STATE_STR__` и передаётся в `hydrate(state, config)`.

## SPA-навигация и `reload()`

- При переходе page-слайсы новой страницы готовятся в отдельном реестре.
  Старые уничтожаются после commit нового дерева.
- Глобальные слайсы при навигации не перезагружаются (`skipExisting`).
- `nav.reload()` по умолчанию перезапускает и page-, и global-фабрики и
  сбрасывает кэш `Service`:

```ts
await nav.reload() // всё заново
await nav.reload({ global: false }) // только page-слайсы
await nav.reload({ cache: true }) // разрешить кэш Service
await nav.reload({ remount: true }) // перемонтировать шаблон страницы
```

- Пока идёт переход/`reload`, `nav.pending === true`, но старая страница и её
  слайсы живы. Подробнее — [`Router.md`](Router.md#полоска-загрузки-и-pending).
- Ошибка `reload` не заменяет страницу: пользователь остаётся на текущей,
  Promise реджектится. Ошибка навигации показывает `components.error`.

## `SliceRegistry`

Обычно реестр создаёт и обслуживает client-entry / SSR-handler. Прямой доступ
нужен в тестах и инструментах.

```ts
import { SliceRegistry } from '@tusten/core'

const registry = new SliceRegistry()
registry.setPage('UserList', slice)
registry.setGlobal('userInfo', userSlice)

registry.get('UserList') // page → global
registry.require('UserList') // бросает, если нет
registry.subscribeKey('UserList', () => {}) // смена инстанса по ключу

registry.disposePage()
registry.adoptPage(nextRegistry) // возвращает release()
registry.adoptGlobal(nextRegistry) // возвращает release()
registry.disposeAll()
```

- `setPage` / `setGlobal` заменяют инстанс и **сразу** уничтожают предыдущий.
- `adoptPage` / `adoptGlobal` заменяют без уничтожения и возвращают `release()`
  (см. [Когда уничтожаются page-слайсы](#когда-уничтожаются-page-слайсы)).
- `release()` идемпотентна.
- `subscribeKey` уведомляет о появлении/замене/удалении инстанса по ключу, а не
  об изменении `state` (для этого — `slice.subscribe`).

## Рецепты

### Действие с запросом на сервер

```ts
async function renameUser(id: number, name: string): Promise<void> {
    await usersService.call('Update', { id, name })
    const state = list.state
    list.setState({
        users: state.users.map((user) => (user.id === id ? { ...user, name } : user)),
    })
}
```

### Оптимистичное обновление

```ts
async function toggleLike(postId: number): Promise<void> {
    const prev = post.state
    post.setState({ liked: !prev.liked, likes: prev.likes + (prev.liked ? -1 : 1) })

    try {
        await postsService.call('ToggleLike', { id: postId })
    } catch (err) {
        post.setState(prev) // откат
        throw err
    }
}
```

Для отката `prev` должен быть plain-объектом подходящей формы: `setState`
мержит, а не заменяет state целиком.

### Производные значения

Если значение выводится из state, не храните его отдельно — считайте в рендере
или в `_initState` как getter:

```tsx
const visible = useMemo(() => state.users.filter((user) => user.name.includes(query)), [state.users, query])
```

### Очистка ресурсов

Таймеры, `AbortController`, подписки на `window` — только в слайсе и только с
освобождением в `destroy()` (см. пример выше). Иначе после навигации останется
утечка и «тихие» ре-рендеры размонтированного дерева.

### SPA-навигация без page-фабрик

Если у маршрута нет `prefetchConfig`, page-слайсов нет вообще: `useSlice`
вернёт `undefined`, а `useStrictSlice` бросит. Читайте глобальные слайсы или
локальный state.

### Тесты

```ts
import { describe, expect, it, vi } from 'vitest'
import { UserListSlice } from './usersList'

describe('UserListSlice', () => {
    it('считает total', () => {
        const slice = new UserListSlice()
        slice.hydrate({ users: [{ id: 1, name: 'A' }] })
        expect(slice.state.total).toBe(1)
    })

    it('уведомляет подписчиков', () => {
        const slice = new UserListSlice()
        slice.hydrate({ users: [] })
        const listener = vi.fn()
        slice.subscribe(listener)
        slice.setState({ total: 10 })
        expect(listener).toHaveBeenCalledTimes(1)
    })
})
```

Мутации слайса после `render()` в React-тестах оборачивайте в `act()` — иначе
React не увидит обновление.

## Частые ошибки

| Симптом                                | Причина                                                                                 |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| `Slice "x" not found in registry`      | `useStrictSlice` до загрузки, опечатка в ключе, нет `prefetchConfig` или `dependencies` |
| `useSlice(...)` возвращает `undefined` | маршрут не объявил фабрику/глобальную зависимость; ключ не совпадает с `FactoryMap`     |
| `state` равен `undefined`              | `hydrate` ещё не вызывался (ручное создание слайса)                                     |
| `setState` не вызывает ре-рендер       | мутация на месте, то же значение по `Object.is`, слайс уничтожен                        |
| Warning `setState on destroyed slice`  | запись после навигации/`destroy()`; используйте актуальный слайс из хука                |
| `devalue cannot stringify non-POJOs`   | в `loadData` попала функция или экземпляр класса — перенесите в `_initState`            |
| Hydration mismatch                     | `_initState` зависит от `Date.now()` / `Math.random()` / `window`                       |
| Старые данные после `reload()`         | кэш `Service`: `reload()` без `cache: true` его сбрасывает; проверьте `loadData`        |
| Слайс «пропал» после перехода          | page-слайс живёт только на своей странице; для общих данных нужен global                |
| Память растёт после переходов          | в `destroy()` не освобождены таймеры/подписки                                           |

## Справочник API

| API                                 | Импорт                | Назначение                                |
| ----------------------------------- | --------------------- | ----------------------------------------- |
| `Slice<T>`                          | `@tusten/core`        | базовый слайс с identity-`_initState`     |
| `AbstractSlice<T>`                  | `@tusten/core`        | полностью кастомный слайс                 |
| `SliceRegistry`                     | `@tusten/core`        | реестр page/global-слайсов                |
| `SlicePatch<T>` / `SliceUpdater<T>` | `@tusten/core`        | типы аргумента `setState`                 |
| `useSlice`                          | `@tusten/core/client` | слайс + подписка на `state`               |
| `useStrictSlice`                    | `@tusten/core/client` | как `useSlice`, но бросает при отсутствии |
| `useSliceRef`                       | `@tusten/core/client` | слайс без подписки на `state`             |

### Методы слайса

| Метод / свойство             | Что делает                                              |
| ---------------------------- | ------------------------------------------------------- |
| `state`                      | текущее состояние (`undefined` до `hydrate`/`setState`) |
| `hydrate(result, config?)`   | инициализация (один раз, вызывает ядро)                 |
| `setState(patch \| updater)` | обновить state и уведомить подписчиков                  |
| `reset()`                    | вернуть состояние первого `hydrate`/`setState`          |
| `subscribe(listener)`        | подписка; возвращает отписку                            |
| `destroy()`                  | снять подписчиков, очистить state                       |
| `isDestroyed()`              | уничтожен ли слайс                                      |
| `getServerSnapshot()`        | snapshot для React (`=== state`)                        |
| `getState()`                 | устаревший алиас `state`                                |
| `dispose()`                  | устаревший алиас `destroy()`                            |

## Чек-лист

- [ ] Ключ слайса совпадает с ключом `FactoryMap`.
- [ ] `_initState` детерминирован и не трогает браузерные API.
- [ ] В `loadData` нет функций и экземпляров классов.
- [ ] `setState` получает новый объект/массив, а не мутирует старый.
- [ ] Page-слайсы не используются как «общие» между страницами.
- [ ] Для общих данных объявлена глобальная фабрика и `dependencies`.
- [ ] В `destroy()` освобождены таймеры/подписки (`super.destroy()` вызван).
- [ ] В state нет секретов: он уезжает в HTML на SSR.
- [ ] В тестах мутации после `render()` обёрнуты в `act()`.
