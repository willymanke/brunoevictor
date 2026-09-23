-- ESTOQUE TI — instalação e migração transacional
-- Projeto informado: qadcyjuoowchgywanpml
-- Execute integralmente no SQL Editor do projeto correto.
-- Não apaga equipamentos, histórico ou usuários. Erros revertem a transação.
-- A lista de e-mails autorizados é a mesma do projeto original.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

create table if not exists public.estoque (
  id bigint generated always as identity primary key,
  patrimonio text not null,
  nome text not null,
  categoria text not null,
  status text not null default 'Disponível',
  responsavel text,
  descricao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default clock_timestamp()
);

-- Impede alterações concorrentes durante a conferência e a instalação.
lock table public.estoque in share row exclusive mode;

-- Esquemas incompatíveis precisam de revisão; não convertemos IDs ou patrimônios
-- silenciosamente porque isso pode quebrar referências ou perder zeros iniciais.
do $$
declare col text;
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='estoque' and column_name='id' and data_type in ('bigint','integer')) then
    raise exception 'estoque.id precisa ser bigint/integer. Revise o esquema existente antes de migrar.';
  end if;
  foreach col in array array['patrimonio','nome','categoria','status','responsavel','descricao'] loop
    if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='estoque' and column_name=col and data_type in ('text','character varying')) then
      raise exception 'Coluna estoque.% ausente ou incompatível. Esperado text/varchar; nenhum dado foi alterado.', col;
    end if;
  end loop;
  if exists(select 1 from public.estoque group by patrimonio having count(*) > 1) then
    raise exception 'Existem patrimônios duplicados. Revise com diagnostico_supabase.sql; nenhum item foi apagado.';
  end if;
  if exists(select 1 from public.estoque where
    patrimonio is null or patrimonio !~ '^[0-9]{5,7}$' or
    nome is null or char_length(btrim(nome)) not between 1 and 150 or
    categoria is null or categoria not in ('Notebook','Desktop','Monitor','Servidor','Switch','Roteador','Impressora','Nobreak','Periférico','Outro') or
    status is null or status not in ('Disponível','Em Uso','Manutenção','Descarte') or
    char_length(coalesce(responsavel,'')) > 150 or char_length(coalesce(descricao,'')) > 2000
  ) then raise exception 'Existem equipamentos inválidos. Revise com diagnostico_supabase.sql; nenhum item foi alterado.'; end if;
end $$;

alter table public.estoque add column if not exists created_at timestamptz not null default now();
alter table public.estoque add column if not exists updated_at timestamptz not null default clock_timestamp();
do $$ begin
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='estoque' and column_name in ('created_at','updated_at') and data_type <> 'timestamp with time zone') then
    raise exception 'created_at e updated_at precisam ser timestamptz. Revise o esquema antes de migrar.';
  end if;
  if exists(select 1 from public.estoque where updated_at is null) then
    raise exception 'Há updated_at nulo. Revise os registros existentes antes de migrar.';
  end if;
end $$;
alter table public.estoque alter column updated_at set not null;
alter table public.estoque alter column updated_at set default clock_timestamp();
create unique index if not exists estoque_patrimonio_unique on public.estoque(patrimonio);

-- CHECKs também validam chamadas diretas à API (não apenas os formulários).
alter table public.estoque drop constraint if exists estoque_dados_validos;
alter table public.estoque add constraint estoque_dados_validos check (
  patrimonio is not null and patrimonio ~ '^[0-9]{5,7}$' and
  nome is not null and char_length(btrim(nome)) between 1 and 150 and
  categoria is not null and categoria in ('Notebook','Desktop','Monitor','Servidor','Switch','Roteador','Impressora','Nobreak','Periférico','Outro') and
  status is not null and status in ('Disponível','Em Uso','Manutenção','Descarte') and
  char_length(coalesce(responsavel,'')) <= 150 and char_length(coalesce(descricao,'')) <= 2000
);

create table if not exists public.estoque_historico (
  id bigint generated always as identity primary key,
  estoque_id bigint,
  patrimonio text,
  acao text not null,
  campo_alterado text,
  valor_antigo text,
  valor_novo text,
  usuario_email text,
  criado_em timestamptz not null default now()
);
-- Sem FK com cascade: a exclusão de um equipamento preserva seu histórico.
create index if not exists estoque_historico_item_data_idx on public.estoque_historico(estoque_id, criado_em desc, id desc);
create index if not exists estoque_historico_data_idx on public.estoque_historico(criado_em desc, id desc);

alter table public.estoque enable row level security;
alter table public.estoque_historico enable row level security;
revoke all on public.estoque, public.estoque_historico from public, anon, authenticated;
grant select, insert, update, delete on public.estoque to authenticated;
grant select on public.estoque_historico to authenticated;

-- Privilégios apenas na sequência usada pelo estoque, sem alterar outras tabelas.
do $$ declare seq text; begin
  seq := pg_get_serial_sequence('public.estoque','id');
  if seq is not null then
    execute format('revoke all on sequence %s from public, anon, authenticated', seq);
    execute format('grant usage on sequence %s to authenticated', seq);
  end if;
  seq := pg_get_serial_sequence('public.estoque_historico','id');
  if seq is not null then execute format('revoke all on sequence %s from public, anon, authenticated', seq); end if;
end $$;

-- Restritiva: mesmo se existir uma policy permissiva antiga, ela não libera outras contas.
-- Ao mudar os e-mails autorizados, mantenha AMBAS as guardas abaixo sincronizadas.
drop policy if exists estoque_guard_autorizados on public.estoque;
create policy estoque_guard_autorizados on public.estoque as restrictive for all to authenticated
using ((select auth.uid()) is not null and (select auth.jwt()->>'email') in ('bruno@estoque.com','victor@estoque.com'))
with check ((select auth.uid()) is not null and (select auth.jwt()->>'email') in ('bruno@estoque.com','victor@estoque.com'));
drop policy if exists estoque_select_autorizados on public.estoque;
drop policy if exists estoque_insert_autorizados on public.estoque;
drop policy if exists estoque_update_autorizados on public.estoque;
drop policy if exists estoque_delete_autorizados on public.estoque;
create policy estoque_select_autorizados on public.estoque for select to authenticated using (true);
create policy estoque_insert_autorizados on public.estoque for insert to authenticated with check (true);
create policy estoque_update_autorizados on public.estoque for update to authenticated using (true) with check (true);
create policy estoque_delete_autorizados on public.estoque for delete to authenticated using (true);

drop policy if exists historico_guard_autorizados on public.estoque_historico;
create policy historico_guard_autorizados on public.estoque_historico as restrictive for all to authenticated
using ((select auth.uid()) is not null and (select auth.jwt()->>'email') in ('bruno@estoque.com','victor@estoque.com'))
with check (false);
drop policy if exists historico_select_autorizados on public.estoque_historico;
create policy historico_select_autorizados on public.estoque_historico for select to authenticated using (true);

create or replace function public.fn_estoque_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.id is distinct from old.id then
    raise exception 'O identificador do equipamento não pode ser alterado.' using errcode = '23514';
  end if;
  -- Versão estritamente crescente para detectar edição/exclusão sobre dados desatualizados.
  new.updated_at := greatest(clock_timestamp(), old.updated_at + interval '1 microsecond');
  new.created_at := old.created_at;
  return new;
end $$;
revoke all on function public.fn_estoque_updated_at() from public, anon, authenticated;
drop trigger if exists trg_estoque_updated_at on public.estoque;
create trigger trg_estoque_updated_at before update on public.estoque
for each row execute function public.fn_estoque_updated_at();

create or replace function public.fn_log_estoque_historico()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  usuario text := coalesce(auth.jwt()->>'email','sistema');
  campos text[] := array['patrimonio','nome','categoria','status','responsavel','descricao'];
  rotulos text[] := array['Patrimônio','Nome','Categoria','Status','Responsável','Descrição'];
  antes jsonb;
  depois jsonb;
  i integer;
begin
  if TG_OP = 'INSERT' then
    insert into public.estoque_historico(estoque_id,patrimonio,acao,campo_alterado,valor_novo,usuario_email)
    values(new.id,new.patrimonio,'CRIACAO','Equipamento',to_jsonb(new)::text,usuario);
    return new;
  elsif TG_OP = 'UPDATE' then
    antes := to_jsonb(old); depois := to_jsonb(new);
    for i in 1..array_length(campos,1) loop
      if antes->campos[i] is distinct from depois->campos[i] then
        insert into public.estoque_historico(estoque_id,patrimonio,acao,campo_alterado,valor_antigo,valor_novo,usuario_email)
        values(new.id,new.patrimonio,'EDICAO',rotulos[i],antes->>campos[i],depois->>campos[i],usuario);
      end if;
    end loop;
    return new;
  elsif TG_OP = 'DELETE' then
    insert into public.estoque_historico(estoque_id,patrimonio,acao,campo_alterado,valor_antigo,usuario_email)
    values(old.id,old.patrimonio,'EXCLUSAO','Equipamento',to_jsonb(old)::text,usuario);
    return old;
  end if;
  return null;
end $$;
revoke all on function public.fn_log_estoque_historico() from public, anon, authenticated;
drop trigger if exists trg_estoque_historico on public.estoque;
create trigger trg_estoque_historico after insert or update or delete on public.estoque
for each row execute function public.fn_log_estoque_historico();

notify pgrst, 'reload schema';
commit;
