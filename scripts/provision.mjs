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
const NODE = "24.x";
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
  if (project.status === 404) project = await call(fetch, VERCEL, vercelToken, "POST", `/v11/projects?${q}`, { name: repo, framework: "nextjs", serverlessFunctionRegion: "fra1" });
  if (project.status === 401 || project.status === 403) {
    return stop(`Vercel не принял ключ VERCEL_TOKEN (ответ ${project.status}) — напишите владельцу шаблона.`);
  }
  if (project.status >= 300 || !project.data.id) return stop(`Vercel: проект ${repo} — ответ ${project.status}.`);
  if (project.data.link) return stop(`проект ${repo} уже есть в команде Vercel и связан с GitHub. Владельцу: отключить Git в настройках проекта или взять другое имя.`);
  const id = project.data.id;
  // Сборка идёт в Actions на Node 24 (deploy.yml); новый проект Vercel
  // получает версию новее, и vercel build её не принимает.
  if (project.data.nodeVersion !== NODE) {
    const node = await call(fetch, VERCEL, vercelToken, "PATCH", `/v9/projects/${id}?${q}`, { nodeVersion: NODE });
    if (node.status >= 300) return stop(`Vercel не дал поставить проекту ${repo} Node ${NODE} (ответ ${node.status}).`);
  }

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
