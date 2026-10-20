export type TaskStatus =
  | "Не начато"
  | "В работе"
  | "На проверке"
  | "Завершено"
  | "Просрочено";

export type IdeaStatus =
  | "Новая"
  | "На обсуждении"
  | "Одобрена"
  | "В реализации"
  | "Реализована"
  | "Отклонена";

export type Priority = "Высокий" | "Средний" | "Низкий";
export type MeetingStatus = "planned" | "completed" | "cancelled";
export type MeetingDuration = "Меньше получаса" | "Час" | "2 часа";
export type RegularFrequency = "weekly" | "monthly" | "quarterly";
export type ReportStatus = "Работает" | "В разработке" | "Не используется";

export interface AccountingReportVariant {
  id: string;
  title: string;
  url: string;
}

export interface AccountingReport {
  id: string;
  title: string;
  icon: string;
  assignee: string;
  deadline: string;
  status: ReportStatus;
  essence: string;
  sources: string;
  closingStages: string;
  variants: string;
  variantLinks?: AccountingReportVariant[];
  accountingFeatures: string;
  attributes: string;
  referenceMaterials: string;
}

export interface RegularRecord {
  actualDate: string;
  note: string;
}

export interface RegularTask {
  id: string;
  parentId: string | null;
  title: string;
  assignee: string;
  frequency: RegularFrequency;
  anchorDate: string;
  description: string;
  records: Record<string, RegularRecord>;
}

export type ShiftReason = "client" | "fd" | "priority" | "blocker" | "other";

// Перенос срока задачи. История копится в задаче, старые записи не правятся.
export interface TaskShift {
  date: string;      // день, когда перенесли
  from: string;      // срок до переноса
  to: string;        // новый срок
  reason: ShiftReason;
  holdCode: string;  // код контрольной точки, которая держит; пусто — не выбрана
  note: string;
}

export interface Task {
  id: string;
  parentId: string | null;
  title: string;
  assignee: string;
  status: TaskStatus;
  startDate: string;
  endDate: string;
  comments: string[];
  // Пользовательские метки обычных задач и спринтов.
  labels?: string[];
  // Ссылка на шаблон заполнена только у типовых задач.
  template?: TaskTemplateRef;
  // Чек-лист доступен у обычных и типовых спринтов.
  groups?: CheckpointGroup[];
  // Переносы срока с причинами — по порядку.
  shifts?: TaskShift[];
  // День перевода в статус «Завершено»; у задач, завершённых до появления поля, пусто.
  completedAt?: string;
}

export interface BaselineTask {
  startDate: string;
  endDate: string;
}

// Контрольная точка: создаётся вручную или копируется из шаблона.
// Текст, пояснение и состав точек можно менять независимо от шаблона.
export interface Checkpoint {
  code: string;        // «ДДС-1.5», стабильный ключ
  title: string;
  aside: string;       // ремарка в скобках, например «параллельно с интеграцией»
  gate: boolean;       // контрольные ворота — без них спринт не считается закрытым
  noteTitle: string;   // заголовок пояснения; пустой, если пояснения нет
  note: string;        // текст пояснения
  done: boolean;
  date?: string;       // срок «ГГГГ-ММ-ДД»; без него точка не выводится на диаграмму Ганта
  assignee?: string;   // ответственный за точку; пусто — отвечает ответственный спринта
  doneAt?: string;     // день, когда точку отметили сделанной
  requests?: string[]; // дни запросов клиенту, по возрастанию
}

export interface CheckpointGroup {
  title: string;       // «ФМ-1а. Сбор данных…» или пустая строка
  result: string;      // «Проверочный результат», может быть пустым
  items: Checkpoint[];
}

export interface TaskTemplateRef {
  code: string;        // код шаблона, «ДДС»
  subCode?: string;    // код спринта, «ДДС-1» — только у спринтов
  week?: number;       // номер спринта — только у спринтов
}

// Срез сроков дорожной карты: дата снимка (ISO) → id задачи → её сроки на тот момент.
// Храним только даты, чтобы история оставалась лёгкой.
export type Baselines = Record<string, Record<string, BaselineTask>>;

export interface Idea {
  id: string;
  title: string;
  description: string;
  status: IdeaStatus;
  priority: Priority;
  owner: string;
  effect: string;
  deadline: string;
  comments: string[];
}

export interface Meeting {
  id: string;
  title: string;
  plannedDate: string;
  plannedTime: string;
  participants: string;
  agenda: string;
  status: MeetingStatus;
  actualDate: string;
  actualTime: string;
  duration: MeetingDuration | "";
  outcome: string;
  comments: string[];
  // Повторяющиеся встречи остаются самостоятельными записями, но помнят свою серию:
  // это даёт удаление и правку «этой», «этой и последующих» или «всей серии».
  seriesId?: string;
  seriesFrequency?: RegularFrequency;
}

export interface DashboardData {
  clientName: string;
  people: string[];
  tasks: Task[];
  ideas: Idea[];
  meetings: Meeting[];
  regularTasks: RegularTask[];
  reports: AccountingReport[];
  baselines: Baselines;
  // Ручные отметки закрытия месяца: «ГГГГ-ММ» закрываемого месяца → день закрытия.
  // Если отметка есть, она главнее расчёта по ежемесячным регулярным задачам.
  monthClosings?: Record<string, string>;
}
