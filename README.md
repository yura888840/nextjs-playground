# nextjs-playground

Учебное приложение на Next.js App Router, React и JavaScript: одна страница с интерактивным счётчиком и адаптивными стилями.

## Требования

Node.js 22+ и npm.

## Локальный запуск

```sh
npm ci
npm run dev
```

Откройте http://localhost:3000. Счётчик работает в браузере и сбрасывается при перезагрузке.

## Production-сборка

```sh
npm run build
```

В `next.config.mjs` установлен `output: 'export'`. Готовый сайт находится в `out/`: содержимое этого каталога можно разместить на статическом хостинге. Node.js нужен для разработки и сборки; опубликованная версия не содержит работающего Node.js-сервера, API или базы данных.

Для локальной проверки статической сборки, если установлен Python:

```sh
python3 -m http.server 3000 --directory out
```

## Структура

- `app/page.js` — страница и клиентский счётчик.
- `app/layout.js` — общий layout и метаданные.
- `app/globals.css` — адаптивные стили.
- `app/icon.svg` — иконка приложения.
- `next.config.mjs` — конфигурация статического экспорта.

## Следующий шаг: серверный режим

Для использования API и других серверных возможностей удалите `output: 'export'` из `next.config.mjs`, затем выполните `npm run build` и `npm start` на хостинге с поддержкой Node.js. В текущем режиме статического экспорта `npm start` не используется.

## Автоматический деплой: GitHub Pages

Workflow `.github/workflows/deploy-pages.yml` проверяет сборку в pull request и публикует `out/` после push/merge в `main`. Также доступен ручной запуск: **Actions → Build and deploy to GitHub Pages → Run workflow** (ветка `main`). Из PR и других веток публикация не выполняется.

### Однократная настройка перед первым деплоем

1. Откройте [Settings → Pages](https://github.com/yura888840/nextjs-playground/settings/pages).
2. В разделе **Build and deployment → Source** выберите **GitHub Actions**.
3. Слейте PR с workflow в `main`. Если PR уже слит, запустите workflow вручную.
4. Дождитесь успешного задания `deploy` во вкладке Actions.

После успешной публикации сайт будет доступен по адресу:
https://yura888840.github.io/nextjs-playground/

GitHub Pages бесплатен для этого публичного репозитория. Отдельный аккаунт хостинга и пользовательские секреты не нужны: используются встроенные `GITHUB_TOKEN` и OIDC. Сайт будет публичным.

Workflow задаёт `NEXT_PUBLIC_BASE_PATH=/nextjs-playground`, чтобы JavaScript, CSS и ссылки корректно работали в подпапке GitHub Pages. Локальный `npm run dev` по-прежнему открывается в корне `http://localhost:3000`. При переименовании репозитория обновите путь в workflow; для собственного домена в корне уберите эту переменную.

GitHub Pages раздаёт только статические файлы и не запускает Node.js, SSR или серверные API. При переходе на серверный режим потребуется другой хостинг и другой workflow.

Документация: [GitHub Pages workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages), [Next.js basePath](https://nextjs.org/docs/app/api-reference/config/next-config-js/basePath).
