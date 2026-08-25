# Bills — Organizador Financeiro

App financeiro pessoal, estático, sem build step. Ver [README.md](README.md) para visão do produto.

## Stack e execução

- HTML/CSS/JS puro, sem framework, sem bundler. Abra `index.html` direto no navegador ou sirva estático.
- Dependências externas via CDN (precisam de internet): Chart.js, SheetJS/XLSX, fonte Manrope (Google Fonts).
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

- Marca **Bills** (rebrand de "Norte", ago/2026): identidade baseada num projeto de marca "Bills Brand Identity for a Bill Payment Platform" (Behance) que o usuário forneceu — logo de papel dobrado em dois tons de azul, fonte Manrope, paleta Frost Mist/Electric Azure/Cobalt Pulse/Midnight Sapphire.
- Tokens em `styles.css` `:root` (tema escuro, padrão) e `[data-theme="light"]`.
- Tema escuro: preto quase absoluto (`--bg:#010208`), cards distinguidos por borda hairline translúcida (`--border-soft`/`--border`), não por painel cinza.
- Tema claro: fundo Frost Mist (`--bg:#D8E5E4`), cards brancos (`--surface:#FFFFFF`).
- Azul de marca (`--info` = Electric Azure `#00A7FA`, mais `--accent-2`/`--accent-3` = Cobalt Pulse/Midnight Sapphire) é **separado** da cor semântica de dinheiro (`--positive` verde / `--danger` vermelho) — não confundir os dois ao adicionar UI nova.
- Botão primário (`.btn-primary`, `.bn-fab`) usa `--brand-cta-bg`/`--brand-cta-text` (preto sólido no claro, branco sólido no escuro) — **não** usa mais `--positive`, decisão intencional do rebrand pra bater com o padrão visual do Bills (CTAs pretos, não verdes).
- Fonte única: **Manrope** (`--font-display` e `--font-body`), pesos 400–800. Nota: é uma fonte mais arredondada/geométrica — contraria uma diretriz anterior de "fonte não muito arredondada", mas foi uma escolha explícita e informada do usuário ao trazer a referência visual do Bills; não reverter sem confirmar.
- Cor de valores monetários: usar as classes utilitárias `.pos` / `.neg` (verde/vermelho) baseadas no **sinal real do número**, nunca no tipo (receita/despesa) — já corrigido um bug assim em `app.js` (`txRow`) onde "Caixa anterior" negativo aparecia verde só por ser tecnicamente uma "income".

## Importação de planilha (`finance.js: parseWorkbookForImport`)

Heurística por palavras-chave nos cabeçalhos (não índice de coluna fixo):
- Nome: `nome`, `descri`, `item`, `conta`
- Valor: `valor`, `preço`/`preco`, `total`, `r$`
- Data: `venc`, `data`, `dia` — só reconhece `dd/mm/aaaa`, `dd-mm-aaaa` ou `aaaa-mm`, ou célula Excel formatada como data
- Parcela: `parcela`, formato `atual/total` (ex: `3/48`)

Classificação receita/despesa é por **nome da aba** (contém `receita`/`despesa` etc.) antes de olhar o item. Se a coluna de data não for reconhecida, o item cai no mês atualmente visualizado (`monthCursor`) — causa mais comum de "importou tudo pro mesmo mês".

## Ambiente desta máquina (relevante para sessões futuras)

- **Python 3.13 instalado** (não pelo instalador da Microsoft Store — real, em `AppData\Local\Programs\Python\Python313`), com `openpyxl` e `pandas`. O comando `python` no PATH ainda pode cair no "stub" da Microsoft Store dependendo da sessão de shell (alias de execução do Windows não desativado nesta conta) — use `py` (launcher oficial, sempre resolve pro Python real) em vez de `python`/`python3` em scripts/Bash daqui.
- **Node ainda não instalado** nesta máquina.
- **Extensão "Claude in Chrome" não conectada** neste ambiente (tentativas de reconexão falharam) — sem ela não dá pra testar upload de arquivo real. Alternativa usada: subir um `HttpListener` estático via PowerShell em background (script salvo no scratchpad) e abrir via `preview_start` com `http://localhost:PORTA`, já que `file://` fora da pasta do projeto renderiza como snapshot estático (sem JS) no Browser sandboxed.
- Tarefas com `.xlsx` que precisem contornar a falta de Node: xlsx é um zip de XML — dá pra extrair com `unzip`, gerar XML com Perl (`use utf8;` é obrigatório para acentuação correta) e reempacotar com PowerShell `System.IO.Compression.ZipFile` (não usar `Compress-Archive`, que grava separador `\` nas entradas do zip e quebra parsers estritos). Com Python disponível agora, `openpyxl`/`pandas` (via `py`) é a via preferida — só cair pro método manual se precisar de algo que essas libs não cobrem.
