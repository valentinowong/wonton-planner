export type AssigneeFilterValue = "me" | "all" | "unassigned" | `user:${string}`;

export type PlannerFiltersState = {
  assignee: AssigneeFilterValue;
  status: "all" | "todo" | "done";
  planned: "all" | "scheduled" | "unscheduled";
};
