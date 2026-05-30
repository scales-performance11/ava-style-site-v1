# Ava Admin v1 Supabase Setup

These files are for the Ava-only Supabase project named `ava-style-site`.

## Required environment variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_URL`

Only the two `NEXT_PUBLIC_` values may be used in browser code.

## Admin access setup

- Ava Admin uses a simple approved-email gate.
- Mike is active for testing.
- Ava stays inactive until Mike explicitly activates her.
- Supabase email links, callback URLs, passwords, and password reset flows are not used for Ava Admin.

## Storage buckets

The migration creates:

- `ava-content-drafts`, private, admin-only draft uploads.
- `ava-content-public`, public-read, approved published images only.

Both buckets allow only JPEG, PNG, and WebP images up to 10 MB.

## Guardrails

- Ava Admin opens only for active approved emails.
- Public readers can only read published rows and public storage.
- Browser users cannot hard delete rows or storage objects.
- Service role keys must stay server-only and must never be committed.
