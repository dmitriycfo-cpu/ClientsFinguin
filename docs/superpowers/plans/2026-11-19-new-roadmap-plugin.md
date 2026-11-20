# Плагин «Новая дорожная карта» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Руководитель FINGUIN командой `/new-roadmap` создаёт дорожную карту клиента (репозиторий `finguin-agency/roadmap-<имя>`, база Neon, сайт в команде Vercel `finguin`), а `/update-roadmaps` подтягивает в свои карты свежий код главной версии.

**Architecture:** Главная версия (`dikushinwork-code/ClientsFinguin`) получает workflow выкладки и скрипт `provision.mjs`, спящие без переменной `ROADMAP_DEPLOY=on`. Плагин Claude Code в `finguin-agency/claude-plugins` — два коротких навыка и Node-скрипты поверх `gh`/`git`. Ключи Vercel и Neon кладёт в репозиторий клиента раздатчик `vercel-key.yml` шаблона ФинПанели.

**Tech Stack:** Node 22+ (ESM `.mjs`), GitHub CLI `gh`, GitHub Actions, Vercel REST API + `vercel@64.5.0`, Neon API v2, Next.js 16 / vitest 5 / pnpm 11 (главная версия), `node:test` (плагин).

**Spec:** `docs/superpowers/specs/2026-11-19-new-roadmap-plugin-design.md`

## Global Constraints

- Организация GitHub: `finguin-agency`. Главная версия: `https://github.com/dikushinwork-code/ClientsFinguin.git`, ветка `main`.
- Команда Vercel: `team_akTxAWwlKEzPST0M3rGEwqWF`. Организация Neon: `org-aged-dawn-08889557`, регион `aws-eu-central-1`.
- Имя карты: `roadmap-<slug>`, slug — `^[a-z0-9][a-z0-9-]{1,38}$`, без `-` в конце. Одно имя на репозиторий, проект Vercel и проект Neon.
- Темы репозитория: `roadmap` и `lead-<логин GitHub строчными>`.
- Переменные репозитория клиента: `VERCEL_ORG_ID`, `NEON_ORG_ID`, `CLIENT_NAME`, `CONTROL_PASSWORD`, `ROADMAP_DEPLOY=on`. Секреты: `VERCEL_TOKEN`, `NEON_API_KEY` (кладёт раздатчик).
- Значения ключей и строки подключения не печатаются никогда.
- Весь текст для пользователя (вывод скриптов, навыки, README) — по-русски.
- Раздатчик: `finguin-agency/finpanel`, `.github/workflows/vercel-key.yml`.

## Файлы

Главная версия (`/Users/artyom/Desktop/claud/Finguin/Дорожные карты`, ветка `feature/new-roadmap` от `origin/main`):
- Modify `lib/default-data.ts` — `initialData()`; Create `lib/default-data.test.ts`.
- Modify `lib/store.ts:182,196-197` — стартовые данные через `initialData()`.
- Create `scripts/provision.mjs`, `scripts/provision.test.mjs`.
- Create `.github/workflows/deploy.yml`. Modify `README.md` — раздел «Карта для нового клиента».

Шаблон ФинПанели (`/Users/artyom/Desktop/claud/SoftTemplate`):
- Modify `.github/workflows/vercel-key.yml` — параметр `neon`. Секрет `NEON_API_KEY`.

Плагин (`/Users/artyom/Desktop/claud/Finguin/claude-plugins`, новый репозиторий `finguin-agency/claude-plugins`):
- `package.json`, `README.md`, `.claude-plugin/marketplace.json`
- `plugins/roadmap/.claude-plugin/plugin.json`
- `plugins/roadmap/scripts/config.mjs`, `lib.mjs`, `lib.test.mjs`, `new-roadmap.mjs`, `update-roadmaps.mjs`
- `plugins/roadmap/skills/new-roadmap/SKILL.md`, `plugins/roadmap/skills/update-roadmaps/SKILL.md`

---

### Task 1: Название клиента в стартовых данных (главная версия)

**Files:**
- Modify: `lib/default-data.ts` (дописать в конец)
- Modify: `lib/store.ts` (импорт; строки ~182 и ~196-197)
- Test: `lib/default-data.test.ts`

**Interfaces:**
- Produces: `initialData(clientName?: string): DashboardData` — копия `DEFAULT_DATA`, `clientName` из аргумента или `process.env.CLIENT_NAME`.

- [ ] **Step 0: Ветка**

```bash
cd "/Users/artyom/Desktop/claud/Finguin/Дорожные карты"
git fetch origin
git switch -c feature/new-roadmap origin/main
```
Изменённый `next-env.d.ts` не коммитить (его переписывает `next dev`).

- [ ] **Step 1: Падающий тест** — `lib/default-data.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_DATA, initialData } from "./default-data";

describe("initialData", () => {
  it("подставляет название клиента", () => {
    expect(initialData("Ромашка").clientName).toBe("Ромашка");
  });

  it("без названия оставляет заглушку", () => {
    expect(initialData(undefined).clientName).toBe(DEFAULT_DATA.clientName);
    expect(initialData("   ").clientName).toBe(DEFAULT_DATA.clientName);
  });

  it("обрезает до 160 символов и не меняет DEFAULT_DATA", () => {
    expect(initialData("я".repeat(200)).clientName).toHaveLength(160);
    initialData("Ромашка").tasks.pop();
    expect(DEFAULT_DATA.clientName).toBe("Название клиента");
    expect(initialData(undefined).tasks).toHaveLength(DEFAULT_DATA.tasks.length);
  });
});
```

- [ ] **Step 2:** `pnpm vitest run lib/default-data.test.ts` → FAIL (`initialData` is not a function / not exported).

- [ ] **Step 3: Реализация** — в конец `lib/default-data.ts`:

```ts
/** Стартовые данные новой карты: название клиента — из CLIENT_NAME (ставит /new-roadmap). */
export function initialData(clientName: string | undefined = process.env.CLIENT_NAME): DashboardData {
  const data = structuredClone(DEFAULT_DATA);
  const name = clientName?.trim();
  if (name) data.clientName = name.slice(0, 160);
  return data;
}
```

В `lib/store.ts`: импорт `import { DEFAULT_DATA, initialData } from "./default-data";`; в `getDashboardData()` заменить `const seed = JSON.stringify(DEFAULT_DATA);` на `const seed = JSON.stringify(initialData());`, а ветку локального файла на:

```ts
  } catch {
    const seed = initialData();
    await fs.mkdir(path.dirname(localDataPath), { recursive: true });
    await fs.writeFile(localDataPath, JSON.stringify(seed, null, 2), "utf8");
    return seed;
  }
```

- [ ] **Step 4:** `pnpm test` → все тесты PASS.
- [ ] **Step 5: Commit**

```bash
git add lib/default-data.ts lib/default-data.test.ts lib/store.ts
git commit -m "Название клиента в стартовых данных из CLIENT_NAME"
```

---

### Task 2: Скрипт подготовки проекта `scripts/provision.mjs` (главная версия)

**Files:**
- Create: `scripts/provision.mjs`
- Test: `scripts/provision.test.mjs` (vitest подхватывает `*.test.mjs`)

**Interfaces:**
- Produces: `provision({ repo, team, neonOrg, vercelToken, neonKey, clientName, controlPassword, fetch?, sleep? }) → Promise<{ code: 0|1, projectId?: string, message: string }>`; `ensureNeonDatabase({ name, org, key, fetch, sleep }) → Promise<string>` (строка через пул); `siteAddress({ projectId, team, token, fetch }) → Promise<string>` (`https://…`). CLI: `node scripts/provision.mjs` (пишет `VERCEL_PROJECT_ID` в `$GITHUB_ENV`), `node scripts/provision.mjs --address` (печатает `Адрес сайта: https://…`).

- [ ] **Step 1: Падающий тест** — `scripts/provision.test.mjs`:

```js
import { describe, expect, it } from "vitest";
import { ensureNeonDatabase, provision, siteAddress } from "./provision.mjs";

const POOLED = "postgresql://neondb_owner:p@ep-x-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require";

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url, init = {}) => {
    const u = new URL(url);
    const key = `${init.method || "GET"} ${u.host}${u.pathname}`;
    calls.push({ key, query: u.search, body: init.body ? JSON.parse(init.body) : undefined });
    const route = routes[key];
    if (!route) return new Response(JSON.stringify({ error: `нет маршрута ${key}` }), { status: 404 });
    const [status, data] = typeof route === "function" ? route(calls) : route;
    return new Response(JSON.stringify(data), { status });
  };
  fn.calls = calls;
  return fn;
}

const base = {
  repo: "roadmap-romashka",
  team: "team_1",
  neonOrg: "org-1",
  vercelToken: "vt",
  neonKey: "nk",
  clientName: "Ромашка",
  controlPassword: "pass12345678",
  sleep: async () => {},
};

describe("provision", () => {
  it("создаёт проект Vercel и базу Neon, ставит три переменные", async () => {
    const fetch = fakeFetch({
      "GET api.vercel.com/v9/projects/roadmap-romashka": [404, {}],
      "POST api.vercel.com/v11/projects": [200, { id: "prj_1", name: "roadmap-romashka" }],
      "GET api.vercel.com/v9/projects/prj_1/env": [200, { envs: [] }],
      "GET console.neon.tech/api/v2/projects": [200, { projects: [] }],
      "POST console.neon.tech/api/v2/projects": [201, { project: { id: "neon_1", name: "roadmap-romashka" } }],
      "GET console.neon.tech/api/v2/projects/neon_1/connection_uri": [200, { uri: POOLED }],
      "POST api.vercel.com/v10/projects/prj_1/env": [201, { created: [] }],
    });
    const result = await provision({ ...base, fetch });
    expect(result.code).toBe(0);
    expect(result.projectId).toBe("prj_1");
    const created = fetch.calls.find((c) => c.key === "POST api.vercel.com/v11/projects");
    expect(created.body).toEqual({ name: "roadmap-romashka", framework: "nextjs" });
    const neon = fetch.calls.find((c) => c.key === "POST console.neon.tech/api/v2/projects");
    expect(neon.body).toEqual({ project: { name: "roadmap-romashka", region_id: "aws-eu-central-1", org_id: "org-1" } });
    const env = fetch.calls.find((c) => c.key === "POST api.vercel.com/v10/projects/prj_1/env");
    expect(env.body.map((e) => e.key).sort()).toEqual(["CLIENT_NAME", "CONTROL_PASSWORD", "DATABASE_URL"]);
    expect(env.body.find((e) => e.key === "DATABASE_URL").value).toBe(POOLED);
    expect(env.body.every((e) => e.type === "encrypted" && e.target[0] === "production")).toBe(true);
    expect(result.message).not.toContain("neondb_owner");
  });

  it("ничего не трогает, если проект и переменные уже есть", async () => {
    const fetch = fakeFetch({
      "GET api.vercel.com/v9/projects/roadmap-romashka": [200, { id: "prj_1" }],
      "GET api.vercel.com/v9/projects/prj_1/env": [200, { envs: [{ key: "DATABASE_URL" }, { key: "CONTROL_PASSWORD" }, { key: "CLIENT_NAME" }] }],
    });
    const result = await provision({ ...base, neonKey: undefined, fetch });
    expect(result.code).toBe(0);
    expect(fetch.calls.map((c) => c.key)).toEqual([
      "GET api.vercel.com/v9/projects/roadmap-romashka",
      "GET api.vercel.com/v9/projects/prj_1/env",
    ]);
  });

  it("стоп: проект связан с Git", async () => {
    const fetch = fakeFetch({ "GET api.vercel.com/v9/projects/roadmap-romashka": [200, { id: "prj_1", link: { type: "github" } }] });
    const result = await provision({ ...base, fetch });
    expect(result.code).toBe(1);
    expect(result.message).toContain("связан с GitHub");
  });

  it("стоп: ключ Vercel не принят", async () => {
    const fetch = fakeFetch({ "GET api.vercel.com/v9/projects/roadmap-romashka": [403, {}] });
    expect((await provision({ ...base, fetch })).message).toContain("VERCEL_TOKEN");
  });

  it("стоп: нет базы и нет ключа Neon", async () => {
    const fetch = fakeFetch({
      "GET api.vercel.com/v9/projects/roadmap-romashka": [200, { id: "prj_1" }],
      "GET api.vercel.com/v9/projects/prj_1/env": [200, { envs: [] }],
    });
    const result = await provision({ ...base, neonKey: "", fetch });
    expect(result.code).toBe(1);
    expect(result.message).toContain("NEON_API_KEY");
  });

  it("стоп: имя репозитория не roadmap-…", async () => {
    expect((await provision({ ...base, repo: "ClientsFinguin", fetch: fakeFetch({}) })).code).toBe(1);
  });
});

describe("ensureNeonDatabase", () => {
  it("берёт существующий проект и ждёт, пока он занят (423)", async () => {
    let tries = 0;
    const fetch = fakeFetch({
      "GET console.neon.tech/api/v2/projects": [200, { projects: [{ id: "neon_9", name: "roadmap-romashka" }] }],
      "GET console.neon.tech/api/v2/projects/neon_9/connection_uri": () => (++tries < 3 ? [423, {}] : [200, { uri: POOLED }]),
    });
    const uri = await ensureNeonDatabase({ name: "roadmap-romashka", org: "org-1", key: "nk", fetch, sleep: async () => {} });
    expect(uri).toBe(POOLED);
    expect(tries).toBe(3);
    expect(fetch.calls.some((c) => c.key.startsWith("POST"))).toBe(false);
    const q = fetch.calls.at(-1).query;
    expect(q).toContain("pooled=true");
  });
});

describe("siteAddress", () => {
  it("первый домен проекта", async () => {
    const fetch = fakeFetch({ "GET api.vercel.com/v9/projects/prj_1/domains": [200, { domains: [{ name: "roadmap-romashka.vercel.app" }] }] });
    expect(await siteAddress({ projectId: "prj_1", team: "team_1", token: "vt", fetch })).toBe("https://roadmap-romashka.vercel.app");
  });
});
```

- [ ] **Step 2:** `pnpm vitest run scripts/provision.test.mjs` → FAIL (модуль не найден).

- [ ] **Step 3: Реализация** — `scripts/provision.mjs`:

```js
// Проект карты клиента в команде Vercel finguin и его база Neon — из
// GitHub Actions (.github/workflows/deploy.yml), перед выкладкой:
//
//   node scripts/provision.mjs            проект, база, переменные
//   node scripts/provision.mjs --address  «Адрес сайта: https://…» после выкладки
//
// Имя проекта Vercel и Neon = имя репозитория (roadmap-<имя>). Проект
// создаётся без связи с Git: выкладывает Actions. Переменные DATABASE_URL,
// CONTROL_PASSWORD, CLIENT_NAME ставятся, только если их нет в проекте —
// правки владельца в Vercel не перетираются. База Neon создаётся, только
// когда в проекте нет DATABASE_URL. Значения ключей и строки базы не печатаются.
//
// Окружение: VERCEL_TOKEN, NEON_API_KEY (секреты), VERCEL_ORG_ID,
// NEON_ORG_ID, CLIENT_NAME, CONTROL_PASSWORD (переменные), GITHUB_REPOSITORY,
// GITHUB_ENV, VERCEL_PROJECT_ID (для --address). Коды выхода: 0 — готово; 1 — причина.

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const VERCEL = "https://api.vercel.com";
const NEON = "https://console.neon.tech/api/v2";
const NAME = /^roadmap-[a-z0-9][a-z0-9-]{1,38}$/;
const REGION = "aws-eu-central-1";
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(fetch, base, token, method, path, body) {
  const response = await fetch(base + path, {
    method,
    signal: AbortSignal.timeout(30000),
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json().catch(() => ({})) };
}

const stop = (reason) => ({ code: 1, message: `Выкладка не начинается: ${reason}` });

export async function ensureNeonDatabase({ name, org, key, fetch, sleep = defaultSleep }) {
  const list = await call(fetch, NEON, key, "GET", `/projects?org_id=${encodeURIComponent(org)}&search=${encodeURIComponent(name)}&limit=100`);
  if (list.status === 401) throw new Error("Neon не принял ключ NEON_API_KEY: истёк или удалён — напишите владельцу шаблона.");
  if (list.status >= 300) throw new Error(`Neon: список проектов — ответ ${list.status}.`);
  let project = (list.data.projects || []).find((p) => p.name === name);
  if (!project) {
    const created = await call(fetch, NEON, key, "POST", "/projects", { project: { name, region_id: REGION, org_id: org } });
    if (created.status >= 300 || !created.data.project) throw new Error(`Neon: создать проект ${name} — ответ ${created.status}.`);
    project = created.data.project;
  }
  const path = `/projects/${project.id}/connection_uri?database_name=neondb&role_name=neondb_owner&pooled=true`;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const uri = await call(fetch, NEON, key, "GET", path);
    if (uri.status === 423) { await sleep(3000); continue; }
    if (uri.status >= 300 || !uri.data.uri) throw new Error(`Neon: строка подключения ${name} — ответ ${uri.status}.`);
    return uri.data.uri;
  }
  throw new Error(`Neon: проект ${name} занят больше минуты — запустите выкладку ещё раз.`);
}

export async function provision({ repo, team, neonOrg, vercelToken, neonKey, clientName, controlPassword, fetch = globalThis.fetch, sleep = defaultSleep }) {
  if (!NAME.test(String(repo || ""))) return stop(`имя репозитория «${repo}» не вида roadmap-<латиница>.`);
  if (!vercelToken) return stop("нет секрета VERCEL_TOKEN — запустите /new-roadmap ещё раз: он попросит ключ у раздатчика.");
  if (!team) return stop("нет переменной репозитория VERCEL_ORG_ID — запустите /new-roadmap ещё раз.");
  const q = `teamId=${encodeURIComponent(team)}`;

  let project = await call(fetch, VERCEL, vercelToken, "GET", `/v9/projects/${repo}?${q}`);
  if (project.status === 404) project = await call(fetch, VERCEL, vercelToken, "POST", `/v11/projects?${q}`, { name: repo, framework: "nextjs" });
  if (project.status === 401 || project.status === 403) {
    return stop(`Vercel не принял ключ VERCEL_TOKEN (ответ ${project.status}) — напишите владельцу шаблона.`);
  }
  if (project.status >= 300 || !project.data.id) return stop(`Vercel: проект ${repo} — ответ ${project.status}.`);
  if (project.data.link) return stop(`в команде Vercel уже есть проект ${repo}, связанный с GitHub. Владельцу: отключить Git в настройках проекта или взять другое имя.`);
  const id = project.data.id;

  const env = await call(fetch, VERCEL, vercelToken, "GET", `/v9/projects/${id}/env?${q}`);
  if (env.status >= 300) return stop(`Vercel: переменные проекта — ответ ${env.status}.`);
  const have = new Set((env.data.envs || []).map((e) => e.key));

  const add = [];
  if (!have.has("DATABASE_URL")) {
    if (!neonKey) return stop("нет секрета NEON_API_KEY — запустите /new-roadmap ещё раз: он попросит ключ у раздатчика.");
    if (!neonOrg) return stop("нет переменной репозитория NEON_ORG_ID — запустите /new-roadmap ещё раз.");
    add.push({ key: "DATABASE_URL", value: await ensureNeonDatabase({ name: repo, org: neonOrg, key: neonKey, fetch, sleep }) });
  }
  if (!have.has("CONTROL_PASSWORD") && controlPassword) add.push({ key: "CONTROL_PASSWORD", value: controlPassword });
  if (!have.has("CLIENT_NAME") && clientName) add.push({ key: "CLIENT_NAME", value: clientName });

  if (add.length) {
    const body = add.map((e) => ({ ...e, type: "encrypted", target: ["production"] }));
    const saved = await call(fetch, VERCEL, vercelToken, "POST", `/v10/projects/${id}/env?upsert=true&${q}`, body);
    if (saved.status >= 300) return stop(`Vercel не принял переменные — ответ ${saved.status}.`);
    if (Array.isArray(saved.data.failed) && saved.data.failed.length) return stop("Vercel не принял часть переменных проекта.");
  }
  return { code: 0, projectId: id, message: `Проект Vercel ${repo}: добавлено переменных — ${add.length}.` };
}

export async function siteAddress({ projectId, team, token, fetch = globalThis.fetch }) {
  const res = await call(fetch, VERCEL, token, "GET", `/v9/projects/${projectId}/domains?teamId=${encodeURIComponent(team)}`);
  const name = res.data.domains?.[0]?.name;
  if (res.status >= 300 || !name) throw new Error(`Vercel: домены проекта — ответ ${res.status}.`);
  return `https://${name}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = process.env;
  if (process.argv.includes("--address")) {
    siteAddress({ projectId: env.VERCEL_PROJECT_ID, team: env.VERCEL_ORG_ID, token: env.VERCEL_TOKEN })
      .then((url) => console.log(`Адрес сайта: ${url}`))
      .catch((error) => { console.error(error.message); process.exitCode = 1; });
  } else {
    provision({
      repo: (env.GITHUB_REPOSITORY || "").split("/")[1],
      team: env.VERCEL_ORG_ID,
      neonOrg: env.NEON_ORG_ID,
      vercelToken: env.VERCEL_TOKEN,
      neonKey: env.NEON_API_KEY,
      clientName: env.CLIENT_NAME,
      controlPassword: env.CONTROL_PASSWORD,
    })
      .catch((error) => ({ code: 1, message: error.message }))
      .then((result) => {
        console.log(result.message);
        if (result.code === 0 && env.GITHUB_ENV) appendFileSync(env.GITHUB_ENV, `VERCEL_PROJECT_ID=${result.projectId}\n`);
        process.exitCode = result.code;
      });
  }
}
```

- [ ] **Step 4:** `pnpm test` → PASS.
- [ ] **Step 5: Commit**

```bash
git add scripts/provision.mjs scripts/provision.test.mjs
git commit -m "Скрипт подготовки проекта Vercel и базы Neon для карты клиента"
```

---

### Task 3: Workflow выкладки и README (главная версия), слияние в main

**Files:**
- Create: `.github/workflows/deploy.yml`
- Modify: `README.md` — новый раздел после «Публикация в Vercel»

**Interfaces:**
- Consumes: `scripts/provision.mjs` (Task 2). Produces: workflow `deploy.yml` с `workflow_dispatch`; в журнале строка `Адрес сайта: https://…` (её ищет плагин).

- [ ] **Step 1:** `.github/workflows/deploy.yml`:

```yaml
# Выкладка карты клиента в команду Vercel finguin — по push в main и
# вручную (так её запускает /new-roadmap плагина roadmap).
# Работает только в копиях клиентов finguin-agency/roadmap-<имя>: там
# /new-roadmap ставит переменную ROADMAP_DEPLOY=on. В главной версии
# переменной нет — работа пропускается, прежние проекты Vercel
# выкладываются через подключённый Git, как раньше.
name: Выкладка на Vercel

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: vercel-production
  cancel-in-progress: false

jobs:
  deploy:
    if: vars.ROADMAP_DEPLOY == 'on'
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v7
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - name: Самопроверки
        run: pnpm test
      - name: Проект Vercel и база
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          NEON_API_KEY: ${{ secrets.NEON_API_KEY }}
          VERCEL_ORG_ID: ${{ vars.VERCEL_ORG_ID }}
          NEON_ORG_ID: ${{ vars.NEON_ORG_ID }}
          CLIENT_NAME: ${{ vars.CLIENT_NAME }}
          CONTROL_PASSWORD: ${{ vars.CONTROL_PASSWORD }}
        run: node scripts/provision.mjs
      - name: Выкладка
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_ORG_ID: ${{ vars.VERCEL_ORG_ID }}
        run: npx --yes vercel@64.5.0 deploy --prod --yes --token="$VERCEL_TOKEN"
      - name: Адрес сайта
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_ORG_ID: ${{ vars.VERCEL_ORG_ID }}
        run: node scripts/provision.mjs --address
```

Проверка версий действий: `gh api repos/pnpm/action-setup/releases/latest --jq .tag_name`, `gh api repos/actions/checkout/releases/latest --jq .tag_name`, `gh api repos/actions/setup-node/releases/latest --jq .tag_name` — взять мажорные версии из ответа, если они отличаются от указанных.

- [ ] **Step 2:** README — раздел после «## Публикация в Vercel»:

```markdown
## Карта для нового клиента

Руководители FINGUIN создают карты клиентам плагином Claude Code `roadmap`
(репозиторий `finguin-agency/claude-plugins`): `/new-roadmap` копирует эту
версию в приватный `finguin-agency/roadmap-<имя>`, создаёт базу в Neon
«FINGUIN» и проект в команде Vercel `finguin`; `/update-roadmaps` подтягивает
свежий `main` отсюда во все карты руководителя.

Копию выкладывает `.github/workflows/deploy.yml` и `scripts/provision.mjs`:
только при переменной репозитория `ROADMAP_DEPLOY=on` — здесь её нет, и
проекты, подключённые к этому репозиторию через Git, выкладываются как
раньше. Название клиента попадает в стартовые данные из `CLIENT_NAME`.
```

- [ ] **Step 3:** `pnpm test` → PASS; `pnpm lint` → без ошибок.
- [ ] **Step 4: Commit, слияние, push**

```bash
git add .github/workflows/deploy.yml README.md
git commit -m "Выкладка копий клиентов в команду Vercel finguin"
git switch main && git pull --ff-only origin main
git merge --no-ff feature/new-roadmap -m "Merge feature/new-roadmap into main"
pnpm test
git push origin main
```

Ожидание: в `dikushinwork-code/ClientsFinguin` Actions запуск «Выкладка на Vercel» — `skipped` (`gh run list --repo dikushinwork-code/ClientsFinguin --limit 1`).

---

### Task 4: Ключ Neon и раздатчик (выполняет ведущий агент, не субагент)

**Files:**
- Modify: `/Users/artyom/Desktop/claud/SoftTemplate/.github/workflows/vercel-key.yml`

- [ ] **Step 1: Ключ API организации Neon.** Через MCP `shadow-chrome`: `https://console.neon.tech/app/org-aged-dawn-08889557/settings` → API keys → Create, имя `roadmap-github-actions`. Значение сразу передать в `gh secret set NEON_API_KEY --repo finguin-agency/finpanel` (stdin), в ответах не повторять. Не вошёл в Neon — попросить владельца `~/.shadow-chrome/login.sh`.

- [ ] **Step 2: Параметр `neon` в раздатчике.** В `on.workflow_dispatch.inputs` добавить:

```yaml
      neon:
        description: Положить и ключ Neon (дорожные карты)
        type: boolean
        default: false
```

После шага «Положить ключ в репозиторий клиента» добавить шаг:

```yaml
      - name: Положить ключ Neon
        if: inputs.neon
        env:
          GH_TOKEN: ${{ secrets.KEY_DISTRIBUTOR_TOKEN }}
          KEY: ${{ secrets.NEON_API_KEY }}
          REPO: ${{ inputs.repo }}
        run: |
          if [ -z "$KEY" ]; then
            echo "::error::В секретах шаблона нет NEON_API_KEY — владельцу шаблона."
            exit 1
          fi
          printf '%s' "$KEY" | gh secret set NEON_API_KEY --repo "finguin-agency/$REPO"
```

В шапке файла дописать строку про `NEON_API_KEY` (кладётся только при `neon=true`, для `/new-roadmap`).

- [ ] **Step 3:** в SoftTemplate `npm test` → код 0; коммит «Раздатчик: ключ Neon для дорожных карт» в `main`, push в `finguin-agency/finpanel` (по правилам SoftTemplate — `node scripts/гитхаб.js` или как разрешает его `.claude/settings.json`).

- [ ] **Step 4: Проверка раздатчика** — в Task 8 (на тестовом репозитории).

---

### Task 5: Каркас плагина и `lib.mjs`

**Files:**
- Create (корень `/Users/artyom/Desktop/claud/Finguin/claude-plugins`): `package.json`, `.gitignore`, `.claude-plugin/marketplace.json`, `plugins/roadmap/.claude-plugin/plugin.json`, `plugins/roadmap/scripts/config.mjs`, `plugins/roadmap/scripts/lib.mjs`
- Test: `plugins/roadmap/scripts/lib.test.mjs`

**Interfaces:**
- Produces (`lib.mjs`): `transliterate(text: string): string`; `checkSlug(slug: string): string|null` (причина или null); `repoName(slug): string`; `leadTopic(login): string`; `topicsOf(repo: {repositoryTopics?}): string[]`; `ownerDecision({exists, topics, lead}): "create"|"resume"|"foreign"`; `randomPassword(): string` (12 симв.); `parseSiteAddress(log: string): string|null`; `parseArgs(argv: string[]): {client?, slug?, suggest?, all: boolean}`; `run(cmd, args, opts?): string` (бросает); `tryRun(cmd, args, opts?): {ok, out, err}`; `sleep(ms)`; `fail(message): never` (печатает «СТОП: …», exit 1); `whoAmI(): string` (логин; стоп, если не вошёл/не в организации).
- Produces (`config.mjs`): `ORG`, `SOURCE`, `DISTRIBUTOR`, `VERCEL_TEAM`, `NEON_ORG`.

- [ ] **Step 1: Каркас**

`package.json`:
```json
{
  "name": "finguin-claude-plugins",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test \"plugins/*/scripts/*.test.mjs\"" }
}
```

`.gitignore`: `node_modules\n.DS_Store\n`

`.claude-plugin/marketplace.json`:
```json
{
  "name": "finguin",
  "owner": { "name": "FINGUIN" },
  "plugins": [
    {
      "name": "roadmap",
      "source": "./plugins/roadmap",
      "description": "Дорожная карта финдиректора: /new-roadmap — карта для нового клиента, /update-roadmaps — обновить свои карты."
    }
  ]
}
```

`plugins/roadmap/.claude-plugin/plugin.json`:
```json
{
  "name": "roadmap",
  "version": "1.0.0",
  "description": "Дорожная карта финдиректора FINGUIN: создать карту клиента и обновить свои карты.",
  "author": { "name": "FINGUIN" }
}
```

`plugins/roadmap/scripts/config.mjs`:
```js
// Адреса компании. Сменились — править только здесь.
export const ORG = "finguin-agency";
export const SOURCE = "https://github.com/dikushinwork-code/ClientsFinguin.git";
export const DISTRIBUTOR = "finguin-agency/finpanel";
export const VERCEL_TEAM = "team_akTxAWwlKEzPST0M3rGEwqWF";
export const NEON_ORG = "org-aged-dawn-08889557";
```

- [ ] **Step 2: Падающий тест** — `plugins/roadmap/scripts/lib.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkSlug, leadTopic, ownerDecision, parseArgs, parseSiteAddress, randomPassword, repoName, topicsOf, transliterate } from "./lib.mjs";

test("transliterate: кириллица в латиницу", () => {
  assert.equal(transliterate("Ромашка"), "romashka");
  assert.equal(transliterate("ООО «Щука и Ёж»"), "ooo-shchuka-i-ezh");
  assert.equal(transliterate("  Plum Pro 2  "), "plum-pro-2");
  assert.equal(transliterate("Лес".repeat(20)).length <= 39, true);
  assert.equal(transliterate("Ъ"), "");
});

test("checkSlug", () => {
  assert.equal(checkSlug("romashka"), null);
  assert.equal(checkSlug("plum-pro-2"), null);
  assert.match(checkSlug(""), /латиниц/);
  assert.match(checkSlug("a"), /латиниц/);
  assert.match(checkSlug("Romashka"), /латиниц/);
  assert.match(checkSlug("romashka-"), /латиниц/);
  assert.match(checkSlug("-romashka"), /латиниц/);
  assert.match(checkSlug("x".repeat(40)), /латиниц/);
});

test("repoName и leadTopic", () => {
  assert.equal(repoName("romashka"), "roadmap-romashka");
  assert.equal(leadTopic("Artyom_CFO"), "lead-artyom-cfo");
});

test("topicsOf: строки и объекты", () => {
  assert.deepEqual(topicsOf({ repositoryTopics: [{ name: "roadmap" }, "lead-x"] }), ["roadmap", "lead-x"]);
  assert.deepEqual(topicsOf({}), []);
});

test("ownerDecision", () => {
  assert.equal(ownerDecision({ exists: false, topics: [], lead: "lead-x" }), "create");
  assert.equal(ownerDecision({ exists: true, topics: ["roadmap", "lead-x"], lead: "lead-x" }), "resume");
  assert.equal(ownerDecision({ exists: true, topics: ["roadmap", "lead-y"], lead: "lead-x" }), "foreign");
});

test("randomPassword: 12 символов без похожих", () => {
  const p = randomPassword();
  assert.equal(p.length, 12);
  assert.match(p, /^[A-HJ-NP-Za-km-z2-9]{12}$/);
  assert.notEqual(randomPassword(), p);
});

test("parseSiteAddress: последний адрес в журнале", () => {
  const log = "deploy\tАдрес сайта\t2026-11-19T10:00:00Z Адрес сайта: https://roadmap-a.vercel.app\nеще";
  assert.equal(parseSiteAddress(log), "https://roadmap-a.vercel.app");
  assert.equal(parseSiteAddress("пусто"), null);
});

test("parseArgs", () => {
  assert.deepEqual(parseArgs(["--client", "Ромашка", "--slug", "romashka"]), { client: "Ромашка", slug: "romashka", suggest: undefined, all: false });
  assert.deepEqual(parseArgs(["--suggest", "Ромашка"]), { client: undefined, slug: undefined, suggest: "Ромашка", all: false });
  assert.equal(parseArgs(["--all"]).all, true);
});
```

- [ ] **Step 3:** `npm test` → FAIL (нет `lib.mjs`).

- [ ] **Step 4: Реализация** — `plugins/roadmap/scripts/lib.mjs`:

```js
import { execFileSync } from "node:child_process";
import { randomInt } from "node:crypto";
import { ORG } from "./config.mjs";

const MAP = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function transliterate(text) {
  const latin = [...String(text).toLowerCase()].map((ch) => (ch in MAP ? MAP[ch] : ch)).join("");
  return latin.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 39).replace(/-+$/, "");
}

export function checkSlug(slug) {
  if (/^[a-z0-9][a-z0-9-]{1,38}$/.test(String(slug)) && !String(slug).endsWith("-")) return null;
  return `Имя «${slug}» не подходит: 2–39 символов, строчная латиница, цифры и дефис, без дефиса в начале и в конце.`;
}

export const repoName = (slug) => `roadmap-${slug}`;
export const leadTopic = (login) => `lead-${String(login).toLowerCase().replace(/[^a-z0-9-]/g, "-")}`.slice(0, 50);
export const topicsOf = (repo) => (repo.repositoryTopics || []).map((t) => (typeof t === "string" ? t : t.name));

export function ownerDecision({ exists, topics, lead }) {
  if (!exists) return "create";
  return topics.includes(lead) ? "resume" : "foreign";
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
export function randomPassword() {
  return Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
}

export function parseSiteAddress(log) {
  const all = [...String(log).matchAll(/Адрес сайта: (https:\/\/\S+)/g)];
  return all.length ? all.at(-1)[1] : null;
}

export function parseArgs(argv) {
  const value = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : undefined; };
  return { client: value("--client"), slug: value("--slug"), suggest: value("--suggest"), all: argv.includes("--all") };
}

export function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
}

export function tryRun(cmd, args, opts = {}) {
  try {
    return { ok: true, out: run(cmd, args, opts), err: "" };
  } catch (error) {
    return { ok: false, out: String(error.stdout || "").trim(), err: String(error.stderr || error.message).trim() };
  }
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function fail(message) {
  console.log(`СТОП: ${message}`);
  process.exit(1);
}

export function whoAmI() {
  if (!tryRun("gh", ["--version"]).ok) fail("нет GitHub CLI. Поставьте: https://cli.github.com, затем gh auth login.");
  const user = tryRun("gh", ["api", "user", "--jq", ".login"]);
  if (!user.ok) fail("GitHub CLI не вошёл. Выполните в терминале: gh auth login");
  const member = tryRun("gh", ["api", `orgs/${ORG}/memberships/${user.out}`, "--jq", ".state"]);
  if (!member.ok || member.out !== "active") {
    fail(`${user.out} — не участник ${ORG}. Примите приглашение: https://github.com/orgs/${ORG}/invitation (нет приглашения — напишите владельцу).`);
  }
  return user.out;
}
```

- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6: Commit**

```bash
cd /Users/artyom/Desktop/claud/Finguin/claude-plugins
git init -b main
git add -A
git commit -m "Магазин плагинов FINGUIN: каркас плагина roadmap"
```

---

### Task 6: `/new-roadmap` — скрипт и навык

**Files:**
- Create: `plugins/roadmap/scripts/new-roadmap.mjs`, `plugins/roadmap/skills/new-roadmap/SKILL.md`

**Interfaces:**
- Consumes: всё из `lib.mjs`, `config.mjs` (Task 5); workflow `deploy.yml` в копии (Task 3); раздатчик `vercel-key.yml` с `neon` (Task 4).
- CLI: `node new-roadmap.mjs --suggest "<название>"` → печатает slug; `node new-roadmap.mjs --client "<название>" --slug <slug>` → создаёт/продолжает, в конце блок «Готово…».

- [ ] **Step 1:** `plugins/roadmap/scripts/new-roadmap.mjs`:

```js
#!/usr/bin/env node
// Дорожная карта для нового клиента: копия главной версии в
// finguin-agency/roadmap-<имя>, ключи от раздатчика, переменные, выкладка.
// Каждый шаг повторяемый: повтор с тем же --slug продолжает с недоделанного.
//
//   node new-roadmap.mjs --suggest "Ромашка"                 латинское имя
//   node new-roadmap.mjs --client "Ромашка" --slug romashka  создать
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DISTRIBUTOR, NEON_ORG, ORG, SOURCE, VERCEL_TEAM } from "./config.mjs";
import { checkSlug, fail, leadTopic, ownerDecision, parseArgs, parseSiteAddress, randomPassword, repoName, run, sleep, topicsOf, transliterate, tryRun, whoAmI } from "./lib.mjs";

const say = (text) => console.log(text);
const KEYS = ["VERCEL_TOKEN", "NEON_API_KEY"];

function repoInfo(full) {
  const r = tryRun("gh", ["repo", "view", full, "--json", "name,repositoryTopics"]);
  if (!r.ok) return { exists: false, topics: [] };
  return { exists: true, topics: topicsOf(JSON.parse(r.out)) };
}

const hasMain = (full) => tryRun("gh", ["api", `repos/${full}/branches/main`, "--jq", ".name"]).ok;

function pushSource(full) {
  const dir = mkdtempSync(path.join(tmpdir(), "roadmap-"));
  try {
    run("git", ["clone", "--quiet", "--branch", "main", SOURCE, dir]);
    run("git", ["-C", dir, "push", "--quiet", `https://github.com/${full}.git`, "main:main"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function secretNames(full) {
  const r = tryRun("gh", ["secret", "list", "--repo", full, "--json", "name", "--jq", ".[].name"]);
  return r.ok ? r.out.split("\n").filter(Boolean) : [];
}

async function ensureKeys(full, name) {
  const ready = () => { const have = secretNames(full); return KEYS.every((k) => have.includes(k)); };
  if (ready()) return;
  const r = tryRun("gh", ["workflow", "run", "vercel-key.yml", "--repo", DISTRIBUTOR, "-f", `repo=${name}`, "-f", "neon=true"]);
  if (!r.ok) fail(`раздатчик ключей не запустился (${r.err.split("\n")[0]}). Нужно право Write на ${DISTRIBUTOR} — напишите владельцу.`);
  for (let i = 0; i < 24; i += 1) {
    await sleep(5000);
    if (ready()) return;
  }
  fail(`ключи не пришли за 2 минуты. Запуск раздатчика: https://github.com/${DISTRIBUTOR}/actions/workflows/vercel-key.yml — затем /new-roadmap ещё раз с тем же именем.`);
}

function variables(full) {
  const r = tryRun("gh", ["variable", "list", "--repo", full, "--json", "name,value"]);
  return r.ok ? Object.fromEntries(JSON.parse(r.out).map((v) => [v.name, v.value])) : {};
}

function configure(full, clientName) {
  const have = variables(full);
  const set = (name, value) => run("gh", ["variable", "set", name, "--repo", full, "--body", value]);
  set("VERCEL_ORG_ID", VERCEL_TEAM);
  set("NEON_ORG_ID", NEON_ORG);
  if (!have.CLIENT_NAME) set("CLIENT_NAME", clientName);
  const password = have.CONTROL_PASSWORD || randomPassword();
  if (!have.CONTROL_PASSWORD) set("CONTROL_PASSWORD", password);
  set("ROADMAP_DEPLOY", "on");
  return password;
}

async function deploy(full) {
  const started = Date.now() - 60000;
  run("gh", ["workflow", "run", "deploy.yml", "--repo", full, "--ref", "main"]);
  let id;
  for (let i = 0; i < 40 && !id; i += 1) {
    await sleep(3000);
    const r = tryRun("gh", ["run", "list", "--repo", full, "--workflow", "deploy.yml", "--event", "workflow_dispatch", "--limit", "1", "--json", "databaseId,createdAt"]);
    const [last] = r.ok ? JSON.parse(r.out) : [];
    if (last && Date.parse(last.createdAt) >= started) id = String(last.databaseId);
  }
  if (!id) fail(`выкладка не запустилась за 2 минуты: https://github.com/${full}/actions — затем /new-roadmap ещё раз с тем же именем.`);
  say("Выкладка идёт, обычно 2–4 минуты…");
  const watched = tryRun("gh", ["run", "watch", id, "--repo", full, "--exit-status", "--interval", "10"]);
  if (!watched.ok) {
    const tail = tryRun("gh", ["run", "view", id, "--repo", full, "--log-failed"]).out.split("\n").slice(-15).join("\n");
    fail(`выкладка упала:\n${tail}\nЗапуск: https://github.com/${full}/actions/runs/${id}\nПосле исправления — /new-roadmap ещё раз с тем же именем.`);
  }
  return parseSiteAddress(tryRun("gh", ["run", "view", id, "--repo", full, "--log"]).out);
}

async function healthy(url) {
  try {
    const response = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(30000) });
    return (await response.json()).reachable === true;
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.suggest) { say(transliterate(args.suggest)); return; }
  const clientName = (args.client || "").trim();
  if (!clientName) fail("нужно название клиента: --client \"Ромашка\".");
  const slug = args.slug || transliterate(clientName);
  const bad = checkSlug(slug);
  if (bad) fail(bad);

  const login = whoAmI();
  const name = repoName(slug);
  const full = `${ORG}/${name}`;
  const lead = leadTopic(login);
  const info = repoInfo(full);
  const decision = ownerDecision({ ...info, lead });
  if (decision === "foreign") fail(`${full} уже есть и это карта другого руководителя. Возьмите другое имя, например ${slug}-2.`);
  if (decision === "resume") say("Карта уже начата — продолжаю с недоделанного шага.");

  tryRun("gh", ["auth", "setup-git"]);
  if (!info.exists) {
    say(`Создаю репозиторий ${full}…`);
    run("gh", ["repo", "create", full, "--private", "--description", `Дорожная карта: ${clientName}`]);
    run("gh", ["repo", "edit", full, "--add-topic", `roadmap,${lead}`]);
  }
  if (!hasMain(full)) { say("Копирую свежую версию дорожной карты…"); pushSource(full); }
  say("Получаю ключи Vercel и Neon…");
  await ensureKeys(full, name);
  const password = configure(full, clientName);
  const url = await deploy(full);
  const site = url || `(адрес не найден в журнале — https://github.com/${full}/actions)`;
  const ok = url ? await healthy(url) : false;

  say("");
  say(`Готово: дорожная карта «${clientName}».`);
  say(`Сайт: ${site}`);
  if (url && !ok) say(`Внимание: база пока не ответила — проверьте ${url}/api/health через минуту.`);
  say(`Пароль вкладки «Руководителю»: ${password}`);
  say(`Репозиторий: https://github.com/${full}`);
}

main().catch((error) => fail(error.message));
```

- [ ] **Step 2:** `plugins/roadmap/skills/new-roadmap/SKILL.md`:

```markdown
---
name: new-roadmap
description: Создаёт дорожную карту финдиректора для нового клиента FINGUIN — «/new-roadmap», «новая дорожная карта», «создай дорожную карту клиенту», «дорожная карта для нового клиента». Репозиторий в finguin-agency, база Neon, сайт в Vercel finguin — одной командой.
---

# Новая дорожная карта

Скрипты плагина — в папке `../../scripts` от папки этого навыка (строка
«Base directory for this skill» выше); дальше `<скрипты>` — этот путь
целиком. Всё делает скрипт: репозитории, ключи, Vercel и Neon руками не
трогать. Текст пользователю — по-русски, коротко.

1. Название клиента не дано в запросе — спросить одним сообщением:
   «Как называется клиент?».
2. `node <скрипты>/new-roadmap.mjs --suggest "<название>"` → латинское имя.
   Спросить через AskUserQuestion: «Адрес карты — roadmap-<имя>. Подходит?»
   (варианты «Да» и «Другое имя»; другое — строчная латиница, цифры, дефис).
3. Одной фразой сказать, что сейчас создаётся карта (3–6 минут), и запустить
   `node <скрипты>/new-roadmap.mjs --client "<название>" --slug <имя>`
   с тайм-аутом 600000 мс, не в фоне.
4. Показать блок после «Готово:» как есть — сайт, пароль, репозиторий — и
   посоветовать сохранить пароль. Строка «СТОП: …» — показать причину и что
   сделать; повтор с тем же именем продолжит с недоделанного шага.
```

- [ ] **Step 3: Проверка без сети:** `node plugins/roadmap/scripts/new-roadmap.mjs --suggest "ООО Ромашка"` → `ooo-romashka`; `node plugins/roadmap/scripts/new-roadmap.mjs --client "Тест" --slug Bad_` → `СТОП: Имя «Bad_» не подходит…`, код 1; `node --check plugins/roadmap/scripts/new-roadmap.mjs`. `npm test` → PASS.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "Навык /new-roadmap"`.

---

### Task 7: `/update-roadmaps`, README и публикация магазина

**Files:**
- Create: `plugins/roadmap/scripts/update-roadmaps.mjs`, `plugins/roadmap/skills/update-roadmaps/SKILL.md`, `README.md`

**Interfaces:**
- Consumes: `lib.mjs`, `config.mjs`. CLI: `node update-roadmaps.mjs [--all]` → построчный итог `<карта> — <результат>`.

- [ ] **Step 1:** `plugins/roadmap/scripts/update-roadmaps.mjs`:

```js
#!/usr/bin/env node
// Свежая версия главной дорожной карты — во все карты руководителя
// (темы roadmap + lead-<логин>; --all — все карты организации). Слияние
// идёт на этом компьютере и уходит push'ем от имени руководителя: push
// запускает выкладку. Данные клиентов лежат в базе и не затрагиваются.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ORG, SOURCE } from "./config.mjs";
import { leadTopic, parseArgs, parseSiteAddress, run, sleep, topicsOf, tryRun, whoAmI } from "./lib.mjs";

const say = (text) => console.log(text);

function myRoadmaps(lead, all) {
  const list = JSON.parse(run("gh", ["repo", "list", ORG, "--topic", "roadmap", "--limit", "500", "--json", "name,repositoryTopics"]));
  return list.filter((repo) => all || topicsOf(repo).includes(lead)).map((repo) => repo.name).sort();
}

function updateOne(name) {
  const full = `${ORG}/${name}`;
  const dir = mkdtempSync(path.join(tmpdir(), "roadmap-"));
  const git = (...args) => tryRun("git", ["-C", dir, ...args]);
  try {
    run("git", ["clone", "--quiet", `https://github.com/${full}.git`, dir]);
    if (!git("fetch", "--quiet", SOURCE, "main").ok) return { name, result: "не обновлена: главная версия недоступна" };
    if (git("merge-base", "--is-ancestor", "FETCH_HEAD", "HEAD").ok) return { name, result: "уже свежая" };
    if (!git("merge", "--ff-only", "--quiet", "FETCH_HEAD").ok) {
      const identity = tryRun("git", ["config", "user.email"]).ok ? [] : ["-c", "user.name=Обновление дорожной карты", "-c", "user.email=roadmap@users.noreply.github.com"];
      const merged = tryRun("git", ["-C", dir, ...identity, "merge", "--no-edit", "FETCH_HEAD"]);
      if (!merged.ok) {
        const files = git("diff", "--name-only", "--diff-filter=U").out.split("\n").filter(Boolean).join(", ");
        git("merge", "--abort");
        return { name, result: `не обновлена: в копии правили код (${files || "конфликт"})` };
      }
    }
    const sha = git("rev-parse", "HEAD").out;
    const pushed = git("push", "--quiet", "origin", "HEAD:main");
    if (!pushed.ok) {
      const hint = /workflow/i.test(pushed.err) ? "нужно право на workflow — выполните gh auth refresh -s workflow" : pushed.err.split("\n")[0];
      return { name, result: `не обновлена: ${hint}` };
    }
    return { name, result: "код обновлён", sha };
  } catch (error) {
    return { name, result: `не обновлена: ${String(error.stderr || error.message).split("\n")[0]}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function waitDeploy(name, sha) {
  const full = `${ORG}/${name}`;
  let id;
  for (let i = 0; i < 40 && !id; i += 1) {
    await sleep(3000);
    const r = tryRun("gh", ["run", "list", "--repo", full, "--workflow", "deploy.yml", "--commit", sha, "--limit", "1", "--json", "databaseId"]);
    const [last] = r.ok ? JSON.parse(r.out) : [];
    if (last) id = String(last.databaseId);
  }
  if (!id) return `код обновлён, выкладка не запустилась: https://github.com/${full}/actions`;
  const watched = tryRun("gh", ["run", "watch", id, "--repo", full, "--exit-status", "--interval", "10"]);
  if (!watched.ok) return `код обновлён, выкладка упала: https://github.com/${full}/actions/runs/${id}`;
  const url = parseSiteAddress(tryRun("gh", ["run", "view", id, "--repo", full, "--log"]).out);
  return `обновлена и выложена${url ? `: ${url}` : ""}`;
}

async function main() {
  const { all } = parseArgs(process.argv.slice(2));
  const login = whoAmI();
  const names = myRoadmaps(leadTopic(login), all);
  if (!names.length) { say("Дорожных карт пока нет. Создать — /new-roadmap."); return; }
  tryRun("gh", ["auth", "setup-git"]);
  say(`Карт: ${names.length}. Обновляю…`);
  const results = names.map(updateOne);
  for (const item of results) {
    if (item.sha) item.result = await waitDeploy(item.name, item.sha);
    say(`${item.name} — ${item.result}`);
  }
}

main().catch((error) => { console.log(`СТОП: ${error.message}`); process.exit(1); });
```

- [ ] **Step 2:** `plugins/roadmap/skills/update-roadmaps/SKILL.md`:

```markdown
---
name: update-roadmaps
description: Обновляет все дорожные карты руководителя FINGUIN до свежей версии — «/update-roadmaps», «обнови дорожные карты», «подтяни обновление дорожной карты», «обнови мои карты». Данные клиентов не трогает.
---

# Обновить мои дорожные карты

Скрипты плагина — в папке `../../scripts` от папки этого навыка (строка
«Base directory for this skill» выше). Текст пользователю — по-русски.

1. Одной фразой: «Подтягиваю свежую версию во все ваши карты, данные
   клиентов не меняются».
2. `node <скрипты>/update-roadmaps.mjs` (владелец просит «все карты» —
   с `--all`), тайм-аут 600000 мс, не в фоне.
3. Показать итоговые строки «<карта> — <результат>» как есть. «В копии
   правили код» — предложить разобраться отдельно; «нужно право на
   workflow» — пользователь выполняет `gh auth refresh -s workflow` и
   повторяет.
```

- [ ] **Step 3:** `README.md` (корень репозитория плагинов):

```markdown
# Плагины Claude Code FINGUIN

## Дорожная карта финдиректора (`roadmap`)

- `/new-roadmap` — карта для нового клиента: приватный репозиторий
  `finguin-agency/roadmap-<имя>`, база Neon, сайт в команде Vercel finguin.
  В конце — ссылка и пароль вкладки «Руководителю».
- `/update-roadmaps` — свежая версия во все ваши карты; данные клиентов не
  меняются.

### Установка (один раз)

Нужно: участие в GitHub-организации finguin-agency, GitHub CLI с входом
(`gh auth login`), Node.js 22+. Вставьте в Claude Code:

    Установи плагин дорожной карты FINGUIN: выполни в терминале
    claude plugin marketplace add finguin-agency/claude-plugins
    claude plugin install roadmap@finguin
    и скажи, когда перезапустить сессию.

После перезапуска наберите `/` — в списке появятся `/new-roadmap` и
`/update-roadmaps`. Обновить сам плагин:
`claude plugin marketplace update finguin`.

### Владельцу

Главная версия — `dikushinwork-code/ClientsFinguin`; адреса компании —
`plugins/roadmap/scripts/config.mjs`. Ключи Vercel и Neon кладёт раздатчик
`finguin-agency/finpanel` (`vercel-key.yml`, параметр `neon`).
```

- [ ] **Step 4:** `npm test` → PASS; `node --check plugins/roadmap/scripts/update-roadmaps.mjs`.
- [ ] **Step 5: Commit и публикация**

```bash
git add -A
git commit -m "Навык /update-roadmaps и инструкция"
gh repo create finguin-agency/claude-plugins --private --description "Плагины Claude Code FINGUIN" --source . --remote origin --push
```

---

### Task 8: Сквозная проверка (ведущий агент)

- [ ] **Step 1: Установка по README** в этой машине: `claude plugin marketplace add finguin-agency/claude-plugins`, `claude plugin install roadmap@finguin`; проверить, под каким именем навыки видны в `/` (`/new-roadmap` или `/roadmap:new-roadmap`) — фактическое имя вписать в README и SKILL-описания.
- [ ] **Step 2: Создание:** `node …/new-roadmap.mjs --client "Плагин Тест" --slug plugin-test` → блок «Готово», сайт открывается, `GET <сайт>/api/health` → `reachable: true`, название клиента на странице «Плагин Тест», пароль подходит к вкладке «Руководителю». Если сборка Vercel упала на версии pnpm — добавить в `provision.mjs` переменную `ENABLE_EXPERIMENTAL_COREPACK=1` (по тому же правилу «только если нет») с тестом и повторить.
- [ ] **Step 3: Повтор** той же командой → «Карта уже начата…», пароль тот же, ничего не дублируется.
- [ ] **Step 4: Обновление:** любой следующий коммит в `ClientsFinguin/main` → `node …/update-roadmaps.mjs` → `roadmap-plugin-test — обновлена и выложена: …`; данные на сайте на месте. Повтор → `уже свежая`.
- [ ] **Step 5: Уборка** — спросить владельца, удалять ли тестовую карту; да — `gh repo delete finguin-agency/roadmap-plugin-test --yes`, проект Vercel и проект Neon — через теневой Chrome.
```
