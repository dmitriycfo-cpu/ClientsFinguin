import { promises as fs } from "node:fs";
import path from "node:path";
import Dashboard from "@/components/dashboard";
import { toISO } from "@/lib/dates";
import { DEFAULT_DATA } from "@/lib/default-data";
import { parseTypicalTasks } from "@/lib/typical-tasks";

// Справочник типовых задач лежит в репозитории и читается при сборке страницы.
// Ошибка формата валит сборку — так кривой шаблон не доедет до клиентов.
async function loadTemplates() {
  const markdown = await fs.readFile(path.join(process.cwd(), "docs", "typical-tasks.md"), "utf8");
  return parseTypicalTasks(markdown);
}

export default async function Page() {
  const templates = await loadTemplates();
  // Дата, с которой отрендерена статическая разметка. Клиент получает её как серверный
  // снимок, чтобы гидратация прошла без расхождений, а сразу после неё React заменит её
  // настоящей датой браузера. Без этого пропса клиент считал бы серверный снимок сам и
  // получал бы не то, что вшито в HTML.
  return <Dashboard initialData={DEFAULT_DATA} serverToday={toISO(new Date())} templates={templates} />;
}
