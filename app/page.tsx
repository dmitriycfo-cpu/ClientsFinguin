import { promises as fs } from "node:fs";
import path from "node:path";
import { connection } from "next/server";
import Dashboard from "@/components/dashboard";
import { toISO } from "@/lib/dates";
import { DEFAULT_DATA } from "@/lib/default-data";
import { getDashboardData, resolveDatabaseUrl } from "@/lib/store";
import { parseTypicalTasks } from "@/lib/typical-tasks";

// Справочник типовых задач лежит в репозитории и читается при сборке страницы.
// Ошибка формата валит сборку — так кривой шаблон не доедет до клиентов.
async function loadTemplates() {
  const markdown = await fs.readFile(path.join(process.cwd(), "docs", "typical-tasks.md"), "utf8");
  return parseTypicalTasks(markdown);
}

// Данные клиента читаются на сервере при каждом запросе, чтобы страница сразу приходила
// с его задачами, а не мелькала стандартным шаблоном до ответа /api/data. Если база
// недоступна, отдаём шаблон без пометки о хранилище — клиент сам повторит запрос и покажет ошибку.
async function loadInitialData() {
  try {
    const data = await getDashboardData();
    return { data, storage: resolveDatabaseUrl() ? "postgres" as const : "local" as const };
  } catch (error) {
    console.error("Failed to load dashboard data on the server", error);
    return { data: DEFAULT_DATA, storage: null };
  }
}

export default async function Page() {
  const templates = await loadTemplates();
  await connection();
  const { data, storage } = await loadInitialData();
  // Дата, с которой отрендерена серверная разметка. Клиент получает её как серверный
  // снимок, чтобы гидратация прошла без расхождений, а сразу после неё React заменит её
  // настоящей датой браузера. Без этого пропса клиент считал бы серверный снимок сам и
  // получал бы не то, что вшито в HTML.
  return <Dashboard initialData={data} initialStorage={storage} serverToday={toISO(new Date())} templates={templates} />;
}
