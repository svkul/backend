# Аутентифікація та авторизація

## Мета

Цей документ описує поточну реалізацію: OAuth (Google) на бекенді, JWT access token, refresh-сесії в PostgreSQL (хеш токена), rotation з захистом від reuse, та як клієнт має викликати API.

## Базові принципи

- Логін через Google виконується на бекенді (Passport); клієнт лише відкриває `GET /auth/google` у браузері.
- **Access token** — JWT (`HS256`) з полями **`iss`** і **`aud`**; час життя задається **`JWT_ACCESS_TTL`** (див. `docs/config.md`).
- **Refresh token** — непрозорий випадковий рядок; у БД зберігається лише **SHA-256 хеш** (`Session.tokenHash`, унікальний індекс).
- **Rotation**: при кожному успішному `POST /auth/refresh` стара сесія атомарно відкликається в транзакції, видається нова пара токенів. Повторне використання вже відкликаного refresh → **reuse detection** (відкликання активних сесій користувача, `401`).
- Після логіну через Google callback бекенд виставляє **HttpOnly cookies** `accessToken` та **`refreshToken`** (camelCase; **не** `refresh_token`).
- Для **web** і **mobile** один ендпоінт refresh/logout: refresh-токен береться з **`Authorization: Bearer <refresh>`** або з cookie **`refreshToken`**. Якщо передано обидва, пріоритет у **Bearer** (зручно для mobile поверх cookie).

## Терміни

- **Access token**: JWT, TTL з **`JWT_ACCESS_TTL`** (у `.env.example` за замовчуванням короткий інтервал для dev; у production зазвичай `15m` тощо).
- **Refresh token**: довгоживучий opaque токен; sliding TTL залежить від **`Session.client`** (`web` | `ios` | `android`) — **`REFRESH_TOKEN_TTL_WEB`** / **`REFRESH_TOKEN_TTL_MOBILE`**; верхня межа ланцюга refresh — **`REFRESH_TOKEN_ABSOLUTE_MAX`** (`Session.absoluteExpiresAt`).
- **Session**: `tokenHash`, `expiresAt`, `absoluteExpiresAt`, `client`, `revoked`, `revokedAt`, опційно `userAgent`, `ip`, `deviceId`.
- **Device**: прив’язка до користувача; для web OAuth зараз створюється/оновлюється device з `platform: web`.
- **AuthEvent**: таблиця аудиту (типи на кшталт `login_success`, `refresh`, `refresh_fail`, `reuse_detected`, `logout`, `logout_all`); записи не повинні ламати основні флоу при збоях БД.

## Ендпоінти

### Початок OAuth (Google)

- **`GET /auth/google`**  
  Redirect на Google. З клієнта: `window.location.href = <API_ORIGIN>/auth/google` (або еквівалент).

### OAuth callback (Google)

- **`GET /auth/google/callback`**  
  Після успіху Passport:
  - upsert **`User`** + **`Account`** (`provider`, `providerAccountId`);
  - знайти/оновити або створити **`Device`**;
  - створити **`Session`** (новий refresh, `client` для web);
  - встановити cookies **`accessToken`** та **`refreshToken`** (HttpOnly, `secure` у production, **`sameSite: 'lax'`**);
  - опційно атрибут **`Domain`** з **`COOKIE_DOMAIN`** (наприклад `.example.com`), якщо змінна непорожня — потрібно для того, щоб браузер надсилав ті самі cookies і на **`app`**, і на **`api`** піддомен;
  - **`redirect`** на **`{FRONTEND_URL}/auth/callback`** (див. `web.frontendUrl` / `FRONTEND_URL`).

Шляхи cookies: `accessToken` — **`path: '/'`**; **`refreshToken`** — **`path: '/auth'`** (надсилається на всі шляхи під **`/auth/*`**, зокрема **`POST /auth/refresh`** і **`POST /auth/logout`**).

### Поточний користувач

- **`GET /auth/me`**  
  Потребує access JWT у **`Authorization: Bearer <accessToken>`** або в HttpOnly cookie **`accessToken`** (web). Повертає **`{ user: { id, email, name, avatarUrl } }`**.

### Оновлення токенів (rotation)

- **`POST /auth/refresh`**  
  Refresh з **`Authorization: Bearer`** (mobile) або з cookie **`refreshToken`** (web, `credentials: 'include'`).  
  Повертає JSON **`{ accessToken, refreshToken }`** і виставляє **`Set-Cookie`** для **`accessToken`** / **`refreshToken`** (оновлення HttpOnly пари після rotation).  
  Під **`@Throttle`** (чутливий ліміт); див. глобальний throttler у `AppModule`.

### Logout

- **`POST /auth/logout`**  
  Якщо є refresh (Bearer або cookie **`refreshToken`**) — ревокує поточну сесію за хешем; якщо refresh відсутній (наприклад зламаний стан після 401) — все одно очищає auth-cookies у відповіді. Завжди **`Set-Cookie`** з очищенням **`accessToken`** / **`refreshToken`**. Тіло **`{ ok: true }`**.

- **`POST /auth/logout-all`**  
  Потребує access JWT (Bearer або cookie **`accessToken`**). Ревокує всі сесії користувача, очищає auth-cookies у відповіді. У аудит передаються **`User-Agent`** та IP з запиту.

### Допоміжний захищений маршрут

- **`POST /auth/protected`**  
  Потребує access JWT у **`Authorization: Bearer`** або в cookie **`accessToken`**.

### Liveness (не auth)

- **`GET /healthz`** — **`{ ok: true }`**; без throttling (`@SkipThrottle`). Для Railway healthcheck.

## Обмеження та плани

- **Mobile OAuth (PKCE)**, **`POST /auth/mobile/.../exchange`** у цьому репозиторії ще не реалізовані — refresh уже підтримує Bearer для майбутнього mobile.
- **BFF Next.js** (`/api/auth/*`) не використовується: Next ходить на API напряму з **`credentials: 'include'`**; для SSR на домені **`app`** браузер має надсилати ті самі cookies, що й на **`api`** — у production зазвичай **`COOKIE_DOMAIN`** на parent-домені (див. `Docs/auth-solution.md`).

## Інтеграція фронтенду (коротко)

- Редірект на **`<API_URL>/auth/google`**.
- Після логіну — сторінка **`/auth/callback`** на **`FRONTEND_URL`** (може просто редіректнути в застосунок).
- Запити до API з cookies: **`fetch(..., { credentials: 'include' })`**, CORS має дозволяти origin фронту та **`credentials: true`** (див. `web.corsOrigins`).
- Захищені маршрути в браузері: достатньо HttpOnly **`accessToken`** (JWT guard читає Bearer або cookie); mobile може лишатися на **`Authorization: Bearer`**.
