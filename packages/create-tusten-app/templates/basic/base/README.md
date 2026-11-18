# {{PROJECT_NAME}}

Приложение на [tusten](https://github.com/yartema/tusten-framework) — React 19 + Fastify + Vite с SSR и файловым роутингом.

## Требования

- Node.js 20+
- Один из пакетных менеджеров: pnpm, npm, yarn или bun

## Запуск

```bash
{{INSTALL_COMMAND}}
{{DEV_COMMAND}}
```

Откройте http://127.0.0.1:3000.

## Скрипты

- `dev` — dev-сервер: Fastify + Vite, HMR, dev-оверлей ошибок;
- `build` — сборка клиента и сервера в `dist`;
- `start` — запуск production-сборки;
- `inspect` — дамп маршрутов, RPC, i18n и манифеста;
- `typecheck` — проверка типов без сборки;
{{EXTRA_SCRIPTS}}

## Что внутри

{{TOOLS}}

```
client/
  layouts/Main.tsx    # общий layout
  Page/
    Factories/
      Root.ts         # getConfig: карта фабрик страницы
      appInfo.ts      # Slice + Service.call('Info')
    router.ts         # маршрут (defineRoute)
    view.tsx          # компонент страницы
  styles/main.css     # глобальные стили
public/
  robots.txt          # статика с корня сайта (Vite dev + dist/client)
server/
  app/App.meta.ts     # JSON-RPC объект App (метод Info)
tusten.config.ts      # конфигурация приложения
```

- Маршрут объявлен в `client/Page/router.ts`; `index: true` делает его главной страницей (`/`).
- Layout задаётся в маршруте (`layout: 'layouts/Main'`), а не в конфиге.
- **JSON-RPC включён** (`server.rpc`): объект `App` лежит в `server/app/App.meta.ts`, клиент вызывает его через `Service` (`client/Page/Factories/appInfo.ts`). На SSR вызов идёт напрямую в handler без HTTP, в браузере — `POST /service`.
- `client/Page/Factories/Root.ts` — `getConfig` страницы; его фабрики грузятся до рендера и на SSR, и при SPA-переходе, поэтому данные уже есть в HTML при первом заходе.
- Алиасы `@/…` → `client/` и `@server/…` → `server/` заданы в `tsconfig.json` (`compilerOptions.paths`) и включены для Vite через `resolve.tsconfigPaths`, поэтому вместо `../../` можно писать `@/shared/Button`.
- `public/` — статика рядом с `client/` и `server/`: в dev её отдаёт Vite, при сборке она копируется в `dist/client`. Путь меняется через `publicDir` в `tusten.config.ts` (`false` — отключить).
- HTTP-ответы сжаты по умолчанию (brotli/gzip): `@fastify/compress` для API/статики и встроенный zlib для SSR. Если сжимает прокси — `server.compress: false`.

## Tailwind CSS

{{TAILWIND_NOTE}}

## Дальше

- `client/<Page>/router.ts` — добавить страницу;
- `server/<Object>.meta.ts` — добавить JSON-RPC метод (`defineObject`, `ctx.call` для композиции);
- `client/<Page>/Factories/*` и `prefetchConfig` — загрузить данные и слайсы;
- `i18n` в `tusten.config.ts` — словари `client/<Module>/lang/<locale>/<locale>.json`.

Документация фреймворка: [README](https://github.com/yartema/tusten-framework#readme).
