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
      "POST api.vercel.com/v11/projects": [200, { id: "prj_1", name: "roadmap-romashka", nodeVersion: "26.x" }],
      "PATCH api.vercel.com/v9/projects/prj_1": [200, { id: "prj_1", nodeVersion: "24.x" }],
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
    expect(created.body).toEqual({ name: "roadmap-romashka", framework: "nextjs", serverlessFunctionRegion: "fra1" });
    const node = fetch.calls.find((c) => c.key === "PATCH api.vercel.com/v9/projects/prj_1");
    expect(node.body).toEqual({ nodeVersion: "24.x" });
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
      "GET api.vercel.com/v9/projects/roadmap-romashka": [200, { id: "prj_1", nodeVersion: "24.x" }],
      "GET api.vercel.com/v9/projects/prj_1/env": [200, { envs: [{ key: "DATABASE_URL" }, { key: "CONTROL_PASSWORD" }, { key: "CLIENT_NAME" }] }],
    });
    const result = await provision({ ...base, neonKey: undefined, fetch });
    expect(result.code).toBe(0);
    expect(fetch.calls.map((c) => c.key)).toEqual([
      "GET api.vercel.com/v9/projects/roadmap-romashka",
      "GET api.vercel.com/v9/projects/prj_1/env",
    ]);
  });

  it("ставит Node 24.x у существующего проекта: сборка в Actions идёт на 24", async () => {
    const fetch = fakeFetch({
      "GET api.vercel.com/v9/projects/roadmap-romashka": [200, { id: "prj_1", nodeVersion: "26.x" }],
      "PATCH api.vercel.com/v9/projects/prj_1": [200, { id: "prj_1", nodeVersion: "24.x" }],
      "GET api.vercel.com/v9/projects/prj_1/env": [200, { envs: [{ key: "DATABASE_URL" }, { key: "CONTROL_PASSWORD" }, { key: "CLIENT_NAME" }] }],
    });
    const result = await provision({ ...base, neonKey: undefined, fetch });
    expect(result.code).toBe(0);
    const patch = fetch.calls.find((c) => c.key === "PATCH api.vercel.com/v9/projects/prj_1");
    expect(patch.body).toEqual({ nodeVersion: "24.x" });
  });

  it("стоп: Vercel не дал поменять версию Node", async () => {
    const fetch = fakeFetch({
      "GET api.vercel.com/v9/projects/roadmap-romashka": [200, { id: "prj_1", nodeVersion: "26.x" }],
      "PATCH api.vercel.com/v9/projects/prj_1": [400, { error: { message: "bad" } }],
    });
    const result = await provision({ ...base, fetch });
    expect(result.code).toBe(1);
    expect(result.message).toContain("24.x");
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
      "GET api.vercel.com/v9/projects/roadmap-romashka": [200, { id: "prj_1", nodeVersion: "24.x" }],
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
