-- The app reads and writes every table through Prisma on the server (table
-- owner, which bypasses RLS). Nothing queries these tables with the public
-- Supabase anon key, so the anon/authenticated roles get no access at all.
--
-- This replaces the hand-run src/lib/security/rls-policies.sql, whose policies
-- let a signed-in user update any column of their own `users` row (tier,
-- creditBalance) and let anyone read waitlist rows with a NULL userId (emails).

DO $$
DECLARE
  t text;
  p record;
  tables text[] := ARRAY[
    'users', 'subscriptions', 'projects', 'generated_files', 'document_revisions',
    'payments', 'payment_events', 'credit_ledger', 'system_config', 'whatsapp_chats',
    'rate_limit_events', 'interview_sessions', 'waitlist_entries', '_prisma_migrations'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM authenticated', t);
    END IF;
  END LOOP;
END $$;
