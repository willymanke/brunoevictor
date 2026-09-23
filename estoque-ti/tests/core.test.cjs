const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../core.js');
const sample = { id: 1, patrimonio: '00123', nome: 'Notebook', categoria: 'Notebook', status: 'Disponível', responsavel: 'João', descricao: '' };
test('busca ignora acentos, suporta valores nulos e combina filtros', () => {
  const rows = [sample, { ...sample, id: 2, responsavel: null, patrimonio: 12345, status: 'Em Uso' }];
  assert.equal(C.filterItems(rows, { text: 'JOAO' }).length, 1);
  assert.equal(C.filterItems(rows, { text: '12345', status: 'Em Uso' }).length, 1);
  assert.equal(C.filterItems(rows, { text: 'JOAO', category: 'Servidor' }).length, 0);
});
test('paginação corrige página antes de recortar a lista', () => {
  const rows = Array.from({length: 31}, (_, id) => ({id}));
  assert.equal(C.paginate(rows, 3).items.length, 1);
  assert.equal(C.paginate(rows.slice(0, 2), 3).items.length, 2);
  assert.equal(C.paginate([], 10).page, 1);
});
test('ordenação natural em português não altera o array original', () => {
  const rows = [{id: 1, nome: 'Monitor 10'}, {id: 2, nome: 'Monitor 2'}];
  assert.equal(C.filterItems(rows, {sortField:'nome'})[0].id, 2);
  assert.equal(rows[0].id, 1);
  assert.equal(C.filterItems(rows, {sortField:'nome', direction:'desc'})[0].id, 1);
});
test('valida patrimônio, nome, enums e limites do banco', () => {
  assert.equal(C.validate(sample), '');
  for(const change of [{patrimonio:'12'}, {patrimonio:'1234x'}, {nome:''}, {categoria:'Inválida'}, {status:'Inválido'}, {descricao:'x'.repeat(2001)}]) assert.ok(C.validate({...sample,...change}));
});
test('CSV preserva delimitadores, aspas, quebras e bloqueia fórmulas', () => {
  const csv = C.toCSV([{...sample,nome:'A; "B"\nC',responsavel:' =HYPERLINK("x")',descricao:'@SUM(A1)'}]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"A; ""B""\nC"'));
  assert.ok(csv.includes('"\' =HYPERLINK(""x"")"'));
  assert.ok(csv.includes('"\'@SUM(A1)"'));
  assert.ok(csv.includes('"00123"'));
});
