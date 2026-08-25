# Norte — Organizador Financeiro Pessoal

Dashboard financeiro pessoal, 100% local (sem backend, sem servidor, sem envio de dados para fora do seu navegador).

## Como executar

**Opção mais simples:** dê duplo clique em `index.html`. Ele abre no seu navegador (Chrome, Edge, Firefox) e já funciona.

**Se preferir servir localmente** (opcional, evita qualquer restrição de alguns navegadores com arquivos locais):
```bash
cd norte-financeiro
python3 -m http.server 8000
# depois acesse http://localhost:8000
```

Os únicos recursos que exigem internet são as bibliotecas carregadas por CDN (Chart.js, SheetJS/XLSX e as fontes Sora/Inter). Se estiver offline, os gráficos e a exportação/importação de Excel não funcionam, mas o resto do app continua normal.

## Onde ficam seus dados

Tudo é salvo no **localStorage do seu navegador**, no seu computador ou celular. Nada é enviado para nenhum servidor. Se você limpar os dados do navegador (ou usar outro navegador/dispositivo), os dados não acompanham — por isso vale usar **Configurações → Exportar backup (JSON)** de vez em quando.

## Estrutura dos arquivos

```
index.html    → estrutura da página
styles.css    → tema claro/escuro, todos os componentes visuais
storage.js    → salvar/carregar dados, backup, dados iniciais
finance.js    → toda a lógica: parcelas, projeções, timeline de dívidas, insights, Excel
app.js        → telas, navegação, formulários e eventos
```

## Dados iniciais já cadastrados

O app já entra com os dados de Setembro/2026 que você passou: salário, renda extra, Ministério Público, Marquin/Notebook, Silvio TMB, Moto, Televisão, Shop 15, Internet e Luz — tudo com as prioridades e prazos informados. A partir de Outubro/2026, o salário assumido é R$ 5.000 (editável em **Configurações**).

Você pode editar ou apagar qualquer um desses lançamentos a qualquer momento pelos ícones de lápis/lixeira, ou zerar tudo em **Configurações → Apagar todos os dados**.

## O que cada tela faz

- **Visão Geral** — saldo disponível para usar hoje, próximos pagamentos, resumo do mês, meta de renda extra e insights automáticos.
- **Mês** — navegue entre meses, veja entradas e saídas detalhadas, marque contas como pagas.
- **Calendário** — visão por dia do mês, com indicadores de status.
- **Dívidas** — todos os parcelamentos ativos, a linha do tempo **"Quando vou respirar?"** (quando cada dívida termina e quanto libera no orçamento) e a área de dívidas/cartões para negociar.
- **Renda Extra** — acompanhamento da meta semanal/mensal.
- **Projeção** — evolução do saldo nos próximos 12 meses e simulador **"E se eu ganhar..."** (não altera seus dados reais até você clicar em "Aplicar").
- **Relatórios** — receitas x despesas ao longo do tempo e despesas por categoria.
- **Configurações** — salário, meta de renda extra, tema, exportar/importar Excel, backup e restauração, apagar dados.

## Importar sua planilha antiga

Em **Configurações → Importar planilha Excel**, escolha o `.xlsx`. O app tenta identificar nomes, valores, vencimentos e parcelas automaticamente e mostra uma prévia antes de gravar qualquer coisa — nada é salvo sem sua confirmação. Como é uma identificação heurística (sem IA externa, tudo roda no seu navegador), vale conferir e ajustar os itens importados depois.

## Preparado para o futuro

O código já está organizado para receber, quando fizer sentido: login/múltiplos usuários, um banco de dados real, sincronização em nuvem, um app mobile nativo e integração via Open Finance — sem precisar reescrever a lógica financeira (`finance.js`) já implementada.
