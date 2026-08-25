# Norte — Organizador Financeiro

App financeiro pessoal, estático, sem build step. Ver [README.md](README.md) para visão do produto.

## Stack e execução

- HTML/CSS/JS puro, sem framework, sem bundler. Abra `index.html` direto no navegador ou sirva estático.
- Dependências externas via CDN (precisam de internet): Chart.js, SheetJS/XLSX, fonte Inter (Google Fonts).
- Dados ficam só no `localStorage` do navegador (ver `storage.js`). Não há backend.

## Estrutura

```
index.html    → shell da página (sidebar, topbar, containers de view)
styles.css    → design tokens (:root) + todos os componentes visuais
storage.js    → persistência (localStorage), backup/restore, seed inicial
finance.js    → lógica pura: parcelas, projeções, timeline, insights, parser de import de Excel
app.js        → renderização das views, eventos, formulários, delegação de cliques
```

Views são `<section class="view" id="view-...">` dentro de `#mainContent`, alternadas via `hidden`. Navegação por `data-view` nos botões da sidebar/bottom-nav. Ações de UI usam delegação de evento via `data-action` (ver final de `app.js`).

## Design system

- Tokens em `styles.css` `:root` (tema escuro, padrão) e `[data-theme="light"]`.
- Tema atual: **preto puro** (`--bg:#000000`), cards distinguidos por borda hairline translúcida (`--border-soft`/`--border`), não por painel cinza.
- Fonte única: **Inter** (`--font-display` e `--font-body`), pesos 400–900. Evitar fontes arredondadas tipo Sora/Manrope — o pedido do usuário foi explicitamente "não muito arredondada".
- Cor de valores monetários: usar as classes utilitárias `.pos` / `.neg` (verde/vermelho) baseadas no **sinal real do número**, nunca no tipo (receita/despesa) — já corrigido um bug assim em `app.js` (`txRow`) onde "Caixa anterior" negativo aparecia verde só por ser tecnicamente uma "income".

## Importação de planilha (`finance.js: parseWorkbookForImport`)

Heurística por palavras-chave nos cabeçalhos (não índice de coluna fixo):
- Nome: `nome`, `descri`, `item`, `conta`
- Valor: `valor`, `preço`/`preco`, `total`, `r$`
- Data: `venc`, `data`, `dia` — só reconhece `dd/mm/aaaa`, `dd-mm-aaaa` ou `aaaa-mm`, ou célula Excel formatada como data
- Parcela: `parcela`, formato `atual/total` (ex: `3/48`)

Classificação receita/despesa é por **nome da aba** (contém `receita`/`despesa` etc.) antes de olhar o item. Se a coluna de data não for reconhecida, o item cai no mês atualmente visualizado (`monthCursor`) — causa mais comum de "importou tudo pro mesmo mês".

## Ambiente desta máquina (relevante para sessões futuras)

- **Sem Python nem Node instalados** (só o stub da Microsoft Store). Tarefas com `.xlsx` exigem contornar isso: xlsx é um zip de XML — dá pra extrair com `unzip`, gerar XML com Perl (`use utf8;` é obrigatório para acentuação correta) e reempacotar com PowerShell `System.IO.Compression.ZipFile` (não usar `Compress-Archive`, que grava separador `\` nas entradas do zip e quebra parsers estritos).
- **Extensão "Claude in Chrome" não conectada** neste ambiente — sem ela não dá pra testar upload de arquivo real. Alternativa usada: subir um `HttpListener` estático via PowerShell em background (script salvo no scratchpad) e abrir via `preview_start` com `http://localhost:PORTA`, já que `file://` fora da pasta do projeto renderiza como snapshot estático (sem JS) no Browser sandboxed.
