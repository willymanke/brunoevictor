-- Testes para um banco LOCAL DESCARTÁVEL com os papéis/auth do Supabase.
-- Não executar em produção. O arquivo usa dados artificiais e rollback.
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","email":"bruno@estoque.com"}',true);
insert into public.estoque(patrimonio,nome,categoria,status) values ('00001','Teste de banco','Notebook','Disponível');
do $$
declare version_before timestamptz; version_after timestamptz; rows_affected integer;
begin
  if (select count(*) from public.estoque_historico where patrimonio='00001' and acao='CRIACAO') <> 1 then raise exception 'Histórico de criação ausente'; end if;
  select updated_at into version_before from public.estoque where patrimonio='00001';
  update public.estoque set status='Em Uso',responsavel='Teste' where patrimonio='00001';
  select updated_at into version_after from public.estoque where patrimonio='00001';
  if version_after <= version_before then raise exception 'Versão não avançou'; end if;
  if (select count(*) from public.estoque_historico where patrimonio='00001' and acao='EDICAO') <> 2 then raise exception 'Histórico por campo incorreto'; end if;
  update public.estoque set nome='Edição obsoleta' where patrimonio='00001' and updated_at=version_before;
  get diagnostics rows_affected = row_count;
  if rows_affected <> 0 then raise exception 'Conflito de edição não detectado'; end if;
  begin
    update public.estoque set id=default where patrimonio='00001';
    raise exception 'Identificador foi alterado';
  exception when check_violation then null; end;
  begin
    insert into public.estoque(patrimonio,nome,categoria,status) values ('00001','Duplicado','Notebook','Disponível');
    raise exception 'Duplicata foi aceita';
  exception when unique_violation then null; end;
  begin
    insert into public.estoque(patrimonio,nome,categoria,status) values ('abc','Inválido','Notebook','Disponível');
    raise exception 'Patrimônio inválido foi aceito';
  exception when check_violation then null; end;
  begin
    insert into public.estoque(patrimonio,nome,categoria,status) values ('00002','  ','Notebook','Disponível');
    raise exception 'Nome em branco foi aceito';
  exception when check_violation then null; end;
  begin
    insert into public.estoque_historico(acao) values ('FORJADO');
    raise exception 'Histórico forjado foi aceito';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.estoque_historico;
    raise exception 'Exclusão direta do histórico foi aceita';
  exception when insufficient_privilege then null; end;
  delete from public.estoque where patrimonio='00001';
  if (select count(*) from public.estoque_historico where patrimonio='00001') <> 4 then raise exception 'Histórico não foi preservado após exclusão'; end if;
end $$;

-- Conta autenticada fora da lista não lê nem grava.
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","email":"nao-autorizado@example.com"}',true);
do $$ begin
  if (select count(*) from public.estoque_historico) <> 0 then raise exception 'Conta não autorizada leu histórico'; end if;
  begin
    insert into public.estoque(patrimonio,nome,categoria,status) values ('00003','Proibido','Notebook','Disponível');
    raise exception 'Conta não autorizada inseriu equipamento';
  exception when insufficient_privilege then null; end;
end $$;

-- A segunda conta do projeto original continua autorizada.
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000003","email":"victor@estoque.com"}',true);
insert into public.estoque(patrimonio,nome,categoria,status) values ('00004','Segunda conta','Monitor','Manutenção');

reset role;
set local role anon;
select set_config('request.jwt.claims','{}',true);
do $$ begin
  begin
    perform 1 from public.estoque;
    raise exception 'Anônimo leu estoque';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.estoque(patrimonio,nome,categoria,status) values ('00005','Anônimo','Monitor','Disponível');
    raise exception 'Anônimo inseriu equipamento';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
