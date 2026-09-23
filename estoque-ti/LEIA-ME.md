# Estoque TI — versão corrigida

O sistema continua em HTML, CSS e JavaScript, sem necessidade de React ou Next.js. A configuração usa o projeto Supabase que você informou: `qadcyjuoowchgywanpml`.

## 1. Instalar o banco

1. Abra [o SQL Editor do seu projeto](https://supabase.com/dashboard/project/qadcyjuoowchgywanpml/sql/new).
2. Crie uma consulta nova e cole **todo** o arquivo `setup_supabase.sql`, de `begin` até `commit`.
3. Clique em **Run**. Em caso de erro, não execute trechos isolados: copie a mensagem para análise.
4. Se já houver tabelas/dados nesse projeto, faça uma cópia de segurança antes. A migração confere o formato dos dados e interrompe a execução se houver incompatibilidade ou patrimônios duplicados; não apaga nem corrige seus registros silenciosamente. `diagnostico_supabase.sql` contém consultas de inspeção.

O SQL cria `estoque` e `estoque_historico`, adiciona índices, validações, controle de concorrência, RLS e triggers de auditoria. O histórico é gravado no banco na mesma transação da alteração. Contas do aplicativo podem consultá-lo, mas não inseri-lo, alterá-lo ou apagá-lo diretamente. Exclusões de equipamentos preservam seu histórico. Os registros que já existiam antes da instalação não ganham um histórico retroativo inventado.

**Contas permitidas:** `bruno@estoque.com` e `victor@estoque.com`, preservando a lista do SQL original. Elas precisam existir em **Authentication → Users**. A tabela de equipamentos não cria contas de login. Se sua equipe usa outros e-mails, ajuste as duas guardas de autorização no SQL antes de executá-lo. O aplicativo não tem cadastro público de usuários.

## 2. Abrir o sistema

1. Extraia todo o ZIP em uma pasta.
2. Abra um terminal nessa pasta e execute:

   ```powershell
   python -m http.server 8080 --bind 127.0.0.1
   ```

3. Abra `http://localhost:8080` no navegador e entre com uma conta autorizada.

Também é possível publicar os arquivos estáticos em uma hospedagem HTTPS. Mantenha juntos `index.html`, `style.css`, `app.js`, `core.js`, `config.js` e `favicon.svg`. Não abra apenas o HTML pelo protocolo `file://`. O SDK Supabase está fixado na versão 2.57.4 e é carregado do CDN jsDelivr; o acesso ao banco e o login dependem da internet. O restante do visual usa fontes do sistema e ícones SVG locais.

## 3. Configuração

`config.js` já contém a URL e a chave publicável fornecidas por você. Como este projeto não usa Next.js, variáveis `NEXT_PUBLIC_*` não são lidas automaticamente: a configuração equivalente fica nesse arquivo. Não coloque senha de banco, chave `service_role` ou chave `sb_secret_*` no frontend.

O SQL precisa ser instalado antes de usar esta versão, pois a edição e a exclusão verificam a coluna `updated_at` para evitar sobrescrever alterações de outro usuário.

## O que foi corrigido

- Projeto Supabase corrigido: o ZIP original apontava para outro endereço.
- Histórico alinhado com `estoque_historico`, `estoque_id`, `criado_em`, `campo_alterado` e `usuario_email`.
- Histórico geral e por equipamento, com busca e paginação.
- Paginação reiniciada ao filtrar e ajustada antes de recortar resultados.
- Carregamento em lotes, inclusive quando a API limita a quantidade de registros por resposta.
- Botões de navegação, resumo de resultados e ordenação consistente em português.
- Tratamento de falhas, sessão expirada, estado ocupado e retorno vazio de edição/exclusão.
- Conteúdo renderizado como texto para evitar injeção de HTML.
- CSV com aspas, ponto e vírgula, quebras de linha, BOM UTF-8 e neutralização de fórmulas. O arquivo preserva zeros iniciais; ao importar no Excel, defina a coluna Patrimônio como **Texto** para impedir a conversão automática do Excel.
- Novo CSS responsivo, tema escuro completo, navegação por teclado, labels e diálogos nativos com foco contido.
- Indicador de descarte e atualização ao voltar para a aba ou recuperar a conexão.

O aplicativo carrega o inventário em memória para buscar, ordenar e exportar todos os resultados filtrados. O histórico é carregado ao abrir o diálogo. Para bases muito grandes, uma evolução futura é mover busca, contagem e paginação integralmente para o servidor.

## Validação realizada

Foram executados testes automatizados do JavaScript e do DOM, com serviço Supabase simulado, e testes SQL em PostgreSQL via PGlite, com contexto de autenticação equivalente para validar RLS. As verificações cobrem paginação acima de 1.000 registros, CRUD, proteção contra HTML, CSV, histórico, sessão, validação, duplicatas, acesso permitido/negado e concorrência. Também foi verificada a instalação repetida e a migração de uma tabela anterior com dados.

O endpoint do projeto informado respondeu, mas retornou `PGRST205` para `estoque`: a tabela ainda não estava disponível na API no momento da verificação. **O SQL não foi executado no Supabase online.** A sessão do Chrome mostrada na imagem não estava acessível pela ferramenta de navegador. A ferramenta também falhou ao abrir a prévia local, então a aparência não foi conferida em um navegador real nesta sessão. Os testes do DOM não substituem essa conferência visual.

Para repetir os testes locais (Node.js 20 ou superior):

```powershell
npm ci
npm test
npm run test:db
```

Os arquivos em `tests/` usam dados artificiais e bancos descartáveis. **Não execute os SQLs dessa pasta no projeto online.** Para a instalação online, use somente `setup_supabase.sql`.

Referências técnicas: [RLS do Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security), [eventos de autenticação](https://supabase.com/docs/reference/javascript/auth-onauthstatechange).
