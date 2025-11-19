import { QueryClient } from "@tanstack/react-query";
import {
  deleteOutboxItem,
  deleteTask,
  enqueueOutbox,
  getOutbox,
  type LocalTask,
  upsertTask,
} from "./db";
import { getSession } from "../services/api/auth";
import {
  deleteTaskRow,
  fetchTasksWindow as fetchTasksWindowApi,
  subscribeToTaskEntities,
  upsertTaskRow,
  type TaskWindowRow,
} from "../services/api/tasks";
import { generateUUID, isUUID } from "./uuid";

export type { TaskWindowRow };

export async function fetchTasksWindow(start: string, end: string) {
  const rows = await fetchTasksWindowApi(start, end);
  for (const row of rows) {
    if (!row.is_recurring) {
      await upsertTask(row);
    }
  }
  return rows;
}

export async function queueTaskMutation(task: LocalTask) {
  const session = await getSession();
  const userId = task.user_id ?? session?.user.id;
  if (!userId) throw new Error("Missing authenticated user for task mutation");
  let payload: LocalTask = { ...task, user_id: userId };
  if (!isUUID(payload.id)) {
    const newId = generateUUID();
    await deleteTask(payload.id);
    payload = { ...payload, id: newId };
  }
  await upsertTask(payload);
  try {
    const result = await upsertTaskRow(payload);
    if (result?.id && result.id !== payload.id) {
      await deleteTask(payload.id);
      payload = { ...payload, id: result.id };
      await upsertTask(payload);
    }
  } catch (error) {
    await enqueueOutbox("tasks", "upsert", payload);
    throw error;
  }
}

export async function queueTaskDeletion(taskId: string) {
  await deleteTask(taskId);
  try {
    await deleteTaskRow(taskId);
  } catch (error) {
    await enqueueOutbox("tasks", "delete", { id: taskId });
    throw error;
  }
}

export async function pushOutbox() {
  const items = await getOutbox(25);
  for (const item of items) {
    if (item.entity === "tasks") {
      if (item.operation === "upsert") {
        let payload = item.payload as LocalTask;
        if (!isUUID(payload.id)) {
          const newId = generateUUID();
          await deleteTask(payload.id);
          payload = { ...payload, id: newId };
        }
        try {
          await upsertTask(payload);
          const result = await upsertTaskRow(payload);
          if (result?.id && result.id !== payload.id) {
            await deleteTask(payload.id);
            payload = { ...payload, id: result.id };
            await upsertTask(payload);
          }
          await deleteOutboxItem(item.id);
        } catch (error) {
          console.warn("Failed to replay upsert", error);
        }
      } else if (item.operation === "delete") {
        const { id } = item.payload as { id: string };
        if (!isUUID(id)) {
          await deleteTask(id);
          await deleteOutboxItem(item.id);
          continue;
        }
        try {
          await deleteTaskRow(id);
          await deleteOutboxItem(item.id);
        } catch (error) {
          console.warn("Failed to replay delete", error);
        }
      }
    }
  }
}

export function subscribeToRealtime(queryClient: QueryClient) {
  return subscribeToTaskEntities(() => queryClient.invalidateQueries({ queryKey: ["tasks"] }));
}
