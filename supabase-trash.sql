alter table public.tasks
add column if not exists deleted_at timestamptz;

alter table public.tasks
add column if not exists task_bucket text not null default 'active';