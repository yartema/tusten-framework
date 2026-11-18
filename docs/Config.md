# Конфигурация tusten — руководство пользователя

Один файл `tusten.config.ts` в корне проекта описывает, где лежит код, как
собирается приложение, что отдаёт сервер и какие интеграции включены.
`defineConfig()` — типизированная обёртка без рантайм-магии: она возвращает
тот же объект, а проверка и подстановка значений по умолчанию происходят при
загрузке конфига.

> Краткая версия — раздел «Конфиг» в корневом `README.md`.
> Связанные руководства: [`Router.md`](Router.md) — маршруты и навигация,
> [`Factories.md`](Factories.md) — данные страниц, [`Slices.md`](Slices.md) —
> состояние, [`i18n.md`](i18n.md) — локализация.

## Содержание

- [Что умеет](#что-умеет)
- [Файл конфигурации](#файл-конфигурации)
- [Быстрый старт](#быстрый-старт)
- [Пути: от чего считаются](#пути-от-чего-считаются)
- [Верхний уровень](#верхний-уровень)
- [`ssr`](#ssr)
- [`publicDir`](#publicdir)
- [`client`](#client)
- [`server`](#server)
- [`middleware`](#middleware)
- [`i18n`](#i18n)
- [`vite`](#vite)
- [`build`](#build)
- [`runtimeConfig`](#runtimeconfig)
- [`fastify`](#fastify)
- [Полный пример](#полный-пример)
- [Рецепты](#рецепты)
- [Ограничения](#ограничения)
- [Частые ошибки](#частые-ошибки)
- [Справочник значений по умолчанию](#справочник-значений-по-умолчанию)
- [Чек-лист](#чек-лист)

## Что умеет

- **Один источник истины.** Каталоги `client/` и `server/`, статика, порт,
  RPC, i18n, Vite-плагины и настройки Fastify задаются в одном месте.
- **Типобезопасность.** `defineConfig()` принимает `TustenConfig`, поэтому
  редактор и `tsc` подсвечивают опечатки и неверные значения.
- **Значения по умолчанию.** Пустой `export default defineConfig({})` — валидный
  конфиг: фреймворк подставит `client/`, `server/`, `public/`, порт `3000`,
  SSR, сжатие и `/service`.
- **Ранняя валидация.** Некорректные `i18n`, `publicDir`, `server.compress`,
  `client.root.container` и структура файла дают `TustenError` при старте, а не
  падение в середине запроса.
- **Единая конфигурация для dev, build и start.** И dev-сервер, и обе
  production-сборки читают один и тот же объект; отдельный `vite.config.ts` не
  используется.

## Файл конфигурации

Фреймворк ищет файл в корне проекта (там, где запускается `tusten`):

1. `tusten.config.ts`

Другие имена и расширения (`.mts`, `.cts`, `tusten.config.mjs`) не
поддерживаются. Флаг `--config` у CLI нет: конфиг всегда берётся из текущего
рабочего каталога.

```ts
// tusten.config.ts
import { defineConfig } from '@tusten/core'

export default defineConfig({
    ssr: true,
    client: {
        css: ['styles/main.css'],
    },
})
```

Правила:

- Модуль обязан иметь **default-export — объект**. `export default null`,
  массив или модуль без экспорта — `TustenError: Config at … must export a
default object`.
- `defineConfig()` не обязателен, но без него теряется проверка типов.
  Возвращать функцию, Promise или `async`-конфиг нельзя.
- Конфиг исполняется через `jiti`, поэтому в нём работают TypeScript и
  импорты — например, `import tailwindcss from '@tailwindcss/vite'`.
- Конфиг читается **один раз при старте** `tusten dev` / `tusten start` /
  `tusten build`. Правки требуют перезапуска команды; HMR конфиг не
  перезагружает.

## Быстрый старт

Минимальный конфиг с root controller, глобальными стилями и API-роутами:

```ts
import { defineConfig } from '@tusten/core'

export default defineConfig({
    client: {
        root: 'Page/Controller:Root',
        css: ['styles/main.css'],
    },
    server: {
        port: 3000,
        routes: 'server/api/routes.ts',
    },
    i18n: {
        defaultLocale: 'ru',
        locales: ['ru', 'en'],
    },
})
```

```bash
pnpm exec tusten dev
# → http://127.0.0.1:3000
```

На Windows открывайте `127.0.0.1`, а не `localhost`: последний может
резолвиться в `::1`.

## Пути: от чего считаются

Пути в конфиге **не абсолютные** — они разрешаются от корня проекта или от
клиентского каталога:

| Поле                                               | База           |
| -------------------------------------------------- | -------------- |
| `client.clientDir`                                 | корень проекта |
| `publicDir`                                        | корень проекта |
| `server.serverDir`                                 | корень проекта |
| `server.routes`                                    | корень проекта |
| `server.plugins`                                   | корень проекта |
| `middleware[].handler`                             | корень проекта |
| `client.css[]`                                     | `clientDir`    |
| `client.root.component`                            | `clientDir`    |
| `client.components.error` / `loading` / `notFound` | `clientDir`    |
| `build.outDir`                                     | корень проекта |

- Пути внутри `client.*` задаются **без ведущего `./`**: `Page/Controller:Root`,
  `layouts/Main`, `styles/main.css`. Старый вид с `./` поддерживается и
  нормализуется при загрузке конфига.
- `publicDir` тоже нормализуется: `'  ./static  '` превращается в `'static'`.
- Пути серверной части разрешаются через `path.resolve`, поэтому `./` и
  абсолютные пути работают, но для переносимости лучше держать их
  относительными.
- Спека модуля — `<file>:<export>` или `<file>` для default-export:
  `Page/Controller:Root`, `shared/ErrorBoundary:ErrorBoundary`,
  `layouts/Main`.

## Верхний уровень

```ts
interface TustenConfig {
    ssr?: boolean
    publicDir?: string | false
    client?: {
        // см. раздел «client»
    }
    server?: {
        // см. раздел «server»
    }
    middleware?: MiddlewareDef[]
    i18n?: { key?: string; defaultLocale: string; locales: string[] }
    vite?: UserConfig
    build?: { outDir?: string }
    runtimeConfig?: { public?: Record<string, unknown> }
    fastify?: FastifyServerOptions
}
```

| Ключ            | По умолчанию         | Назначение                                       |
| --------------- | -------------------- | ------------------------------------------------ |
| `ssr`           | `true`               | SSR всего проекта; `false` — режим SPA           |
| `publicDir`     | `'public'`           | Каталог статики; `false` — отключить             |
| `client`        | `{}`                 | Клиентский код, root controller, CSS, компоненты |
| `server`        | `{}`                 | Каталоги, порт, API, JSON-RPC, сжатие            |
| `middleware`    | `[]`                 | Глобальные client/server middleware              |
| `i18n`          | не задан             | Локализация; без секции фича выключена           |
| `vite`          | `{}`                 | Мерж в Vite-конфигурацию dev и сборок            |
| `build`         | `{ outDir: 'dist' }` | Куда собирать клиент и сервер                    |
| `runtimeConfig` | `{ public: {} }`     | Зарезервировано, см. ниже                        |
| `fastify`       | `{}`                 | Прямой проброс в `Fastify(opts)`                 |

## `ssr`

Включает серверный рендер. По умолчанию `true`.

```ts
export default defineConfig({
    ssr: true,
})
```

Итоговый режим запроса:

```ts
config.ssr !== false && route.ssr !== false && query.noSSR !== 'true'
```

- `ssr: false` — весь проект работает как SPA. Сервер по-прежнему отдаёт
  `index.html`-оболочку, API-роуты, статику и `/service`; `route.ssr: true` в
  этом режиме игнорируется.
- `route.ssr: false` — SPA только для конкретной страницы. Маршрут с
  `index: true` и `ssr: false` — ошибка сборки (`TustenError`): индексная
  страница должна рендериться на сервере.
- `?noSSR=true` в URL принудительно отдаёт SPA-оболочку для текущего захода.
- В SPA первый экран показывает `client.components.loading` (или встроенный
  `RootLoading`), пока идёт prefetch и загрузка чанков.
- Отключение SSR не отключает RPC, API и статику — это только про HTML
  страниц. Глобальные и page-слайсы в SPA загружаются на клиенте.

```ts
// SPA для всего приложения
export default defineConfig({ ssr: false })
```

## `publicDir`

Каталог статики, который отдаётся с корня сайта. По умолчанию `public` рядом с
`client/` и `server/`. `false` полностью отключает каталог.

```ts
export default defineConfig({
    publicDir: 'static', // вместо public/
})

export default defineConfig({
    publicDir: false, // без каталога public/
})
```

Что происходит:

- В dev каталог обслуживает Vite.
- При `tusten build` содержимое копируется в `dist/client`, поэтому деплой
  только `dist/` работает.
- В production сервер раздаёт и `dist/client`, и исходный каталог: файл,
  добавленный после сборки, тоже будет доступен. Артефакты сборки имеют
  приоритет.
- Файлы с хэшем в имени (`assets/<name>-<hash>.js`) отдаются с
  `Cache-Control: public, max-age=31536000, immutable`; файлы из `public/` —
  с `no-cache`, чтобы после деплоя не показывалась старая версия.
- Текстовые ассеты крупнее 1 КБ предсжимаются в `.br` и `.gz`; production
  отдаёт их без сжатия на каждый запрос.

Ограничения: `publicDir` — непустая строка или `false`. Пустая строка и
не-строка дают `TustenError`; `undefined` означает дефолт `public`.

## `client`

Настройки клиентского кода.

### `client.clientDir`

Каталог с React-кодом. По умолчанию `client`. От него считаются `css`,
`root.component`, `components.*`; в нём сканер ищет `*/router.ts` и
`**/*.loader.ts`.

```ts
export default defineConfig({
    client: { clientDir: 'app' },
})
```

### `client.css`

Глобальные CSS-файлы, подключаемые при запуске приложения. Пути — от
`clientDir`, без `./`. Обычно здесь Tailwind-директивы, reset и тема.

```ts
export default defineConfig({
    client: {
        css: ['styles/main.css', 'styles/theme.css'],
    },
})
```

- Порядок массива = порядок подключения.
- Стили, импортированные из компонентов, тоже попадают в сборку; `client.css`
  нужен для глобальных стилей, которые не привязаны к компоненту.
- В dev CSS подключается через Vite, в production — через manifest.

### `client.root`

Корень приложения: root controller и DOM-контейнер.

```ts
export default defineConfig({
    client: {
        // Короткая форма — только component.
        root: 'Page/Controller:Root',
    },
})
```

```ts
export default defineConfig({
    client: {
        root: {
            component: 'Page/Controller:Root',
            container: {
                tag: 'div',
                id: 'app',
                attributes: { class: 'app-shell', 'data-theme': 'light' },
            },
        },
    },
})
```

`component` — React-компонент-оболочка, который рендерится **всегда**: SSR,
гидратация, SPA-loading, ошибка и 404. Путь — от `clientDir`, формат
`<file>:<export>` или `<file>` для default-export. Не задан — обёртки нет,
содержимое рендерится сразу в контейнер.

Root controller получает `children`, `route`, `router`, `status` (`ready` /
`loading` / `error` / `not-found`) и `error`. Он не перемонтируется при
SPA-навигации, поэтому в нём удобно держать провайдеры, шапку, тему и
открытые меню.

`container` — статичный HTML-элемент, в который монтируется React:

| Поле         | По умолчанию | Правила                                                                                                                                       |
| ------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `tag`        | `'div'`      | Обычный или custom-тег (`main`, `section`, `app-root`). Запрещены `html`, `head`, `body`, `script`, `style`, `title`, `meta`, `link`, `base`. |
| `id`         | `'root'`     | `false` или пустая строка — без id. Пробелы, кавычки, `<` и `>` запрещены.                                                                    |
| `attributes` | `{}`         | Строки, числа и `true` (boolean-атрибут). `false`/`null`/`undefined` пропускаются.                                                            |

- `data-tusten-root` — служебный маркер: по нему клиент находит контейнер,
  поэтому менять `tag` и `id` безопасно.
- `id` и `data-tusten-root` в `attributes` зарезервированы — ошибка.
- `on*`-атрибуты запрещены: это статичный HTML, а не обработчики. Для событий
  используйте React-компоненты внутри root controller.
- Атрибуты сортируются по имени, чтобы HTML был детерминированным между
  запросами.

Совсем без элемента нельзя: React нужен контейнер для `hydrateRoot` /
`createRoot`. `tag: 'app-root'` убирает лишний `div`, но это всё равно
элемент.

### `client.components`

Компоненты-обёртки для состояний приложения. Пути — от `clientDir` в формате
`<file>:<export>` или `<file>` для default-export.

```ts
export default defineConfig({
    client: {
        components: {
            error: 'shared/ErrorBoundary:ErrorBoundary',
            loading: 'shared/Loading:Loading',
            notFound: 'shared/NotFound:NotFound',
        },
    },
})
```

| Поле       | Когда рендерится                                                       | Если не задан       |
| ---------- | ---------------------------------------------------------------------- | ------------------- |
| `error`    | Ошибка страницы / SPA-навигации / prefetch; fallback для ErrorBoundary | `RootErrorBoundary` |
| `loading`  | Первый SPA-экран (`ssr: false` или `?noSSR=true`), пока идёт prefetch  | `RootLoading`       |
| `notFound` | 404 на SSR и первый заход по неизвестному URL                          | `RootNotFound`      |

- `error` рендерится **внутри** root controller, поэтому шапка и провайдеры
  остаются на месте.
- `loading` не нужен при SSR: серверный HTML уже виден, чанк loading в этом
  режиме не загружается.
- Нужный экспорт должен быть функцией. Если экспорта нет, используется
  встроенный fallback: `RootErrorBoundary` / `RootLoading` / `RootNotFound`.

## `server`

Настройки HTTP-сервера на Fastify.

### `server.serverDir`

Каталог серверного кода. По умолчанию `server`. В нём сканер ищет
`**/*.meta.ts` / `*.meta.js` для JSON-RPC-объектов. Остальные серверные пути
(`server.routes`, `server.plugins`, middleware и API-handler'ы) задаются явно
от корня проекта.

```ts
export default defineConfig({
    server: { serverDir: 'backend' },
})
```

### `server.port` и `server.host`

Порт и хост, которые использует CLI `tusten dev` / `tusten start`. По
умолчанию `3000` и `localhost`.

```ts
export default defineConfig({
    server: {
        port: Number(process.env.PORT ?? 3000),
        host: '0.0.0.0', // Docker / внешний интерфейс
    },
})
```

- Автоматического чтения `PORT`/`HOST` нет: если нужны переменные окружения,
  прочитайте их в конфиге явно.
- `localhost` на Windows может резолвиться в `::1`; для локальной разработки
  используйте `127.0.0.1`.
- `host: '0.0.0.0'` слушает все интерфейсы. За прокси включите
  `fastify.trustProxy`, иначе `request.protocol` / `hostname` будут видеть
  внутренний адрес.

### `server.routes`

Путь до **файла** с API-роутами. По умолчанию `null` — API-роутов нет. Путь —
от корня проекта.

```ts
// tusten.config.ts
export default defineConfig({
    server: { routes: 'server/api/routes.ts' },
})
```

```ts
// server/api/routes.ts
import { defineServerRoutes } from '@tusten/core/server'

export default defineServerRoutes([
    {
        method: 'GET',
        path: '/api/users',
        handler: 'server/api/handlers/users:listUsers',
        // Необязательно: статические параметры (первый аргумент handler'а).
        params: { limit: 20 },
        // Необязательно: API-middleware.
        middleware: [{ id: 'auth', handler: 'server/middleware/auth' }],
    },
])
```

- Default-export обязан быть массивом (`defineServerRoutes([...])`), иначе
  `TustenError` при старте.
- `handler` — `<file>:<export>` или `<file>` для default-export, от корня
  проекта. Handler получает `(params, { request, reply, params: pathParams })`.
- Middleware API получает `(params, { request, reply })`. Если middleware
  вернул `reply`, цепочка останавливается и handler не вызывается.
- API-роуты регистрируются до SSR catch-all, поэтому `/api/*` не попадает в
  рендер страниц.

### `server.plugins`

Путь до **каталога** с Fastify-плагинами. По умолчанию `null` — плагинов нет.
Путь — от корня проекта.

```ts
export default defineConfig({
    server: { plugins: 'server/plugins' },
})
```

```
server/plugins/
├── index.ts      # defineServerPlugins({ order })
├── cors.ts
└── helmet.ts
```

```ts
// server/plugins/index.ts
import { defineServerPlugins } from '@tusten/core/server'

export default defineServerPlugins({
    order: ['cors', 'helmet'],
})
```

- Сканируются `*.ts` и `*.js`; `index.ts`/`index.js` — только для порядка.
- Без `index.ts` плагины регистрируются по алфавиту; указанные в `order` идут
  первыми в заданном порядке, остальные — после них.
- Каждый файл default-экспортирует функцию Fastify-плагина
  `(fastify, opts) => Promise<void> | void`.
- Плагины регистрируются после сжатия и `/service`, но до API-роутов и SSR.
  Они могут добавлять декораторы, хуки и собственные роуты.
- Хук, добавленный в плагине, не действует на уже зарегистрированные `/service`
  и статику. Для защиты RPC используйте `server.rpc.extendContext` + `auth`
  у методов или прокси.

```ts
// server/plugins/cors.ts
import type { FastifyInstance } from 'fastify'

export default async function cors(fastify: FastifyInstance): Promise<void> {
    fastify.addHook('onSend', async (_request, reply, payload) => {
        reply.header('access-control-allow-origin', '*')
        return payload
    })
}
```

### `server.rpc`

Настройки JSON-RPC 2.0. `false` полностью отключает RPC: сканер
`**/*.meta.ts` / `*.meta.js` не запускается, endpoint не регистрируется.

```ts
export default defineConfig({
    server: { rpc: false },
})
```

```ts
export default defineConfig({
    server: {
        rpc: {
            enabled: true,
            url: '/service',
            describe: true,
        },
    },
})
```

| Поле            | По умолчанию | Назначение                                         |
| --------------- | ------------ | -------------------------------------------------- |
| `enabled`       | `true`       | Включён ли RPC и скан `**/*.meta.ts` / `*.meta.js` |
| `url`           | `'/service'` | URL endpoint'а (POST, одиночные и batch-запросы)   |
| `describe`      | `true`       | Встроенный `System.Describe` (см. «Ограничения»)   |
| `extendContext` | `undefined`  | Функция расширения `RpcContext` на каждый запрос   |

```ts
export default defineConfig({
    server: {
        rpc: {
            // Клиент должен ходить по тому же URL:
            // new Service({ url: '/rpc' })
            url: '/rpc',
            // db и readUser — ваши серверные зависимости.
            extendContext: async (req) => ({
                db,
                user: await readUser(req),
            }),
        },
    },
})
```

- `extendContext` вызывается на каждый HTTP-запрос к `/service` и на каждый
  SSR-вызов `Service.call` через встроенный executor. На SSR аргумент — не
  Fastify-запрос, а объект `{ headers }`, поэтому не завязывайтесь на методы
  `request`.
- Возвращённый объект мержится в `RpcContext`: именно так в handler'ах
  появляются `ctx.db`, `ctx.user` и другие расширения.
- Ошибка `extendContext` логируется и не роняет запрос: контекст остаётся
  пустым. Если от него зависит авторизация, проверяйте `ctx.user` в методе.
- `auth: true` у метода требует `ctx.user`; `auth: { roles: ['admin'] }` —
  одну из ролей в `ctx.user.roles`.
- `internal: true` доступен только через `ctx.call`, снаружи — `-32601`.
- `System.Describe` обрабатывается до поиска метода в реестре и возвращает
  список объектов и методов.

`Service` из `@tusten/core` по умолчанию ходит на `/service`. Если меняете
`server.rpc.url`, передавайте тот же URL в `Service` (и в `Service.call`).

### `server.compress`

Сжатие HTTP-ответов. Включено по умолчанию: brotli и gzip. `false` выключает
динамическое сжатие — например, когда сжимает прокси или CDN. Предсжатые
`.br`/`.gz` из сборки при этом продолжают отдаваться статикой.

```ts
export default defineConfig({
    server: {
        compress: {
            threshold: 1024,
            encodings: ['br', 'gzip'],
            ssr: true,
        },
    },
})
```

| Поле        | По умолчанию     | Назначение                                                          |
| ----------- | ---------------- | ------------------------------------------------------------------- |
| `threshold` | `1024`           | Минимальный размер тела в байтах; меньше — без сжатия               |
| `encodings` | `['br', 'gzip']` | Поддерживаемые кодировки в порядке предпочтения; только `br`/`gzip` |
| `ssr`       | `true`           | Сжимать ли стримируемый SSR-документ                                |

- `@fastify/compress` сжимает `/service`, API-роуты и статику.
- SSR-стрим и готовые HTML-тела (SPA-оболочка, 404, страницы ошибок) идут
  через встроенный zlib-пайплайн: SSR пишет в `reply.raw` в обход хуков
  Fastify.
- `ssr: false` оставляет сжатие API и статики, но отключает сжатие
  SSR-стрима. SPA-оболочка и 404 сжимаются независимо от флага.
- `threshold: 0` сжимает всё, включая мелкие ответы.
- Дубликаты кодировок удаляются; пустой массив и неизвестная кодировка —
  `TustenError`.
- Предсжатые `.br`/`.gz` из сборки и `@fastify/compress` не конфликтуют: уже
  сжатый ответ плагин не трогает.

## `middleware`

Глобальные middleware для клиента и сервера. Middleware конкретного маршрута
задаётся в `defineRoute` — см. [`Router.md`](Router.md).

```ts
export default defineConfig({
    middleware: [{ id: 'logger', handler: 'client/shared/middleware/logger', side: 'both' }],
})
```

```ts
import type { MiddlewareDef } from '@tusten/core'

interface MiddlewareDef {
    id: string
    handler: string
    params?: Record<string, unknown>
    side?: 'client' | 'server' | 'both'
}
```

| Поле      | Обязательно | Назначение                                                       |
| --------- | ----------- | ---------------------------------------------------------------- |
| `id`      | да          | Уникальный ключ для отладки, логов и порядка                     |
| `handler` | да          | Путь до модуля от корня проекта (`<file>:<export>` или `<file>`) |
| `params`  | нет         | Первый аргумент функции middleware                               |
| `side`    | нет         | `client` (по факту дефолт для глобальных), `server`, `both`      |

Правила выбора:

- **Глобальная middleware без `side`** попадает только в клиентскую цепочку.
  Чтобы она выполнялась и на сервере, укажите `side: 'server'` или
  `side: 'both'`.
- **`side: 'both'`** — файл может экспортировать `client` и `server`; каждая
  сторона возьмёт свою функцию. Если этих экспортов нет — используется
  default.
- **Клиентская сторона** берёт `export const client` или default-export.
  В `handler` для клиента указывайте путь до файла **без** `:export`: суффикс
  на клиенте не поддерживается.
- **Серверная сторона** при `handler: 'file:export'` берёт указанный экспорт;
  при `side: 'both'` и без суффикса — `export const server`; иначе default.
- Для middleware конкретного маршрута без `side` серверная сторона смотрит на
  путь: `client/*` — клиентская, остальные могут выполняться и на сервере.
  Для глобальных middleware это правило не действует: без `side` они только
  клиентские. Явный `side` у маршрута тоже учитывается.

Порядок и поведение:

- Цепочка: глобальные → унаследованные по `parentId` → локальные маршрута.
- Middleware выполняется последовательно. Возврат `{ redirect: '/path' }`
  останавливает цепочку; на сервере это HTTP-редирект, на клиенте — переход.
- Серверная middleware выполняется при SSR после загрузки глобальных слайсов и
  до prefetch страницы. Она получает `{ router, route, globalSlices }`.
- Клиентская middleware выполняется перед SPA-навигацией и `reload()`, но не
  при серверном рендере и не при первом SPA-заходе. Она получает `{ to, from }`.
- API-middleware (`ServerRoute.middleware`) — отдельный реестр: `side` там не
  используется, а `reply` в возврате останавливает цепочку.

```ts
// client/shared/middleware/logger.ts
export async function client(_params: Record<string, unknown>, ctx: { to: string }): Promise<void> {
    console.log('[nav]', ctx.to)
}

export async function server(_params: Record<string, unknown>, ctx: { router: { path: string } }): Promise<void> {
    console.log('[ssr]', ctx.router.path)
}
```

## `i18n`

Локализация клиентских модулей. Без секции фича выключена: `rk(key)`
возвращает ключ, `<html lang>` не рендерится.

```ts
export default defineConfig({
    i18n: {
        key: 'lang', // имя cookie, по умолчанию 'lang'
        defaultLocale: 'ru',
        locales: ['ru', 'en'],
    },
})
```

| Поле            | Обязательно | Правила                                                          |
| --------------- | ----------- | ---------------------------------------------------------------- |
| `defaultLocale` | да          | Обязан входить в `locales`; иначе `TustenError`                  |
| `locales`       | да          | Непустой массив кодов (`en`, `pt-BR`); дубликаты удаляются       |
| `key`           | нет         | Имя cookie по RFC 6265; по умолчанию `lang`; обрезается по краям |

- Невалидный locale (например, `../x`), пустой массив или `defaultLocale` вне
  списка — `TustenError` при загрузке конфига.
- Язык запроса: cookie `i18n.key` → `Accept-Language` → `defaultLocale`.
- `setLocale('en')` ставит cookie с именем из `i18n.key` и перезагружает
  страницу.
- Словари: `client/<Module>/lang/<locale>/<locale>.json`.
- Подробно — [`i18n.md`](i18n.md).

## `vite`

Мерж в Vite-конфигурацию dev-сервера и обеих сборок. Отдельный
`vite.config.ts` **не читается** (`configFile: false`) — всё, что нужно Vite,
опишите здесь.

```ts
import { defineConfig } from '@tusten/core'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
    vite: {
        plugins: [tailwindcss()],
        resolve: { tsconfigPaths: true },
        server: { proxy: { '/api/legacy': 'http://127.0.0.1:4000' } },
        define: { __APP_VERSION__: JSON.stringify('1.0.0') },
    },
})
```

Что фреймворк задаёт сам и переопределяет поверх пользовательского объекта:

- `root` — корень проекта, `configFile: false`, `appType: 'custom'`.
- `publicDir` — из `publicDir` конфига (в SSR-сборке — `false`).
- `plugins` — сначала плагин tusten, затем `@vitejs/plugin-react`, затем
  ваши плагины. Не добавляйте `@vitejs/plugin-react` повторно.
- `server.middlewareMode` — `true` в dev: HTTP-сервером владеет Fastify.
- `ssr.noExternal` / `optimizeDeps.exclude` — `@tusten/core` добавляется
  автоматически, ваши значения сохраняются.
- `resolve.preserveSymlinks` — `false`.
- `build.outDir`, `emptyOutDir`, `manifest`, `ssr`, `rollupOptions.input` и
  имена выходных файлов — задаются сборкой tusten. Ваш
  `vite.build.rollupOptions` не применяется: для дополнительной обработки
  бандла используйте Vite-плагин.

Ваши `define`, `resolve.alias`, `css`, `optimizeDeps` и остальные общие поля
работают и в dev, и в production-сборках. `server.proxy` — только dev: в
production проксированием занимается инфраструктура.

Алиасы из `tsconfig.json`:

```json
{
    "compilerOptions": {
        "paths": {
            "@/*": ["./client/*"],
            "@server/*": ["./server/*"]
        }
    }
}
```

```ts
export default defineConfig({
    vite: { resolve: { tsconfigPaths: true } },
})
```

Серверные загрузчики (конфиг, `router.ts`, `*.loader.ts`, RPC, middleware,
API) читают те же `paths` через `jiti`, поэтому `@/…` и `@server/…` работают
одинаково в редакторе, `tsc`, Vite и Node.

## `build`

Куда собирать production-артефакты. По умолчанию `dist` от корня проекта.

```ts
export default defineConfig({
    build: { outDir: 'build' },
})
```

```text
dist/
├── client/          # бандл, CSS, статика, .vite/manifest.json
└── server/
    └── entry.js     # SSR-бандл
```

- `tusten build` создаёт обе части; `tusten start` читает их из того же
  `outDir`. Меняя `outDir`, пересоберите проект — старый `dist` больше не
  используется.
- Клиентская сборка копирует `publicDir` в `dist/client`; SSR-сборка статику
  не дублирует.
- Manifest (`dist/client/.vite/manifest.json`) нужен production-серверу для
  CSS и URL entry-чанка. Без него CSS не подставится, а entry будет искаться
  по легаси-имени.
- Хэшированные имена ассетов позволяют кэшировать их на год; при изменении
  содержимого имя меняется.

## `runtimeConfig`

Поле зарезервировано под публичные переменные окружения. Значения
сохраняются в нормализованном конфиге (`config.runtimeConfig.public`), но в
текущей beta **не прокидываются** ни в клиентский бандл, ни в `window`, ни в
`RpcContext`.

```ts
export default defineConfig({
    runtimeConfig: {
        public: { apiUrl: 'https://api.example.com' },
    },
})
```

Пока используйте штатные механизмы:

- клиент — `import.meta.env.VITE_*` (Vite подставляет на сборке);
- сервер — `process.env.*` в серверном коде;
- конфиг — чтение `process.env` прямо в `tusten.config.ts` (например, `port`).

Не кладите в `runtimeConfig.public` секреты: по смыслу это публичные
значения, даже когда механизм появится.

## `fastify`

Прямой проброс опций в `Fastify(opts)`. По умолчанию используется
`{ logger: { level: 'info' } }`; переданный объект мержится поверх него
поверхностно — `logger` заменяется целиком.

```ts
export default defineConfig({
    fastify: {
        logger: false, // отключить логи
        trustProxy: true, // за прокси
        bodyLimit: 1_048_576, // 1 MiB на тело запроса
        disableRequestLogging: true,
    },
})
```

- `logger: false` — тихий сервер; `logger: { level: 'debug' }` — подробные
  логи Fastify.
- `trustProxy: true` нужен за reverse proxy, чтобы корректно работали
  `request.protocol`, `request.hostname` и `X-Forwarded-*`.
- `bodyLimit` важен для загрузки файлов и больших JSON-RPC-параметров.
- Опции применяются до регистрации плагинов, RPC, API и SSR.
- Это `FastifyServerOptions`; остальные поддерживаемые опции Fastify
  пробрасываются как есть.

## Полный пример

```ts
// tusten.config.ts
import { defineConfig } from '@tusten/core'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
    ssr: true,
    publicDir: 'public',

    client: {
        clientDir: 'client',
        css: ['styles/main.css'],
        root: {
            component: 'Page/Controller:Root',
            container: {
                tag: 'div',
                id: 'app',
                attributes: {
                    class: 'app-shell',
                    'data-theme': 'light',
                },
            },
        },
        components: {
            error: 'shared/ErrorBoundary:ErrorBoundary',
            loading: 'shared/Loading:Loading',
            notFound: 'shared/NotFound:NotFound',
        },
    },

    server: {
        serverDir: 'server',
        port: Number(process.env.PORT ?? 3000),
        host: process.env.HOST ?? 'localhost',
        routes: 'server/api/routes.ts',
        plugins: 'server/plugins',
        rpc: {
            enabled: true,
            url: '/service',
            describe: true,
            // db и readUser — ваши серверные зависимости.
            extendContext: async (req) => ({
                db,
                user: await readUser(req),
            }),
        },
        compress: {
            threshold: 1024,
            encodings: ['br', 'gzip'],
            ssr: true,
        },
    },

    middleware: [
        { id: 'logger', handler: 'client/shared/middleware/logger', side: 'both' },
        { id: 'auth', handler: 'server/middleware/auth', side: 'server' },
    ],

    i18n: {
        key: 'lang',
        defaultLocale: 'ru',
        locales: ['ru', 'en'],
    },

    vite: {
        plugins: [tailwindcss()],
        resolve: { tsconfigPaths: true },
    },

    build: {
        outDir: 'dist',
    },

    fastify: {
        logger: { level: 'info' },
        trustProxy: true,
    },
})
```

## Рецепты

### Tailwind v4

```ts
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
    client: { css: ['styles/main.css'] },
    vite: { plugins: [tailwindcss()] },
})
```

```css
/* client/styles/main.css */
@import 'tailwindcss';
```

### Алиасы `@/` и `@server/`

1. Опишите `compilerOptions.paths` в `tsconfig.json`.
2. Включите `vite.resolve.tsconfigPaths: true`.

```ts
export default defineConfig({
    vite: { resolve: { tsconfigPaths: true } },
})
```

### Переменные окружения

```ts
export default defineConfig({
    server: {
        port: Number(process.env.PORT ?? 3000),
        host: process.env.HOST ?? '127.0.0.1',
    },
    fastify: {
        trustProxy: process.env.NODE_ENV === 'production',
    },
})
```

Клиентские публичные переменные — через `import.meta.env.VITE_*`; серверные
секреты — только в серверном коде через `process.env`.

### Свой URL JSON-RPC

```ts
// tusten.config.ts
export default defineConfig({
    server: { rpc: { url: '/rpc' } },
})
```

```ts
// client/HomePage/Factories/usersList.ts
import { Service } from '@tusten/core'

const users = new Service({
    endpoint: 'Users',
    url: '/rpc',
    binding: { query: 'List' },
})
```

### SPA без SSR

```ts
export default defineConfig({ ssr: false })
```

Все страницы рендерятся на клиенте; сервер отдаёт оболочку, API, статику и
`/service`. Для конкретной страницы достаточно `route.ssr: false` в
`defineRoute` (нельзя одновременно с `index: true`).

### За прокси или в Docker

```ts
export default defineConfig({
    server: {
        host: '0.0.0.0',
        port: 3000,
        // compress: false, // если сжимает прокси/CDN
    },
    fastify: { trustProxy: true },
})
```

## Ограничения

- **Конфиг не перезагружается на лету.** Правка `tusten.config.ts` требует
  перезапуска `tusten dev`; для production — новой сборки.
- **`vite.config.ts` не читается.** Все настройки Vite — в поле `vite`.
- **`client.layouts` и `client.rootElement` удалены.** Загрузчик выведет
  warning и проигнорирует их. Layout задаётся в `defineRoute` через
  `route.layout`, контейнер — в `client.root.container`.
- **`runtimeConfig.public` пока не прокидывается в приложение.** Значения
  видны только в нормализованном конфиге.
- **`server.rpc.describe: false` в текущей beta не отключает
  `System.Describe`.** Флаг нормализуется, но встроенный метод продолжает
  отвечать. Не используйте его как защиту: закрывайте `/service` через
  `auth` у методов, `extendContext`/`user` или на уровне прокси/Fastify-плагина.
- **Серверная middleware не выполняется при SPA-навигации.** В браузере
  работает клиентская цепочка; если она вернула `redirect`, переход уйдёт на
  новый URL.
- **Клиентская middleware не выполняется при SSR.** При первом заходе в
  режиме `ssr: false` она тоже не запускается: middleware работает только на
  SPA-навигации и `reload()`.
- **Глобальная middleware без `side` работает только на клиенте.** Для сервера
  явно указывайте `side: 'server'` или `side: 'both'`. В `handler` клиентской
  middleware не используйте суффикс `:export`.
- **`fastify` мержится поверхностно.** `logger`, `https` и другие вложенные
  объекты заменяются целиком, а не глубоко мержатся.
- **`vite.build.rollupOptions` переопределяется сборкой.** Для нестандартной
  обработки используйте Vite-плагин, а не rollup-опции в конфиге.
- **`index: true` + `ssr: false` в маршруте — ошибка сборки.** Индексная
  страница не может быть SPA-only.
- **`/service` — не защита.** Авторизация методов — через `auth` и
  `extendContext`; транспорт можно прикрыть прокси/плагином.
- **Конфиг — не хранилище секретов.** Он читается на сервере, но значения
  `runtimeConfig.public`, `vite.define` и клиентский бандл видны в браузере.

## Частые ошибки

| Симптом                                                     | Причина / что делать                                                                                |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `Config not found: expected "tusten.config.ts"`             | Файла нет в текущем рабочем каталоге; запустите команду из корня проекта                            |
| `Config at … must export a default object`                  | Нет `export default`, экспортирован `null`/массив/функция                                           |
| Правки конфига не применяются                               | `tusten dev` уже запущен; конфиг читается один раз — перезапустите команду                          |
| Tailwind не подключается                                    | Плагин добавлен в `vite.config.ts`, а не в `vite.plugins`; добавьте `tailwindcss()` в конфиг tusten |
| `publicDir must be a non-empty path or false`               | Пустая строка или не-строка в `publicDir`                                                           |
| `i18n.defaultLocale "…" must be one of i18n.locales`        | `defaultLocale` не входит в `locales`                                                               |
| `i18n.key must be a valid cookie name`                      | Недопустимые символы/пробелы в имени cookie                                                         |
| `client.root.container.tag` / `event handler … not allowed` | Запрещённый тег или `on*` в `attributes`; используйте React-компоненты                              |
| `server.routes not found`                                   | `server.routes` указывает на файл от корня проекта; проверьте путь и расширение                     |
| `/service` → 404                                            | `rpc: false`, неверный `rpc.url` или клиент `Service` ходит на другой URL                           |
| RPC-метод не найден                                         | Объект лежит не в `serverDir/**/*.meta.ts` / `*.meta.js` или RPC выключен                           |
| `ctx.db` / `ctx.user` равен `undefined`                     | Не настроен `server.rpc.extendContext` или он упал (смотрите лог)                                   |
| Middleware не выполняется на сервере                        | У глобальной middleware не указан `side: 'server'` / `'both'`                                       |
| 404 после production-сборки                                 | `tusten build` не выполнен или `build.outDir` изменён без пересборки                                |
| CSS не подставился в production                             | Нет `dist/client/.vite/manifest.json`; пересоберите проект                                          |
| `localhost` не открывается на Windows                       | Используйте `http://127.0.0.1:3000`                                                                 |
| `EADDRINUSE`                                                | Порт занят: измените `server.port` или остановите другой процесс                                    |

## Справочник значений по умолчанию

### Верхний уровень

| Поле                   | Тип                       | По умолчанию |
| ---------------------- | ------------------------- | ------------ |
| `ssr`                  | `boolean`                 | `true`       |
| `publicDir`            | `string \| false`         | `'public'`   |
| `client`               | объект                    | `{}`         |
| `server`               | объект                    | `{}`         |
| `middleware`           | `MiddlewareDef[]`         | `[]`         |
| `i18n`                 | объект \| не задан        | выключено    |
| `vite`                 | `UserConfig`              | `{}`         |
| `build.outDir`         | `string`                  | `'dist'`     |
| `runtimeConfig.public` | `Record<string, unknown>` | `{}`         |
| `fastify`              | `FastifyServerOptions`    | `{}`         |

### `client`

| Поле                        | По умолчанию                 |
| --------------------------- | ---------------------------- |
| `clientDir`                 | `'client'`                   |
| `css`                       | `[]`                         |
| `root.component`            | `null` (без обёртки)         |
| `root.container.tag`        | `'div'`                      |
| `root.container.id`         | `'root'`                     |
| `root.container.attributes` | `{}`                         |
| `components.error`          | `null` → `RootErrorBoundary` |
| `components.loading`        | `null` → `RootLoading`       |
| `components.notFound`       | `null` → `RootNotFound`      |

### `server`

| Поле                | По умолчанию                                                |
| ------------------- | ----------------------------------------------------------- |
| `serverDir`         | `'server'`                                                  |
| `port`              | `3000`                                                      |
| `host`              | `'localhost'`                                               |
| `routes`            | `null`                                                      |
| `plugins`           | `null`                                                      |
| `rpc.enabled`       | `true`                                                      |
| `rpc.url`           | `'/service'`                                                |
| `rpc.describe`      | `true`                                                      |
| `rpc.extendContext` | `undefined`                                                 |
| `compress`          | `{ threshold: 1024, encodings: ['br', 'gzip'], ssr: true }` |
| `compress: false`   | сжатие выключено                                            |

### `i18n`

| Поле            | По умолчанию                |
| --------------- | --------------------------- |
| `key`           | `'lang'`                    |
| `defaultLocale` | обязателен                  |
| `locales`       | обязателен, непустой массив |

## Чек-лист

- [ ] `tusten.config.ts` лежит в корне проекта и имеет `export default`.
- [ ] Пути в `client.*` заданы от `clientDir` без `./`.
- [ ] `server.routes` указывает на файл, `server.plugins` — на каталог.
- [ ] Для глобальной middleware, нужной на сервере, указан `side`.
- [ ] `i18n.defaultLocale` входит в `i18n.locales`.
- [ ] В `client.root.container.attributes` нет `on*`, `id` и `data-tusten-root`.
- [ ] URL в `Service` совпадает с `server.rpc.url`.
- [ ] `server.rpc.extendContext` наполняет `ctx.user`/`ctx.db`, если они нужны методам.
- [ ] Vite-плагины (Tailwind и др.) лежат в `vite.plugins`, а не в отдельном `vite.config.ts`.
- [ ] После изменения `build.outDir` проект пересобран.
- [ ] В production проверены порт/хост, `fastify.trustProxy` и сжатие.
- [ ] Секретов нет в `runtimeConfig.public`, `vite.define` и клиентском коде.
