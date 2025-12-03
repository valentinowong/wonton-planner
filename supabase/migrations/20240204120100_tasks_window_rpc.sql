create extension if not exists "uuid-ossp" with schema extensions;

create or replace function public.uuid_v5(namespace uuid, name text)
returns uuid
language sql
immutable
as $$
  select extensions.uuid_generate_v5(namespace, name);
$$;

create or replace function public.get_tasks_window(_start date, _end date)
returns table (
  id uuid,
  user_id uuid,
  list_id uuid,
  title text,
  notes text,
  status task_status,
  due_date date,
  planned_start timestamptz,
  planned_end timestamptz,
  estimate_minutes int,
  actual_minutes int,
  priority int,
  sort_index int,
  is_recurring boolean,
  recurrence_id uuid,
  occurrence_date date,
  moved_to_date date
)
security definer
set search_path = public
language sql
stable
as $$
  with window_days as (
    select generate_series(_start, _end, interval '1 day')::date as day
  ),
  expanded as (
    select
      uuid_v5(r.id, d.day::text) as id,
      r.user_id,
      coalesce(occ.list_id, r.list_id) as list_id,
      coalesce(occ.title, r.title) as title,
      coalesce(occ.notes, r.notes) as notes,
      coalesce(occ.status, 'todo') as status,
      coalesce(occ.moved_to_date, d.day) as due_date,
      coalesce(occ.planned_start, null) as planned_start,
      coalesce(occ.planned_end, null) as planned_end,
      r.estimate_minutes,
      coalesce(occ.actual_minutes, null) as actual_minutes,
      r.priority,
      0 as sort_index,
      true as is_recurring,
      r.id as recurrence_id,
      d.day as occurrence_date,
      occ.moved_to_date,
      occ.skip
    from public.recurrences r
    join window_days d on d.day between _start and _end
    left join public.recurrence_occurrences occ
      on occ.recurrence_id = r.id and occ.occurrence_date = d.day
    where r.user_id = auth.uid()
      and r.active
      and r.start_date <= d.day
      and (r.until is null or d.day <= r.until)
      and (occ.skip is distinct from true)
      and (
        case r.freq
          when 'DAILY' then ((d.day - r.start_date)::int % r.interval = 0)
          when 'WEEKLY' then (
            floor(extract(epoch from (d.day::timestamp - r.start_date::timestamp)) / 604800)::int % r.interval = 0
          )
          when 'MONTHLY' then ((date_part('year', age(d.day, r.start_date)) * 12 + date_part('month', age(d.day, r.start_date)))::int % r.interval = 0)
        end
      )
      and (
        coalesce(cardinality(r.byday), 0) = 0
        or extract(dow from d.day)::int = any(r.byday)
      )
      and (
        coalesce(cardinality(r.by_monthday), 0) = 0
        or extract(day from d.day)::int = any(r.by_monthday)
      )
  )
  select * from (
    select
      t.id,
      t.user_id,
      t.list_id,
      t.title,
      t.notes,
      t.status,
      t.due_date,
      t.planned_start,
      t.planned_end,
      t.estimate_minutes,
      t.actual_minutes,
      t.priority,
      t.sort_index,
      false as is_recurring,
      null::uuid as recurrence_id,
      null::date as occurrence_date,
      null::date as moved_to_date
    from public.tasks t
    where t.user_id = auth.uid()
      and t.due_date between _start and _end

    union all

    select
      e.id,
      e.user_id,
      e.list_id,
      e.title,
      e.notes,
      e.status,
      e.due_date,
      e.planned_start,
      e.planned_end,
      e.estimate_minutes,
      e.actual_minutes,
      e.priority,
      e.sort_index,
      e.is_recurring,
      e.recurrence_id,
      e.occurrence_date,
      e.moved_to_date
    from expanded e
  ) combined
  order by due_date, sort_index, priority desc;
$$;

grant execute on function public.uuid_v5(uuid, text) to anon, authenticated;
grant execute on function public.get_tasks_window(date, date) to anon, authenticated;
