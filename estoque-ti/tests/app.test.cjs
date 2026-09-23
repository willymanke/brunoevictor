const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) { for (let i = 0; i < 100; i++) { if (check()) return; await delay(5); } assert.fail('Estado esperado não chegou'); }
function boot({ count = 31, session = true, sdk = true } = {}) {
  const dom = new JSDOM(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), { url: 'http://localhost/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window; const $ = id => w.document.getElementById(id);
  w.matchMedia = () => ({ matches: false });
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; this.dispatchEvent(new w.Event('close')); };
  w.AbortSignal.timeout = () => new w.AbortController().signal;
  const user = { id: 'user-1', email: 'bruno@estoque.com' };
  const items = Array.from({length:count}, (_,i) => ({ id:i+1, patrimonio:String(10000+i), nome:`Notebook ${i+1}`, categoria:'Notebook', status:i%2?'Em Uso':'Disponível', responsavel:'João', descricao:'', updated_at:`2026-09-23T12:00:${String(i%60).padStart(2,'0')}.000Z` }));
  const history = [{id:1,estoque_id:1,patrimonio:'10000',acao:'CRIACAO',campo_alterado:'Equipamento',valor_novo:'<img src=x onerror=alert(1)>',usuario_email:'bruno@estoque.com',criado_em:'2026-09-23T12:00:00Z'}];
  const calls = []; let callback; const flags = { error:null, conflict:false };
  const client = {
    auth: {
      onAuthStateChange(fn) {callback = fn; return {data:{subscription:{unsubscribe(){}}}};},
      async getSession(){return {data:{session:session?{user}:null},error:null};},
      async signInWithPassword(){callback('SIGNED_IN',{user});return {data:{session:{user},user},error:null};},
      async signOut(){callback('SIGNED_OUT',null);return {error:null};}
    },
    from(table) {
      const opts = {table, filters:[], offset:0, end:499, operation:'select'};
      const q = {
        select(){return q;}, order(){return q;}, abortSignal(){return q;},
        range(offset,end){opts.offset=offset;opts.end=end;return q;},
        eq(field,value){opts.filters.push([field,value]);return q;},
        insert(value){opts.operation='insert';opts.value=value;return q;},
        update(value){opts.operation='update';opts.value=value;return q;},
        delete(){opts.operation='delete';return q;},
        then(resolve,reject){return Promise.resolve().then(() => {
          calls.push({...opts});
          if(flags.error){const error=flags.error;flags.error=null;return {data:null,error};}
          const source=table==='estoque'?items:history;
          const matches=item=>opts.filters.every(([field,value])=>String(item[field])===String(value));
          if(opts.operation==='select')return {data:source.filter(matches).slice(opts.offset,Math.min(opts.end+1,opts.offset+7)).map(x=>({...x})),error:null};
          if(flags.conflict){flags.conflict=false;return {data:[],error:null};}
          if(opts.operation==='insert'){const item={...opts.value,id:Math.max(0,...items.map(x=>x.id))+1,updated_at:new Date().toISOString()};items.push(item);return {data:[{id:item.id}],error:null};}
          const match=items.find(matches);if(!match)return {data:[],error:null};
          if(opts.operation==='update')Object.assign(match,opts.value,{updated_at:new Date().toISOString()});
          if(opts.operation==='delete')items.splice(items.indexOf(match),1);
          return {data:[{id:match.id}],error:null};
        }).then(resolve,reject);}
      };return q;
    }
  };
  if(sdk)w.supabase={createClient:()=>client};
  w.ESTOQUE_CONFIG={supabaseUrl:'https://example.supabase.co',supabaseKey:'publishable-test'};
  w.eval(fs.readFileSync(path.join(root,'core.js'),'utf8')); w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8'));
  const input=(id,value)=>{$(id).value=value;$(id).dispatchEvent(new w.Event(id.includes('filter-')?'change':'input',{bubbles:true}));};
  const submit=id=>$(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  return {dom,w,$,items,history,calls,flags,input,submit};
}
test('carrega todos os lotes, pagina, filtra e atualiza resumo', async t=>{
  const a=boot({count:1005});t.after(()=>a.dom.window.close());
  await until(()=>a.$('total-count').textContent==='1005');
  assert.equal(a.$('table-body').rows.length,15);
  a.$('btn-next').click();assert.equal(a.$('page-info').textContent,'Página 2 de 67');
  a.input('search','Notebook 1005');assert.equal(a.$('page-info').textContent,'Página 1 de 1');assert.equal(a.$('table-body').rows.length,1);
  assert.match(a.$('results-summary').textContent,/1 equipamento encontrado/);
  assert.equal(a.$('btn-next').disabled,true);
  a.$('btn-clear-filters').click();assert.equal(a.$('table-body').rows.length,15);
});
test('dados e histórico são texto, sem execução de HTML; histórico usa esquema correto',async t=>{
  const a=boot({count:1});t.after(()=>a.dom.window.close());
  a.items[0].nome='<img src=x onerror=alert(1)>';
  await until(()=>a.$('total-count').textContent==='1');
  assert.equal(a.$('table-body').querySelector('img'),null);
  assert.match(a.$('table-body').textContent,/<img/);
  a.$('btn-historico').click();await until(()=>a.$('history-summary').textContent.includes('1 movimentações'));
  assert.equal(a.$('historico-body').querySelector('img'),null);
  assert.ok(a.calls.some(c=>c.table==='estoque_historico'&&c.filters.length===0));
  a.$('historico-modal').close();a.$('table-body').querySelector('[data-action=history]').click();
  await until(()=>a.calls.some(c=>c.table==='estoque_historico'&&c.filters.some(f=>f[0]==='estoque_id')));
});
test('cadastro, edição e exclusão confirmam linhas retornadas e bloqueiam duplicação',async t=>{
  const a=boot({count:1});t.after(()=>a.dom.window.close());await until(()=>a.$('total-count').textContent==='1');
  a.input('patrimonio','00123');a.input('nome','Novo equipamento');a.submit('add-form');a.submit('add-form');
  await until(()=>a.$('total-count').textContent==='2');assert.equal(a.calls.filter(c=>c.operation==='insert').length,1);
  a.$('table-body').querySelector('[data-action=edit]').click();a.input('edit-nome','Atualizado');a.submit('edit-form');
  await until(()=>!a.$('edit-modal').open);await until(()=>a.$('table-body').textContent.includes('Atualizado'));
  assert.ok(a.calls.some(c=>c.operation==='update'&&c.filters.some(f=>f[0]==='updated_at')));
  a.$('table-body').querySelector('[data-action=delete]').click();a.$('btn-confirm-excluir').click();
  await until(()=>a.$('total-count').textContent==='1');assert.equal(a.$('confirm-modal').open,false);
});
test('conflito e erro não exibem sucesso nem fecham o formulário',async t=>{
  const a=boot({count:1});t.after(()=>a.dom.window.close());await until(()=>a.$('total-count').textContent==='1');
  a.$('table-body').querySelector('[data-action=edit]').click();a.input('edit-nome','Alterado');a.flags.conflict=true;a.submit('edit-form');
  await until(()=>a.$('toast-container').textContent.includes('outra pessoa'));assert.equal(a.$('edit-modal').open,true);assert.equal(a.items[0].nome,'Notebook 1');
  a.flags.error={code:'23505'};a.submit('edit-form');await until(()=>a.$('toast-container').textContent.includes('já está cadastrado'));
  assert.equal(a.$('edit-form').querySelector('[type=submit]').disabled,false);
});
test('login, tema e logout limpam os dados da sessão',async t=>{
  const a=boot({session:false,count:1});t.after(()=>a.dom.window.close());await until(()=>!a.$('btn-login').disabled);
  assert.equal(a.$('app-screen').hidden,true);a.input('login-email','bruno@estoque.com');a.input('login-password','apenas-teste');a.submit('login-form');
  await until(()=>a.$('total-count').textContent==='1');a.$('btn-darkmode').click();assert.equal(a.w.localStorage.getItem('darkmode'),'true');
  a.$('btn-logout').click();await until(()=>a.$('app-screen').hidden);assert.equal(a.$('table-body').children.length,0);assert.equal(a.$('login-password').value,'');
});
test('SDK indisponível gera mensagem acionável',async t=>{
  const a=boot({sdk:false});t.after(()=>a.dom.window.close());await until(()=>!a.$('login-error').hidden);
  assert.match(a.$('login-error').textContent,/recarregue/);assert.equal(a.$('btn-login').disabled,true);
});
