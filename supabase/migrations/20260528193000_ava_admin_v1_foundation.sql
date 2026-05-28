create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.ava_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  constraint ava_admins_email_normalized check (email = lower(trim(email))),
  constraint ava_admins_email_length check (char_length(email) between 3 and 254)
);

create unique index if not exists ava_admins_email_key on public.ava_admins (email);
create unique index if not exists ava_admins_user_id_key on public.ava_admins (user_id) where user_id is not null;

drop trigger if exists set_ava_admins_updated_at on public.ava_admins;
create trigger set_ava_admins_updated_at
before update on public.ava_admins
for each row execute function public.set_updated_at();

create or replace function public.is_ava_admin(check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.ava_admins admin
    where admin.is_active = true
      and (
        admin.user_id = check_user_id
        or admin.email = lower(coalesce(auth.jwt() ->> 'email', ''))
      )
  );
$$;

grant execute on function public.is_ava_admin(uuid) to authenticated;

create table if not exists public.ava_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null,
  short_description text not null,
  sort_order integer not null default 0,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid references auth.users(id) default auth.uid(),
  updated_by uuid references auth.users(id) default auth.uid(),
  constraint ava_categories_name_length check (char_length(trim(name)) between 1 and 60),
  constraint ava_categories_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint ava_categories_description_length check (char_length(trim(short_description)) between 1 and 180),
  constraint ava_categories_sort_order_safe check (sort_order >= 0),
  constraint ava_categories_status_safe check (status in ('draft', 'published', 'archived')),
  constraint ava_categories_publish_requires_time check (status <> 'published' or published_at is not null),
  constraint ava_categories_archive_requires_time check (status <> 'archived' or archived_at is not null)
);

create unique index if not exists ava_categories_slug_key on public.ava_categories (slug);
create index if not exists ava_categories_status_sort_idx on public.ava_categories (status, sort_order);

drop trigger if exists set_ava_categories_updated_at on public.ava_categories;
create trigger set_ava_categories_updated_at
before update on public.ava_categories
for each row execute function public.set_updated_at();

create table if not exists public.ava_photos (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.ava_categories(id) on delete restrict,
  placement text not null,
  title text,
  alt_text text not null,
  short_description text,
  storage_bucket text not null,
  storage_path text not null,
  mime_type text not null,
  file_size_bytes integer not null,
  width integer not null,
  height integer not null,
  sort_order integer not null default 0,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  archived_at timestamptz,
  created_by uuid references auth.users(id) default auth.uid(),
  updated_by uuid references auth.users(id) default auth.uid(),
  constraint ava_photos_placement_safe check (placement in ('hero', 'gallery', 'category')),
  constraint ava_photos_category_required check (
    (placement = 'category' and category_id is not null)
    or (placement in ('hero', 'gallery') and category_id is null)
  ),
  constraint ava_photos_title_length check (title is null or char_length(trim(title)) between 1 and 80),
  constraint ava_photos_alt_text_length check (char_length(trim(alt_text)) between 1 and 140),
  constraint ava_photos_description_length check (short_description is null or char_length(trim(short_description)) between 1 and 180),
  constraint ava_photos_storage_bucket_safe check (storage_bucket in ('ava-content-drafts', 'ava-content-public')),
  constraint ava_photos_storage_path_required check (char_length(trim(storage_path)) > 0),
  constraint ava_photos_mime_type_safe check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  constraint ava_photos_file_size_safe check (file_size_bytes between 1 and 10485760),
  constraint ava_photos_dimensions_safe check (width between 1 and 12000 and height between 1 and 12000),
  constraint ava_photos_sort_order_safe check (sort_order >= 0),
  constraint ava_photos_status_safe check (status in ('draft', 'published', 'archived')),
  constraint ava_photos_publish_requires_public_bucket check (status <> 'published' or storage_bucket = 'ava-content-public'),
  constraint ava_photos_publish_requires_time check (status <> 'published' or published_at is not null),
  constraint ava_photos_archive_requires_time check (status <> 'archived' or archived_at is not null)
);

create index if not exists ava_photos_status_placement_sort_idx on public.ava_photos (status, placement, sort_order);
create index if not exists ava_photos_category_status_idx on public.ava_photos (category_id, status);

drop trigger if exists set_ava_photos_updated_at on public.ava_photos;
create trigger set_ava_photos_updated_at
before update on public.ava_photos
for each row execute function public.set_updated_at();

alter table public.ava_admins enable row level security;
alter table public.ava_categories enable row level security;
alter table public.ava_photos enable row level security;

drop policy if exists "Ava admins can read their own admin status" on public.ava_admins;
create policy "Ava admins can read their own admin status"
on public.ava_admins
for select
to authenticated
using (
  is_active = true
  and (
    user_id = auth.uid()
    or email = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

drop policy if exists "Ava admins are managed server side only" on public.ava_admins;
create policy "Ava admins are managed server side only"
on public.ava_admins
for all
to authenticated
using (false)
with check (false);

drop policy if exists "Published Ava categories are public" on public.ava_categories;
create policy "Published Ava categories are public"
on public.ava_categories
for select
to anon, authenticated
using (status = 'published' or public.is_ava_admin());

drop policy if exists "Ava admins can create categories" on public.ava_categories;
create policy "Ava admins can create categories"
on public.ava_categories
for insert
to authenticated
with check (public.is_ava_admin());

drop policy if exists "Ava admins can update categories" on public.ava_categories;
create policy "Ava admins can update categories"
on public.ava_categories
for update
to authenticated
using (public.is_ava_admin())
with check (public.is_ava_admin());

drop policy if exists "Ava categories cannot be hard deleted" on public.ava_categories;
create policy "Ava categories cannot be hard deleted"
on public.ava_categories
for delete
to authenticated
using (false);

drop policy if exists "Published Ava photos are public" on public.ava_photos;
create policy "Published Ava photos are public"
on public.ava_photos
for select
to anon, authenticated
using (status = 'published' or public.is_ava_admin());

drop policy if exists "Ava admins can create photos" on public.ava_photos;
create policy "Ava admins can create photos"
on public.ava_photos
for insert
to authenticated
with check (public.is_ava_admin());

drop policy if exists "Ava admins can update photos" on public.ava_photos;
create policy "Ava admins can update photos"
on public.ava_photos
for update
to authenticated
using (public.is_ava_admin())
with check (public.is_ava_admin());

drop policy if exists "Ava photos cannot be hard deleted" on public.ava_photos;
create policy "Ava photos cannot be hard deleted"
on public.ava_photos
for delete
to authenticated
using (false);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('ava-content-drafts', 'ava-content-drafts', false, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('ava-content-public', 'ava-content-public', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read Ava published storage" on storage.objects;
create policy "Public can read Ava published storage"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'ava-content-public');

drop policy if exists "Ava admins can read draft storage" on storage.objects;
create policy "Ava admins can read draft storage"
on storage.objects
for select
to authenticated
using (bucket_id = 'ava-content-drafts' and public.is_ava_admin());

drop policy if exists "Ava admins can upload draft storage" on storage.objects;
create policy "Ava admins can upload draft storage"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'ava-content-drafts' and public.is_ava_admin());

drop policy if exists "Ava admins can update draft storage" on storage.objects;
create policy "Ava admins can update draft storage"
on storage.objects
for update
to authenticated
using (bucket_id = 'ava-content-drafts' and public.is_ava_admin())
with check (bucket_id = 'ava-content-drafts' and public.is_ava_admin());

drop policy if exists "Ava storage cannot be hard deleted from browser" on storage.objects;
create policy "Ava storage cannot be hard deleted from browser"
on storage.objects
for delete
to authenticated
using (false);
