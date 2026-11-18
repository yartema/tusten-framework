# create-tusten-app

Скаффолдер приложения на [tusten](https://github.com/yartema/tusten-framework) — React 19 + Fastify + Vite с SSR.

```bash
npm create tusten-app@latest my-app
pnpm create tusten-app my-app
yarn create tusten-app my-app
bun create tusten-app my-app
```

В текущую папку:

```bash
npx create-tusten-app .
```

## Что спрашивает

| Вопрос                                  | По умолчанию |
| --------------------------------------- | ------------ |
| Куда создать проект (имя папки или `.`) | —            |
| Tailwind CSS                            | да           |
| ESLint                                  | да           |
| Prettier                                | да           |
| Пакетный менеджер                       | pnpm         |
| Установить зависимости                  | да           |
| `git init` + первый коммит              | нет          |

## Что внутри шаблона

- SSR/SPA на Vite + Fastify, файловый роутинг и layout;
- **JSON-RPC включён по умолчанию**: объект `App` в `server/app/App.meta.ts`, клиентский вызов через `Service` в `client/Page/Factories/appInfo.ts`. Данные загружаются до рендера (SSR prefetch), на сервере вызов идёт напрямую в handler, в браузере — `POST /service`;
- `public/` — статика с корня сайта, сжатие ответов (brotli/gzip) включено;
- Tailwind / ESLint / Prettier — опционально (по умолчанию да).

## Флаги

```text
--tailwind / --no-tailwind
--eslint / --no-eslint
--prettier / --no-prettier
--pm <pnpm|npm|yarn|bun>
--install / --no-install
--git / --no-git
--core <spec>        версия или file:-спека @tusten/core
-y, --yes            все ответы по умолчанию
--force              писать в непустую папку / перезаписывать файлы
-h, --help
-v, --version
```

В non-TTY (CI) нужен `--yes` или все флаги явно — иначе скаффолдер завершится ошибкой, чтобы не создать проект «наугад».

## Локальная проверка до публикации

По умолчанию в generated `package.json` попадает точная версия `@tusten/core` (та же, что у скаффолдера). Пока эта версия не опубликована, можно указать локальную сборку:

```bash
pnpm --filter @tusten/core build
node packages/create-tusten-app/bin/create-tusten-app.mjs my-app \
  --core file:packages/tusten \
  --no-install --no-git
```

`--core` принимает любой npm-spec: версию, `file:`, git-URL.

## Разработка

```bash
pnpm --filter create-tusten-app build     # dist/index.js
node packages/create-tusten-app/bin/create-tusten-app.mjs --help
```

Шаблоны лежат в `templates/basic`:

- `base` — обязательные файлы;
- `tailwind` — оверлей поверх base;
- `eslint` / `eslint-prettier` — конфиг линтера;
- Prettier-конфиги генерируются в коде (`src/plan.ts`), потому что зависят от комбинации ответов.

Версии зависимостей для generated app берутся из `packages/tusten/package.json` (peer-зависимости и версия ядра) и корневого `package.json` (инструменты) в момент сборки — см. `src/versions.ts`.
