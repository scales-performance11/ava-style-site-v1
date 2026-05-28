# Ava Admin v1 Supabase Setup

These files are for the Ava-only Supabase project named `ava-style-site`.

## Required environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`

Only the two `NEXT_PUBLIC_` values may be used in browser code.

## Auth setup

- Use Supabase email magic link / OTP auth only.
- Disable password sign-in and password reset flows.
- Disable open signups for unknown users.
- Create Ava's Auth user in the `ava-style-site` project.
- Add that user to `public.ava_admins` with `is_active = true`.
- Add the allowed redirect URLs:
  - `https://ava-style-site-v1.vercel.app/admin/auth/callback`
  - `http://127.0.0.1:3042/admin/auth/callback`

## Storage buckets

The migration creates:

- `ava-content-drafts`, private, admin-only draft uploads.
- `ava-content-public`, public-read, approved published images only.

Both buckets allow only JPEG, PNG, and WebP images up to 10 MB.

## Guardrails

- Ava can only reach the admin shell after email sign-in and allowlist approval.
- Public readers can only read published rows and public storage.
- Browser users cannot hard delete rows or storage objects.
- Publishing and upload flows are intentionally not built in this foundation pass.
- Service role keys must stay server-only and must never be committed.
