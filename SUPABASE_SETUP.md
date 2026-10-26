# Supabase Setup Guide — Strumio

This guide walks you through setting up the Supabase backend that powers sync, leaderboards and social features for Strumio.

## 1. Create a Supabase project

1. Go to https://supabase.com and sign in.
2. Click **New project**.
3. Choose an organization, name the project (e.g. `strumio`), set a database password and region.
4. Wait for the project to finish provisioning.

## 2. Get your credentials

1. In the Supabase dashboard, open **Settings → API**.
2. Copy:
   - **Project URL** (e.g. `https://xxxx.supabase.co`)
   - **anon public key** (the `anon` key, safe for client use)
3. Keep these for step 6.

## 3. Create the database schema

1. Open **SQL Editor** in the dashboard.
2. Paste the contents of `backend/schema.sql` and run it.
3. This creates tables: `users`, `progress`, `weekly_scores`, `friendships`, `challenges`, `activity_feed`, plus indexes, RLS policies and triggers.

## 4. Configure Row Level Security (RLS)

The schema includes RLS policies, but verify:

- `users`: users can read all, update own row.
- `progress`: users can read/write own row only.
- `weekly_scores`: users can read all, upsert own.
- `friendships`: participants can read/update.
- `challenges`: participants can read/update.
- `activity_feed`: friends can read; users insert own.

Enable RLS on every table (done by schema).

## 5. Enable Realtime

1. Go to **Database → Replication** (or Realtime).
2. Enable realtime for tables: `weekly_scores`, `activity_feed`, `challenges`, `friendships`.
3. This powers live leaderboard, friend activity and challenge updates.

## 6. Configure the app

1. Open the Strumio app → **Ajustes → Conexión / Backend**.
2. Paste **Supabase URL** and **Anon key**.
3. Click **Guardar y conectar**.
4. Create an account or sign in.
5. (Optional) Toggle **Tiempo real** on/off.

## 7. Test

- Complete a lesson → progress should sync.
- Open leaderboard → should populate after sync.
- Add a friend by email → request appears.
- Toggle realtime → updates appear live.

## 8. Troubleshooting

- **"Sin conexión"**: check URL/key, network, RLS policies.
- **Auth errors**: ensure email confirmations are configured (Auth → Providers → Email).
- **Realtime not updating**: verify replication enabled for tables.
- **Rate limits**: Supabase free tier has limits; app throttles to 100 req/min.
- **Token expiry**: app auto-refreshes; if issues, sign out and sign in.

## 9. Production notes

- Never expose the `service_role` key in client code; use `anon` key only.
- Consider enabling email confirmation and password reset.
- Set up backups and monitoring in Supabase dashboard.
- For custom domains, configure in Supabase settings.
