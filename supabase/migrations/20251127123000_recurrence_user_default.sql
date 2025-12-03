-- Ensure recurrences.user_id defaults to the authenticated user
alter table public.recurrences alter column user_id set default auth.uid();
