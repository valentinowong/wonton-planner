Prevent duplicate first-day tasks for recurrences (hide template task)

- Goal: Avoid showing both the template task and the generated first occurrence on the start date.
- Plan:
  1) Update get_tasks_window via a new Supabase migration to exclude tasks whose id matches a recurrence.template_task_id for the current user.
  2) Revert UI “start day after” workaround so recurrence start_date stays on the template date.
  3) Quick validation: create a recurrence starting today; only one entry appears on start day; normal tasks unaffected.
  4) Deactivate the Repeat Task button unless the task already has a due date
