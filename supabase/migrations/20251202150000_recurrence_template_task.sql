-- Link recurrences to their template task instead of deleting the original task.

alter table public.recurrences
  add column if not exists template_task_id uuid references public.tasks(id) on delete cascade;

-- No backfill here; client will start writing template_task_id.
