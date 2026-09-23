-- Somente leitura. Rode antes da migração, se já houver dados.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema='public' and table_name in ('estoque','estoque_historico')
order by table_name, ordinal_position;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname='public' and tablename in ('estoque','estoque_historico');

