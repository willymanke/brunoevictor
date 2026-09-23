(function (root) {
  'use strict';
  const categories = ['Notebook', 'Desktop', 'Monitor', 'Servidor', 'Switch', 'Roteador', 'Impressora', 'Nobreak', 'Periférico', 'Outro'];
  const statuses = ['Disponível', 'Em Uso', 'Manutenção', 'Descarte'];
  const fields = ['patrimonio', 'nome', 'categoria', 'status', 'responsavel', 'descricao'];
  const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
  const collator = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });
  function filterItems(items, { text = '', category = '', status = '', sortField = '', direction = 'asc' } = {}) {
    const term = normalize(text);
    const result = items.filter(item => (!category || item.categoria === category) && (!status || item.status === status) &&
      (!term || ['patrimonio', 'nome', 'responsavel', 'descricao'].some(key => normalize(item[key]).includes(term))));
    if (fields.includes(sortField)) result.sort((a, b) => (direction === 'desc' ? -1 : 1) * collator.compare(a[sortField] ?? '', b[sortField] ?? '') || collator.compare(String(a.id), String(b.id)));
    return result;
  }
  function paginate(items, requestedPage, pageSize = 15) {
    const pages = Math.max(1, Math.ceil(items.length / pageSize));
    const page = Math.min(pages, Math.max(1, Number(requestedPage) || 1));
    return { page, pages, total: items.length, items: items.slice((page - 1) * pageSize, page * pageSize) };
  }
  function validate(item) {
    if (!/^[0-9]{5,7}$/.test(item.patrimonio)) return 'O patrimônio precisa ter de 5 a 7 números.';
    if (!item.nome?.trim() || item.nome.length > 150) return 'Informe um nome com até 150 caracteres.';
    if (!categories.includes(item.categoria) || !statuses.includes(item.status)) return 'Selecione uma categoria e um status válidos.';
    if ((item.responsavel || '').length > 150 || (item.descricao || '').length > 2000) return 'Responsável: até 150 caracteres. Descrição: até 2.000 caracteres.';
    return '';
  }
  function csvCell(value) {
    let text = String(value ?? '');
    // Impede que planilhas executem conteúdo como fórmulas, inclusive após espaços/controles.
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
    return '"' + text.replace(/"/g, '""') + '"';
  }
  function toCSV(items) {
    return '\uFEFF' + [['Patrimônio', 'Nome', 'Categoria', 'Status', 'Responsável', 'Descrição'], ...items.map(item => fields.map(field => item[field]))].map(row => row.map(csvCell).join(';')).join('\r\n');
  }
  const api = Object.freeze({ categories, statuses, fields, normalize, filterItems, paginate, validate, toCSV });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.EstoqueCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
