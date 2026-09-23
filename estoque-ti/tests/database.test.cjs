const { PGlite } = require('@electric-sql/pglite');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.resolve(__dirname, file), 'utf8');
(async () => {
  const db = new PGlite();
  try {
    await db.exec(read('bootstrap.sql'));
    const migration = read('../setup_supabase.sql');
    await db.exec(migration); console.log('PASS: instalação em banco novo');
    await db.exec(migration); console.log('PASS: execução repetida');
    await db.exec(read('database.test.sql'));
    console.log('PASS: CRUD, histórico, unicidade, validação, concorrência e permissões');
    await db.exec('create policy antiga_aberta on public.estoque for all to authenticated using (true) with check (true)');
    await db.exec(read('database.test.sql'));
    console.log('PASS: conta não autorizada permanece bloqueada com policy permissiva antiga');
  } finally { await db.close(); }
  const legacy = new PGlite();
  try {
    await legacy.exec(read('bootstrap.sql'));
    await legacy.exec(`create table public.estoque(id bigserial primary key, patrimonio text, nome text, categoria text, status text, responsavel text, descricao text);
      insert into public.estoque(patrimonio,nome,categoria,status) values('00123','Equipamento existente','Monitor','Disponível');`);
    await legacy.exec(read('../setup_supabase.sql'));
    const result = await legacy.query('select patrimonio, nome, updated_at is not null as version from public.estoque');
    if(result.rows.length !== 1 || result.rows[0].patrimonio !== '00123' || !result.rows[0].version) throw new Error('Migração não preservou os dados existentes');
    console.log('PASS: migração de esquema anterior preserva registros e adiciona versão');
  } finally { await legacy.close(); }
  const invalid = new PGlite();
  try {
    await invalid.exec(read('bootstrap.sql'));
    await invalid.exec(`create table public.estoque(id bigserial primary key, patrimonio text, nome text, categoria text, status text, responsavel text, descricao text);
      insert into public.estoque(patrimonio,nome,categoria,status) values('00123','A','Monitor','Disponível'),('00123','B','Monitor','Disponível');`);
    let rejected = false;
    try { await invalid.exec(read('../setup_supabase.sql')); }
    catch(error) { rejected = /duplicados/.test(error.message); await invalid.exec('rollback'); }
    const result = await invalid.query('select count(*)::int as count from public.estoque');
    if(!rejected || result.rows[0].count !== 2) throw new Error('Duplicatas não interromperam migração de forma segura');
    console.log('PASS: migração interrompida por duplicatas preserva ambos os registros');
  } finally { await invalid.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
