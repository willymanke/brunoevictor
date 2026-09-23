-- Emula apenas o contexto de autenticação para os testes locais no PGlite.
-- Não executar no Supabase online.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;
create function auth.uid() returns uuid language sql stable as $$ select (auth.jwt()->>'sub')::uuid $$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.jwt(), auth.uid() to anon, authenticated;
