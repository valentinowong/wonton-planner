import { Platform } from "react-native";
import { openDatabaseSync, type SQLiteDatabase } from "expo-sqlite";

export type LocalTask = {
  id: string;
  user_id?: string;
  list_id: string | null;
  assignee_id?: string | null;
  assignee_display_name?: string | null;
  assignee_email?: string | null;
  title: string;
  notes?: string | null;
  status: "todo" | "doing" | "done" | "canceled";
  due_date?: string | null;
  planned_start?: string | null;
  planned_end?: string | null;
  estimate_minutes?: number | null;
  actual_minutes?: number | null;
  priority?: number | null;
  sort_index?: number | null;
  updated_at?: string | null;
  // Recurrence metadata (not stored in the local DB, but kept on task objects for UI logic)
  is_recurring?: boolean;
  recurrence_id?: string | null;
  occurrence_date?: string | null;
  moved_to_date?: string | null;
};

export type LocalList = {
  id: string;
  name: string;
  sort_index: number;
  is_system: number;
};

export type LocalSubtask = {
  id: string;
  task_id: string;
  title: string;
  done: number;
  sort_index: number;
};

export type OutboxItem = {
  id: string;
  entity: string;
  operation: string;
  payload: Record<string, unknown>;
  created_at: string;
};

const isSQLiteSupported = Platform.OS !== "web";
const db = isSQLiteSupported ? openDatabaseSync("planner.db") : null;
const memoryOutbox: OutboxItem[] = [];

const MIGRATIONS: string[] = [
  `create table if not exists meta(key text primary key, value text);`,
  `create table if not exists lists (
      id text primary key,
      name text not null,
      sort_index integer default 0,
      is_system integer default 0,
      updated_at text
    );`,
  `create table if not exists tasks (
      id text primary key,
      user_id text,
      list_id text,
      assignee_id text,
      title text not null,
      notes text,
      status text default 'todo',
      due_date text,
      planned_start text,
      planned_end text,
      estimate_minutes integer,
      actual_minutes integer,
      priority integer,
      sort_index integer,
      updated_at text
    );`,
  `create table if not exists subtasks (
      id text primary key,
      task_id text not null,
      title text not null,
      done integer default 0,
      sort_index integer default 0
    );`,
  `create table if not exists labels (
      id text primary key,
      name text not null,
      color text not null
    );`,
  `create table if not exists task_labels (
      task_id text not null,
      label_id text not null,
      primary key (task_id, label_id)
    );`,
  `create table if not exists recurrences (
      id text primary key,
      template_task_id text,
      title text not null,
      notes text,
      list_id text,
      freq text not null,
      interval integer default 1,
      byday text,
      by_monthday text,
      start_date text not null,
      until text,
      planned_start text,
      planned_end text,
      estimate_minutes integer,
      priority integer,
      active integer default 1,
      updated_at text
    );`,
  `create table if not exists recurrence_overrides (
      recurrence_id text not null,
      occurrence_date text not null,
      moved_to_date text,
      status text,
      title text,
      notes text,
      list_id text,
      planned_start text,
      planned_end text,
      actual_minutes integer,
      skip integer default 0,
      primary key (recurrence_id, occurrence_date)
    );`,
  `create table if not exists outbox (
      id text primary key,
      entity text not null,
      operation text not null,
      payload text not null,
      created_at text not null
    );`,
  `alter table tasks add column if not exists assignee_id text;`,
];

let initialized = false;

export async function initializeDatabase() {
  if (initialized) return;
  if (!db) {
    initialized = true;
    return;
  }
  await db.execAsync("pragma journal_mode = wal;");
  for (const statement of MIGRATIONS) {
    await db.execAsync(statement);
  }
  await ensureRecurrenceTemplateColumn();
  await ensureRecurrencePlannedColumns();
  await ensureTasksTableAllowsNullListId();
  initialized = true;
}

async function ensureRecurrenceTemplateColumn() {
  if (!db) return;
  type ColumnInfo = { name: string };
  const columns = await db.getAllAsync<ColumnInfo>("pragma table_info('recurrences');");
  const hasTemplate = columns.some((column) => column.name === "template_task_id");
  if (!hasTemplate) {
    await db.execAsync("alter table recurrences add column template_task_id text;");
  }
}

async function ensureRecurrencePlannedColumns() {
  if (!db) return;
  type ColumnInfo = { name: string };
  const columns = await db.getAllAsync<ColumnInfo>("pragma table_info('recurrences');");
  const hasPlannedStart = columns.some((column) => column.name === "planned_start");
  const hasPlannedEnd = columns.some((column) => column.name === "planned_end");
  if (!hasPlannedStart) {
    await db.execAsync("alter table recurrences add column planned_start text;");
  }
  if (!hasPlannedEnd) {
    await db.execAsync("alter table recurrences add column planned_end text;");
  }
}

async function ensureTasksTableAllowsNullListId() {
  if (!db) return;
  type ColumnInfo = { name: string; notnull: number };
  const columns = await db.getAllAsync<ColumnInfo>("pragma table_info('tasks');");
  const listColumn = columns.find((column) => column.name === "list_id");
  if (!listColumn || listColumn.notnull === 0) return;
  const hasAssignee = columns.some((column) => column.name === "assignee_id");
  await db.execAsync("BEGIN TRANSACTION;");
  try {
    await db.execAsync("ALTER TABLE tasks RENAME TO tasks_old;");
    await db.execAsync(
      `create table tasks (
        id text primary key,
        user_id text,
        list_id text,
        assignee_id text,
        title text not null,
        notes text,
        status text default 'todo',
        due_date text,
        planned_start text,
        planned_end text,
        estimate_minutes integer,
        actual_minutes integer,
        priority integer,
        sort_index integer,
        updated_at text
      );`,
    );
    await db.execAsync(
      `insert into tasks (
        id, user_id, list_id, assignee_id, title, notes, status, due_date, planned_start, planned_end,
        estimate_minutes, actual_minutes, priority, sort_index, updated_at
      )
      select
        id, user_id, list_id, ${hasAssignee ? "assignee_id" : "null"} as assignee_id, title, notes, status, due_date, planned_start, planned_end,
        estimate_minutes, actual_minutes, priority, sort_index, updated_at
      from tasks_old;`,
    );
    await db.execAsync("drop table tasks_old;");
    await db.execAsync("COMMIT;");
  } catch (error) {
    await db.execAsync("ROLLBACK;");
    throw error;
  }
}

export async function upsertTask(task: LocalTask) {
  await initializeDatabase();
  if (!db) return;
  await db.runAsync(
    `insert into tasks (
        id, user_id, list_id, assignee_id, title, notes, status, due_date, planned_start, planned_end,
        estimate_minutes, actual_minutes, priority, sort_index, updated_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      on conflict(id) do update set
        user_id=excluded.user_id,
        list_id=excluded.list_id,
        assignee_id=excluded.assignee_id,
        title=excluded.title,
        notes=excluded.notes,
        status=excluded.status,
        due_date=excluded.due_date,
        planned_start=excluded.planned_start,
        planned_end=excluded.planned_end,
        estimate_minutes=excluded.estimate_minutes,
        actual_minutes=excluded.actual_minutes,
        priority=excluded.priority,
        sort_index=excluded.sort_index,
        updated_at=excluded.updated_at;
    `,
    [
      task.id,
      task.user_id ?? null,
      task.list_id,
      task.assignee_id ?? null,
      task.title,
      task.notes ?? null,
      task.status,
      task.due_date ?? null,
      task.planned_start ?? null,
      task.planned_end ?? null,
      task.estimate_minutes ?? null,
      task.actual_minutes ?? null,
      task.priority ?? null,
      task.sort_index ?? null,
      task.updated_at ?? new Date().toISOString(),
    ],
  );
}

export async function getTasksByDateRange(start: string, end: string) {
  await initializeDatabase();
  if (!db) return [];
  const rows = await db.getAllAsync<LocalTask>(
    `select * from tasks where due_date between ? and ? order by due_date, sort_index;`,
    [start, end],
  );
  return rows;
}

export async function getInboxTasks() {
  await initializeDatabase();
  if (!db) return [];
  return db.getAllAsync<LocalTask>(
    `select * from tasks where due_date is null order by updated_at desc;`,
  );
}

export async function deleteTask(id: string) {
  await initializeDatabase();
  if (!db) return;
  await db.runAsync(`delete from tasks where id = ?`, [id]);
}

export async function upsertList(list: LocalList) {
  await initializeDatabase();
  if (!db) return;
  await db.runAsync(
    `insert into lists (id, name, sort_index, is_system, updated_at)
      values (?, ?, ?, ?, ?)
      on conflict(id) do update set
        name=excluded.name,
        sort_index=excluded.sort_index,
        is_system=excluded.is_system,
        updated_at=excluded.updated_at;
    `,
    [list.id, list.name, list.sort_index, list.is_system, new Date().toISOString()],
  );
}

export async function getLists() {
  await initializeDatabase();
  if (!db) return [];
  return db.getAllAsync<LocalList>(`select * from lists order by sort_index, name;`);
}

export async function upsertSubtask(subtask: LocalSubtask) {
  await initializeDatabase();
  if (!db) return;
  await db.runAsync(
    `insert into subtasks (id, task_id, title, done, sort_index)
      values (?, ?, ?, ?, ?)
      on conflict(id) do update set
        title=excluded.title,
        done=excluded.done,
        sort_index=excluded.sort_index;
    `,
    [subtask.id, subtask.task_id, subtask.title, subtask.done, subtask.sort_index],
  );
}

export async function getSubtasks(taskId: string) {
  await initializeDatabase();
  if (!db) return [];
  return db.getAllAsync<LocalSubtask>(
    `select * from subtasks where task_id = ? order by sort_index;`,
    [taskId],
  );
}

export async function toggleSubtask(subtaskId: string, done: boolean) {
  await initializeDatabase();
  if (!db) return;
  await db.runAsync(`update subtasks set done = ? where id = ?`, [done ? 1 : 0, subtaskId]);
}

export async function enqueueOutbox(entity: string, operation: string, payload: Record<string, unknown>) {
  await initializeDatabase();
  const id = `${entity}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  if (!db) {
    memoryOutbox.push({ id, entity, operation, payload, created_at: new Date().toISOString() });
    return id;
  }
  await db.runAsync(
    `insert into outbox (id, entity, operation, payload, created_at) values (?, ?, ?, ?, ?);`,
    [id, entity, operation, JSON.stringify(payload), new Date().toISOString()],
  );
  return id;
}

type OutboxRow = Omit<OutboxItem, "payload"> & { payload: string };

export async function getOutbox(limit = 10) {
  await initializeDatabase();
  if (!db) {
    return memoryOutbox.slice(0, limit);
  }
  const rows = await db.getAllAsync<OutboxRow>(
    `select * from outbox order by created_at asc limit ?;`,
    [limit],
  );
  return rows.map((row) => ({
    ...row,
    payload: JSON.parse(row.payload ?? "{}"),
  })) as OutboxItem[];
}

export async function deleteOutboxItem(id: string) {
  await initializeDatabase();
  if (!db) {
    const index = memoryOutbox.findIndex((item) => item.id === id);
    if (index >= 0) memoryOutbox.splice(index, 1);
    return;
  }
  await db.runAsync(`delete from outbox where id = ?`, [id]);
}

export const database: SQLiteDatabase | null = db;
