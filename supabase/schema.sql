create extension if not exists pgcrypto;

do $$
begin
  create type public.app_role as enum ('member', 'admin');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.moderation_status as enum ('pending', 'approved', 'rejected');
exception
  when duplicate_object then null;
end $$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role public.app_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tools (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  category text not null,
  name text not null,
  best_for text not null default '',
  pricing text not null default '',
  strengths text not null default '',
  caveats text not null default '',
  status text not null default 'Current',
  website_url text not null check (website_url ~* '^https?://'),
  source_url text not null default '',
  last_checked date,
  source_type text not null default 'spreadsheet',
  moderation_status public.moderation_status not null default 'approved',
  submitted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.tools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tool_id, user_id)
);

create table if not exists public.tool_uses (
  tool_id uuid not null references public.tools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (tool_id, user_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  tool_id uuid not null references public.tools(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  body text not null check (char_length(trim(body)) between 2 and 4000),
  moderation_status public.moderation_status not null default 'pending',
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tool_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 160),
  category text not null,
  best_for text not null default '',
  pricing text not null default '',
  website_url text not null check (website_url ~* '^https?://'),
  notes text not null default '',
  display_name text,
  contact_email text,
  moderation_status public.moderation_status not null default 'pending',
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists tools_touch_updated_at on public.tools;
create trigger tools_touch_updated_at
before update on public.tools
for each row execute function public.touch_updated_at();

drop trigger if exists ratings_touch_updated_at on public.ratings;
create trigger ratings_touch_updated_at
before update on public.ratings
for each row execute function public.touch_updated_at();

drop trigger if exists comments_touch_updated_at on public.comments;
create trigger comments_touch_updated_at
before update on public.comments
for each row execute function public.touch_updated_at();

drop trigger if exists tool_suggestions_touch_updated_at on public.tool_suggestions;
create trigger tool_suggestions_touch_updated_at
before update on public.tool_suggestions
for each row execute function public.touch_updated_at();

create index if not exists tools_category_idx on public.tools (category);
create index if not exists tools_moderation_status_idx on public.tools (moderation_status);
create index if not exists ratings_tool_id_idx on public.ratings (tool_id);
create index if not exists comments_tool_id_status_idx on public.comments (tool_id, moderation_status);
create index if not exists tool_uses_tool_id_idx on public.tool_uses (tool_id);
create index if not exists tool_suggestions_status_idx on public.tool_suggestions (moderation_status);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_email_updated on auth.users;
create trigger on_auth_user_email_updated
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'admin'
  );
$$;

create or replace function public.slugify(value text)
returns text
language sql
immutable
as $$
  select trim(both '-' from regexp_replace(lower(trim(value)), '[^a-z0-9]+', '-', 'g'));
$$;

create or replace function public.approve_tool_suggestion(p_suggestion_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  suggestion public.tool_suggestions%rowtype;
  next_slug text;
  inserted_tool_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Admin role required';
  end if;

  select *
  into suggestion
  from public.tool_suggestions
  where id = p_suggestion_id
  for update;

  if not found then
    raise exception 'Tool suggestion not found';
  end if;

  next_slug := public.slugify(suggestion.name);
  if exists (select 1 from public.tools where slug = next_slug) then
    next_slug := next_slug || '-' || substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8);
  end if;

  insert into public.tools (
    slug,
    category,
    name,
    best_for,
    pricing,
    strengths,
    caveats,
    status,
    website_url,
    source_url,
    last_checked,
    source_type,
    moderation_status,
    submitted_by
  )
  values (
    next_slug,
    suggestion.category,
    suggestion.name,
    suggestion.best_for,
    suggestion.pricing,
    coalesce(nullif(suggestion.notes, ''), suggestion.best_for),
    'Community-submitted tool. Details should be verified by an admin.',
    'Current',
    suggestion.website_url,
    suggestion.website_url,
    current_date,
    'suggestion',
    'approved',
    suggestion.user_id
  )
  returning id into inserted_tool_id;

  update public.tool_suggestions
  set moderation_status = 'approved'
  where id = p_suggestion_id;

  return inserted_tool_id;
end;
$$;

alter table public.profiles enable row level security;
alter table public.tools enable row level security;
alter table public.ratings enable row level security;
alter table public.tool_uses enable row level security;
alter table public.comments enable row level security;
alter table public.tool_suggestions enable row level security;

drop policy if exists "profiles select own or admin" on public.profiles;
create policy "profiles select own or admin"
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update"
on public.profiles
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "tools public read approved" on public.tools;
create policy "tools public read approved"
on public.tools
for select
to anon, authenticated
using (moderation_status = 'approved' or public.is_admin());

drop policy if exists "tools admin insert" on public.tools;
create policy "tools admin insert"
on public.tools
for insert
to authenticated
with check (public.is_admin());

drop policy if exists "tools admin update" on public.tools;
create policy "tools admin update"
on public.tools
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "tools admin delete" on public.tools;
create policy "tools admin delete"
on public.tools
for delete
to authenticated
using (public.is_admin());

drop policy if exists "ratings public read" on public.ratings;
drop policy if exists "ratings select own or admin" on public.ratings;
create policy "ratings select own or admin"
on public.ratings
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "ratings insert own" on public.ratings;
create policy "ratings insert own"
on public.ratings
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "ratings update own" on public.ratings;
create policy "ratings update own"
on public.ratings
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "ratings delete own" on public.ratings;
create policy "ratings delete own"
on public.ratings
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "tool uses public read" on public.tool_uses;
drop policy if exists "tool uses select own or admin" on public.tool_uses;
create policy "tool uses select own or admin"
on public.tool_uses
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "tool uses insert own" on public.tool_uses;
create policy "tool uses insert own"
on public.tool_uses
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "tool uses delete own" on public.tool_uses;
create policy "tool uses delete own"
on public.tool_uses
for delete
to authenticated
using (user_id = auth.uid());

drop policy if exists "comments select public own admin" on public.comments;
create policy "comments select public own admin"
on public.comments
for select
to anon, authenticated
using (
  moderation_status = 'approved'
  or user_id = auth.uid()
  or public.is_admin()
);

drop policy if exists "comments insert own pending" on public.comments;
create policy "comments insert own pending"
on public.comments
for insert
to authenticated
with check (
  user_id = auth.uid()
  and moderation_status = 'pending'
);

drop policy if exists "comments update own pending" on public.comments;
create policy "comments update own pending"
on public.comments
for update
to authenticated
using (
  user_id = auth.uid()
  and moderation_status = 'pending'
)
with check (
  user_id = auth.uid()
  and moderation_status = 'pending'
);

drop policy if exists "comments admin update" on public.comments;
create policy "comments admin update"
on public.comments
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "comments delete own or admin" on public.comments;
create policy "comments delete own or admin"
on public.comments
for delete
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "tool suggestions select own or admin" on public.tool_suggestions;
create policy "tool suggestions select own or admin"
on public.tool_suggestions
for select
to authenticated
using (user_id = auth.uid() or public.is_admin());

drop policy if exists "tool suggestions insert own pending" on public.tool_suggestions;
create policy "tool suggestions insert own pending"
on public.tool_suggestions
for insert
to authenticated
with check (
  user_id = auth.uid()
  and moderation_status = 'pending'
);

drop policy if exists "tool suggestions admin update" on public.tool_suggestions;
create policy "tool suggestions admin update"
on public.tool_suggestions
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "tool suggestions admin delete" on public.tool_suggestions;
create policy "tool suggestions admin delete"
on public.tool_suggestions
for delete
to authenticated
using (public.is_admin());

create or replace view public.tool_metrics
as
with rating_metrics as (
  select
    tool_id,
    round(avg(rating)::numeric, 2) as average_rating,
    count(*)::integer as rating_count
  from public.ratings
  group by tool_id
),
use_metrics as (
  select
    tool_id,
    count(*)::integer as use_count
  from public.tool_uses
  group by tool_id
),
comment_metrics as (
  select
    tool_id,
    count(*)::integer as comment_count
  from public.comments
  where moderation_status = 'approved'
  group by tool_id
)
select
  tools.id as tool_id,
  rating_metrics.average_rating,
  coalesce(rating_metrics.rating_count, 0) as rating_count,
  coalesce(use_metrics.use_count, 0) as use_count,
  coalesce(comment_metrics.comment_count, 0) as comment_count
from public.tools
left join rating_metrics on rating_metrics.tool_id = tools.id
left join use_metrics on use_metrics.tool_id = tools.id
left join comment_metrics on comment_metrics.tool_id = tools.id
where tools.moderation_status = 'approved'
group by
  tools.id,
  rating_metrics.average_rating,
  rating_metrics.rating_count,
  use_metrics.use_count,
  comment_metrics.comment_count;

grant usage on schema public to anon, authenticated;
grant select on public.tools, public.comments to anon, authenticated;
grant select on public.tool_metrics to anon, authenticated;
grant select, insert, update, delete on public.ratings, public.tool_uses, public.comments to authenticated;
grant select, insert, update, delete on public.tool_suggestions to authenticated;
grant select, insert, update, delete on public.tools to authenticated;
grant select, update on public.profiles to authenticated;
grant execute on function public.approve_tool_suggestion(uuid) to authenticated;
