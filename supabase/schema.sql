create extension if not exists "pgcrypto";

-- Core enums
create type task_status as enum ('todo', 'doing', 'done', 'canceled');
create type recurrence_freq as enum ('DAILY', 'WEEKLY', 'MONTHLY');

-- Profiles
create table public.profiles (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text,
  tz text default 'UTC',
  created_at timestamptz default timezone('utc', now())
);

-- Lists
create table public.lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  sort_index int default 0,
  is_system boolean default false,
  created_at timestamptz default timezone('utc', now())
);

-- Tasks
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  list_id uuid references public.lists(id) on delete cascade,
  title text not null,
  notes text,
  status task_status not null default 'todo',
  due_date date,
  planned_start timestamptz,
  planned_end timestamptz,
  estimate_minutes int,
  actual_minutes int,
  priority int default 0,
  sort_index double precision default 0,
  created_at timestamptz default timezone('utc', now()),
  updated_at timestamptz default timezone('utc', now())
);

create index tasks_user_due_date_idx on public.tasks(user_id, due_date);
create index tasks_user_updated_at_idx on public.tasks(user_id, updated_at);

-- Subtasks
create table public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  done boolean default false,
  sort_index int default 0
);

-- Labels
create table public.labels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  name text not null,
  color text not null
);

create table public.task_labels (
  task_id uuid references public.tasks(id) on delete cascade,
  label_id uuid references public.labels(id) on delete cascade,
  primary key (task_id, label_id)
);

-- Recurrences
create table public.recurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade default auth.uid(),
  template_task_id uuid references public.tasks(id) on delete cascade,
  title text not null,
  notes text,
  list_id uuid references public.lists(id) on delete set null,
  freq recurrence_freq not null,
  interval int not null default 1,
  byday int[] default '{}',
  by_monthday int[] default '{}',
  start_date date not null,
  until date,
  estimate_minutes int,
  priority int default 0,
  active boolean default true,
  created_at timestamptz default timezone('utc', now())
);

create index recurrences_user_active_start_idx on public.recurrences(user_id, active, start_date);

create table public.recurrence_occurrences (
  recurrence_id uuid not null references public.recurrences(id) on delete cascade,
  occurrence_date date not null,
  moved_to_date date,
  status task_status default 'todo',
  title text,
  notes text,
  list_id uuid references public.lists(id) on delete set null,
  planned_start timestamptz,
  planned_end timestamptz,
  actual_minutes int,
  skip boolean default false,
  primary key (recurrence_id, occurrence_date)
);

create index recurrence_occurrence_idx on public.recurrence_occurrences(recurrence_id, occurrence_date);

-- Row Level Security policies
alter table public.lists enable row level security;
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;
alter table public.labels enable row level security;
alter table public.task_labels enable row level security;
alter table public.recurrences enable row level security;
alter table public.recurrence_occurrences enable row level security;
alter table public.profiles enable row level security;

create policy "User can manage own profile" on public.profiles
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "User lists" on public.lists
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "User tasks" on public.tasks
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "User labels" on public.labels
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "User recurrences" on public.recurrences
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "User subtasks" on public.subtasks
  using (
    exists (
      select 1
      from public.tasks t
      where t.id = task_id and t.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.tasks t
      where t.id = task_id and t.user_id = auth.uid()
    )
  );

create policy "User task labels" on public.task_labels
  using (
    exists (
      select 1
      from public.tasks t
      join public.labels l on l.id = label_id
      where t.id = task_id and t.user_id = auth.uid() and l.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.tasks t
      join public.labels l on l.id = label_id
      where t.id = task_id and t.user_id = auth.uid() and l.user_id = auth.uid()
    )
  );

create policy "User recurrence overrides" on public.recurrence_occurrences
  using (
    exists (
      select 1
      from public.recurrences r
      where r.id = recurrence_id and r.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.recurrences r
      where r.id = recurrence_id and r.user_id = auth.uid()
    )
  );
