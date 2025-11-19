import { useMemo } from "react";
import { useLocalSearchParams } from "expo-router";
import { TaskDetailView } from "../../src/components/TaskDetailView";

export default function TaskDetailScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const taskId = useMemo(() => (Array.isArray(params.id) ? params.id[0] : params.id ?? ""), [params.id]);

  if (!taskId) {
    return null;
  }

  return <TaskDetailView taskId={taskId} />;
}
