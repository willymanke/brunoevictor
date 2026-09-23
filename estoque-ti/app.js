(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const C = window.EstoqueCore;
  const state = { user: null, items: [], history: [], page: 1, historyPage: 1, sortField: '', direction: 'asc', loadId: 0, historyId: 0, busy: false, ready: false, edit: null, removing: null };
  const badgeClasses = { 'Disponível': 'green', 'Em Uso': 'blue', 'Manutenção': 'amber', 'Descarte': 'red' };
  const historyActions = { CRIACAO: 'Cadastro', EDICAO: 'Edição', EXCLUSAO: 'Exclusão' };
  let client;

  function toast(message, type = 'success') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    $('toast-container').append(el);
    setTimeout(() => el.remove(), type === 'error' ? 9000 : 5000);
  }
  function errorMessage(error) {
    if (error?.code === '23505') return 'Este patrimônio já está cadastrado. Use outro número ou edite o item existente.';
    if (error?.code === '23514' || error?.code === '23502') return 'Confira os campos obrigatórios e os limites de caracteres.';
    if (error?.code === '42501') return 'Sua conta não tem permissão para esta operação. Fale com o administrador.';
    if (['42P01', '42703', 'PGRST205', 'PGRST204'].includes(error?.code)) return 'O banco precisa ser atualizado. Peça ao administrador para aplicar setup_supabase.sql.';
    if (error?.code === 'invalid_credentials') return 'E-mail ou senha incorretos.';
    if (error?.code === 'email_not_confirmed') return 'Confirme seu e-mail antes de entrar.';
    if (error?.status === 429) return 'Muitas tentativas. Aguarde um momento e tente novamente.';
    if (error?.status === 401 || error?.code === 'PGRST301') return 'Sua sessão expirou. Entre novamente.';
    if (/fetch|network|timeout|abort/i.test(error?.message || '')) return 'Não foi possível conectar. Verifique sua conexão e tente novamente.';
    return error?.userMessage || 'Não foi possível concluir a operação. Tente novamente ou fale com o administrador.';
  }
  function customError(message) { return { userMessage: message }; }
  function showError(id, message = '') { $(id).textContent = message; $(id).hidden = !message; }
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#i-${name}`); svg.append(use); return svg;
  }
  function cell(value, className = '') {
    const td = document.createElement('td'); td.textContent = value ?? '—';
    if (className) td.className = className; return td;
  }
  function empty(body, title, detail, columns = 6) {
    body.replaceChildren(); const tr = document.createElement('tr');
    const td = cell('', 'empty-cell'); td.colSpan = columns;
    const heading = document.createElement('strong'); heading.textContent = title;
    td.append(heading, document.createTextNode(detail)); tr.append(td); body.append(tr);
  }
  function filters() { return { text: $('search').value, category: $('filter-categoria').value, status: $('filter-status').value, sortField: state.sortField, direction: state.direction }; }
  function filteredItems() { return C.filterItems(state.items, filters()); }
  function render() {
    const result = C.paginate(filteredItems(), state.page); state.page = result.page;
    $('results-summary').textContent = `${result.total} ${result.total === 1 ? 'equipamento encontrado' : 'equipamentos encontrados'} · ${state.items.length} no total`;
    $('page-info').textContent = `Página ${result.page} de ${result.pages}`;
    $('btn-prev').disabled = result.page === 1; $('btn-next').disabled = result.page === result.pages;
    const body = $('table-body'); body.replaceChildren();
    if (!result.items.length) empty(body, 'Nenhum equipamento encontrado', state.items.length ? 'Tente outra busca ou limpe os filtros.' : 'Cadastre o primeiro item para começar.');
    for (const item of result.items) {
      const tr = document.createElement('tr');
      const name = cell(''); const strong = document.createElement('span'); strong.className = 'equipment-name'; strong.textContent = item.nome; name.append(strong);
      if (item.descricao) { const desc = document.createElement('span'); desc.className = 'equipment-description'; desc.textContent = item.descricao; name.append(desc); }
      const status = cell(''); const badge = document.createElement('span'); badge.className = `badge ${badgeClasses[item.status] || 'neutral'}`; badge.textContent = item.status; status.append(badge);
      const actions = cell(''); const buttons = document.createElement('div'); buttons.className = 'actions';
      for (const [action, label, symbol] of [['edit', 'Editar', 'edit'], ['history', 'Ver histórico de', 'history'], ['delete', 'Excluir', 'trash']]) {
        const btn = document.createElement('button'); btn.className = `btn-icon ${action}`; btn.type = 'button'; btn.dataset.action = action; btn.dataset.id = String(item.id);
        btn.setAttribute('aria-label', `${label} ${item.nome}, patrimônio ${item.patrimonio}`); btn.title = label; btn.append(icon(symbol)); btn.disabled = state.busy; buttons.append(btn);
      }
      actions.append(buttons); tr.append(cell(item.patrimonio, 'asset-tag'), name, cell(item.categoria), status, cell(item.responsavel || '—'), actions); body.append(tr);
    }
    for (const th of document.querySelectorAll('th[data-field]')) {
      const active = th.dataset.field === state.sortField;
      th.setAttribute('aria-sort', active ? (state.direction === 'asc' ? 'ascending' : 'descending') : 'none');
      th.querySelector('span').textContent = active ? (state.direction === 'asc' ? '↑' : '↓') : '↕';
    }
  }
  function cards() {
    $('total-count').textContent = state.items.length;
    for (const [id, status] of [['disponivel-count', 'Disponível'], ['em-uso-count', 'Em Uso'], ['manutencao-count', 'Manutenção'], ['descarte-count', 'Descarte']]) $(id).textContent = state.items.filter(item => item.status === status).length;
  }
  function enableActions() {
    for (const el of document.querySelectorAll('#add-form button, #edit-form button, #confirm-modal button, #btn-refresh, #btn-export, #btn-historico, #table-body button')) el.disabled = state.busy || !state.ready;
  }
  // Carrega em lotes e avança pela quantidade recebida: funciona mesmo com o limite da API abaixo de 500.
  async function readAll(table, columns, build = query => query, current = () => true) {
    const rows = []; let offset = 0;
    while (current()) {
      const query = build(client.from(table).select(columns)).range(offset, offset + 499).abortSignal(AbortSignal.timeout(20000));
      const { data, error } = await query;
      if (error) throw error;
      if (!current()) return null;
      if (!data?.length) return rows;
      rows.push(...data); offset += data.length;
    }
    return null;
  }
  async function loadItems() {
    if (!state.user) return false;
    const token = ++state.loadId; const userId = state.user.id;
    const current = () => token === state.loadId && state.user?.id === userId;
    $('inventory-title').setAttribute('aria-busy', 'true'); $('sync-status').textContent = 'Sincronizando…';
    showError('data-error'); $('btn-refresh').disabled = true;
    try {
      const rows = await readAll('estoque', 'id,patrimonio,nome,categoria,status,responsavel,descricao,updated_at', q => q.order('id', { ascending: false }), current);
      if (!rows || !current()) return false;
      state.items = rows; state.ready = true; cards(); render();
      $('sync-status').textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      return true;
    } catch (error) {
      if (current()) { showError('data-error', errorMessage(error)); $('sync-status').textContent = state.ready ? 'Falha ao atualizar · dados anteriores' : 'Falha na sincronização';
        if (!state.ready) empty($('table-body'), 'Não foi possível carregar', 'Verifique a mensagem acima e use o botão de atualizar.'); }
      return false;
    } finally { if (current()) { $('inventory-title').removeAttribute('aria-busy'); enableActions(); $('btn-refresh').disabled = state.busy; } }
  }
  function applySession(session) {
    const user = session?.user ?? null;
    if (state.user?.id === user?.id) return;
    state.loadId++; state.historyId++; state.user = user; state.items = []; state.history = []; state.page = 1; state.ready = false; state.edit = null; state.removing = null;
    document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
    $('add-form').reset(); $('edit-form').reset(); $('login-password').value = ''; resetFilters(false);
    $('login-screen').hidden = !!user; $('app-screen').hidden = !user;
    $('user-display').textContent = user?.email || ''; $('table-body').replaceChildren(); $('historico-body').replaceChildren();
    for (const id of ['total-count', 'disponivel-count', 'em-uso-count', 'manutencao-count', 'descarte-count']) $(id).textContent = '—';
    if (user) { empty($('table-body'), 'Carregando inventário…', 'Aguarde a sincronização.'); enableActions(); void loadItems(); }
  }
  async function login(event) {
    event.preventDefault(); const btn = $('btn-login'); if (btn.disabled) return;
    btn.disabled = true; btn.textContent = 'Entrando…'; showError('login-error');
    try {
      const { data, error } = await client.auth.signInWithPassword({ email: $('login-email').value.trim(), password: $('login-password').value });
      if (error) throw error; applySession(data.session);
    } catch (error) { showError('login-error', errorMessage(error)); }
    finally { btn.disabled = false; btn.textContent = 'Entrar na plataforma →'; }
  }
  async function logout() {
    if (state.busy) { toast('Aguarde a operação terminar antes de sair.', 'warning'); return; }
    const btn = $('btn-logout'); btn.disabled = true;
    try { const { error } = await client.auth.signOut({ scope: 'local' }); if (error) throw error; applySession(null); }
    catch (error) { toast(errorMessage(error), 'error'); } finally { btn.disabled = false; }
  }
  function getForm(prefix = '') { return Object.fromEntries(C.fields.map(field => [field, $(prefix + field).value.trim()])); }
  async function mutate(operation, onSuccess, message) {
    if (state.busy || !state.user || !state.ready) return;
    const userId = state.user.id; state.busy = true; enableActions();
    try {
      const { data, error } = await operation(); if (error) throw error;
      if (!data?.length) throw customError('O item foi alterado ou removido por outra pessoa, ou sua conta perdeu acesso. Atualize o estoque e abra o item novamente.');
      if (state.user?.id !== userId) return;
      onSuccess(); toast(message);
      const refreshed = await loadItems();
      if (!refreshed && state.user?.id === userId) toast('A alteração foi salva, mas a lista não pôde ser atualizada. Clique em atualizar.', 'warning');
    } catch (error) { if (state.user?.id === userId) toast(errorMessage(error), 'error'); }
    finally { state.busy = false; enableActions(); }
  }
  function saveNew(event) {
    event.preventDefault(); const item = getForm(); const message = C.validate(item);
    if (message) { toast(message, 'error'); return; }
    void mutate(() => client.from('estoque').insert(item).select('id'), () => { $('add-form').reset(); state.page = 1; }, 'Equipamento cadastrado.');
  }
  function openEdit(item) {
    state.edit = { ...item }; $('edit-id').value = item.id;
    for (const field of C.fields) $('edit-' + field).value = item[field] ?? '';
    $('edit-modal').showModal();
  }
  function saveEdit(event) {
    event.preventDefault(); if (!state.edit) return;
    const item = getForm('edit-'); const message = C.validate(item);
    if (message) { toast(message, 'error'); return; }
    if (C.fields.every(field => item[field] === String(state.edit[field] ?? ''))) { $('edit-modal').close(); return; }
    const original = state.edit;
    void mutate(() => client.from('estoque').update(item).eq('id', original.id).eq('updated_at', original.updated_at).select('id'), () => { $('edit-modal').close(); state.edit = null; }, 'Equipamento atualizado.');
  }
  function removeItem() {
    if (!state.removing) return; const item = state.removing;
    void mutate(() => client.from('estoque').delete().eq('id', item.id).eq('updated_at', item.updated_at).select('id'), () => { $('confirm-modal').close(); state.removing = null; }, 'Equipamento excluído. Histórico preservado.');
  }
  async function openHistory(item = null) {
    const token = ++state.historyId; const userId = state.user?.id; state.history = []; state.historyPage = 1;
    $('historico-filtro').value = ''; $('history-title').textContent = item ? `Histórico · ${item.patrimonio}` : 'Histórico de movimentações';
    $('history-summary').textContent = 'Carregando movimentações…'; $('history-page-info').textContent = '';
    $('history-prev').disabled = true; $('history-next').disabled = true;
    empty($('historico-body'), 'Carregando histórico…', 'Buscando registros no banco de dados.', 7); $('historico-modal').showModal();
    const current = () => token === state.historyId && state.user?.id === userId && $('historico-modal').open;
    try {
      const rows = await readAll('estoque_historico', 'id,estoque_id,patrimonio,acao,campo_alterado,valor_antigo,valor_novo,usuario_email,criado_em', q => {
        if (item) q = q.eq('estoque_id', item.id);
        return q.order('criado_em', { ascending: false }).order('id', { ascending: false });
      }, current);
      if (rows && current()) { state.history = rows; renderHistory(); }
    } catch (error) { if (current()) { $('history-summary').textContent = errorMessage(error); empty($('historico-body'), 'Não foi possível carregar', 'Feche e reabra o histórico para tentar novamente.', 7); } }
  }
  function renderHistory() {
    const text = C.normalize($('historico-filtro').value);
    const rows = state.history.filter(item => ['patrimonio', 'acao', 'campo_alterado', 'valor_antigo', 'valor_novo', 'usuario_email'].some(field => C.normalize(item[field]).includes(text)) || C.normalize(historyActions[item.acao]).includes(text));
    const result = C.paginate(rows, state.historyPage, 20); state.historyPage = result.page;
    $('history-summary').textContent = `${result.total} movimentações encontradas`;
    $('history-page-info').textContent = `Página ${result.page} de ${result.pages}`;
    $('history-prev').disabled = result.page === 1; $('history-next').disabled = result.page === result.pages;
    const body = $('historico-body'); body.replaceChildren();
    if (!result.items.length) empty(body, 'Nenhuma movimentação encontrada', text ? 'Tente outra busca.' : 'As próximas alterações aparecerão aqui.', 7);
    for (const item of result.items) {
      const date = new Date(item.criado_em); const tr = document.createElement('tr');
      tr.append(...[Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR'), historyActions[item.acao] || item.acao, item.patrimonio, item.campo_alterado || '—', historyValue(item.valor_antigo, item.campo_alterado), historyValue(item.valor_novo, item.campo_alterado), item.usuario_email || 'Sistema'].map(value => cell(value)));
      body.append(tr);
    }
  }
  function historyValue(value, field) {
    if (!value) return '—';
    if (field !== 'Equipamento') return value;
    try {
      const snapshot = JSON.parse(value);
      const labels = ['Patrimônio', 'Nome', 'Categoria', 'Status', 'Responsável', 'Descrição'];
      return C.fields.map((key, index) => `${labels[index]}: ${snapshot[key] || '—'}`).join('\n');
    } catch { return value; }
  }
  function resetFilters(redraw = true) { $('search').value = ''; $('filter-categoria').value = ''; $('filter-status').value = ''; state.page = 1; if (redraw) render(); }
  function exportCSV() {
    const items = filteredItems(); if (!items.length) { toast('Nenhum equipamento para exportar.', 'warning'); return; }
    const url = URL.createObjectURL(new Blob([C.toCSV(items)], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = `estoque-${new Date().toISOString().slice(0, 10)}.csv`; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function setTheme(dark) { document.body.classList.toggle('dark', dark); $('btn-darkmode').setAttribute('aria-pressed', String(dark)); $('btn-darkmode').setAttribute('aria-label', dark ? 'Ativar modo claro' : 'Ativar modo escuro'); }
  function events() {
    $('login-form').addEventListener('submit', login); $('btn-logout').addEventListener('click', logout);
    $('add-form').addEventListener('submit', saveNew); $('edit-form').addEventListener('submit', saveEdit); $('btn-confirm-excluir').addEventListener('click', removeItem);
    $('btn-refresh').addEventListener('click', () => { void loadItems(); }); $('btn-export').addEventListener('click', exportCSV); $('btn-historico').addEventListener('click', () => { void openHistory(); });
    for (const id of ['search', 'filter-categoria', 'filter-status']) $(id).addEventListener(id === 'search' ? 'input' : 'change', () => { state.page = 1; render(); });
    $('btn-clear-filters').addEventListener('click', () => resetFilters());
    $('btn-prev').addEventListener('click', () => { state.page--; render(); }); $('btn-next').addEventListener('click', () => { state.page++; render(); });
    for (const btn of document.querySelectorAll('.sort')) btn.addEventListener('click', () => { const field = btn.dataset.field; state.direction = state.sortField === field && state.direction === 'asc' ? 'desc' : 'asc'; state.sortField = field; state.page = 1; render(); });
    $('table-body').addEventListener('click', event => {
      const button = event.target.closest('button[data-action]'); if (!button || state.busy) return;
      const item = state.items.find(row => String(row.id) === button.dataset.id); if (!item) return;
      if (button.dataset.action === 'edit') openEdit(item);
      if (button.dataset.action === 'history') void openHistory(item);
      if (button.dataset.action === 'delete') { state.removing = { ...item }; $('confirm-item-nome').textContent = `${item.patrimonio} · ${item.nome}`; $('confirm-modal').showModal(); }
    });
    for (const btn of document.querySelectorAll('[data-close]')) btn.addEventListener('click', () => { if (!state.busy) $(btn.dataset.close).close(); });
    for (const dialog of document.querySelectorAll('dialog')) {
      dialog.addEventListener('cancel', event => { if (state.busy) event.preventDefault(); });
      dialog.addEventListener('click', event => { const rect = dialog.getBoundingClientRect(); if (!state.busy && event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close(); });
    }
    $('historico-modal').addEventListener('close', () => { state.historyId++; state.history = []; });
    $('historico-filtro').addEventListener('input', () => { state.historyPage = 1; renderHistory(); });
    $('history-prev').addEventListener('click', () => { state.historyPage--; renderHistory(); }); $('history-next').addEventListener('click', () => { state.historyPage++; renderHistory(); });
    $('btn-darkmode').addEventListener('click', () => { const dark = !document.body.classList.contains('dark'); setTheme(dark); try { localStorage.setItem('darkmode', String(dark)); } catch { /* O tema funciona mesmo sem armazenamento. */ } });
    window.addEventListener('offline', () => { if (state.user) { $('sync-status').textContent = 'Sem conexão · dados anteriores'; toast('Você está sem conexão. Alterações dependem da internet.', 'warning'); } });
    window.addEventListener('online', () => { if (state.user && !state.busy) void loadItems(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && state.user && !state.busy && !document.querySelector('dialog[open]')) void loadItems(); });
  }
  async function init() {
    let dark = matchMedia('(prefers-color-scheme: dark)').matches;
    try { const saved = localStorage.getItem('darkmode'); if (saved !== null) dark = saved === 'true'; } catch { /* Armazenamento indisponível. */ }
    setTheme(dark);
    for (const [name, values, filterLabel] of [['categoria', C.categories, 'Todas as categorias'], ['status', C.statuses, 'Todos os status']]) {
      for (const id of [name, 'edit-' + name, 'filter-' + name]) { const select = $(id); if (id.startsWith('filter-')) select.add(new Option(filterLabel, '')); for (const value of values) select.add(new Option(value, value)); }
    }
    events();
    try {
      const config = window.ESTOQUE_CONFIG;
      if (!window.supabase?.createClient) throw customError('Não foi possível carregar a conexão. Verifique a internet e recarregue a página.');
      if (!config?.supabaseUrl || !config?.supabaseKey) throw customError('Configure a URL e a chave publicável do Supabase em config.js.');
      client = window.supabase.createClient(config.supabaseUrl, config.supabaseKey, { global: { fetch: (input, init = {}) => fetch(input, { ...init, signal: AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(20000)]) }) } });
      // Não aguardamos outras chamadas Supabase dentro do callback de autenticação.
      client.auth.onAuthStateChange((_event, session) => { setTimeout(() => applySession(session), 0); });
      const { data, error } = await client.auth.getSession(); if (error) throw error;
      applySession(data.session); $('btn-login').disabled = false; $('btn-login').textContent = 'Entrar na plataforma →';
    } catch (error) { showError('login-error', errorMessage(error)); $('btn-login').disabled = true; $('btn-login').textContent = 'Recarregue para tentar novamente'; }
  }
  void init();
})();
