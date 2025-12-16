-- Hide template tasks from window listings; only show generated recurrence occurrences on the template date.

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.get_tasks_window(_start date, _end date)
 RETURNS TABLE(id uuid, user_id uuid, list_id uuid, assignee_id uuid, assignee_display_name text, assignee_email text, title text, notes text, status public.task_status, due_date date, planned_start timestamp with time zone, planned_end timestamp with time zone, estimate_minutes integer, actual_minutes integer, priority integer, sort_index integer, is_recurring boolean, recurrence_id uuid, occurrence_date date, moved_to_date date)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with window_days as (
    select generate_series(_start, _end, interval '1 day')::date as day
  ),
  expanded as (
    select
      uuid_v5(r.id, d.day::text) as id,
      r.user_id,
      coalesce(occ.list_id, r.list_id) as list_id,
      null::uuid as assignee_id,
      null::text as assignee_display_name,
      null::text as assignee_email,
      coalesce(occ.title, r.title) as title,
      coalesce(occ.notes, r.notes) as notes,
      coalesce(occ.status, 'todo') as status,
      coalesce(occ.moved_to_date, d.day) as due_date,
      coalesce(occ.planned_start, r.planned_start) as planned_start,
      coalesce(occ.planned_end, r.planned_end) as planned_end,
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
      t.assignee_id,
      p.display_name as assignee_display_name,
      u.email as assignee_email,
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
    left join public.profiles p on p.user_id = t.assignee_id
    left join auth.users u on u.id = t.assignee_id
    where t.due_date between _start and _end
      and (
        t.user_id = auth.uid()
        or t.assignee_id = auth.uid()
        or (t.list_id is not null and list_shared_with_user(t.list_id, auth.uid()))
      )
      and not exists (
        select 1
        from public.recurrences r
        where r.template_task_id = t.id
          and r.user_id = auth.uid()
      )

    union all

    select
      e.id,
      e.user_id,
      e.list_id,
      e.assignee_id,
      e.assignee_display_name,
      e.assignee_email,
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
$function$;

set check_function_bodies = on;
