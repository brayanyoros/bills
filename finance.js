/* ============================================================
   NORTE — finance.js
   Toda a lógica de negócio: formatação, geração de lançamentos
   mensais a partir de dívidas/parcelamentos, status, projeções,
   linha do tempo, insights, simulador de cenários e Excel.
   ============================================================ */
(function (global) {
  'use strict';

  var MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  var MONTH_NAMES_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  var DOW_SHORT = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

  var currencyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  function formatBRL(v) {
    if (v === null || v === undefined || isNaN(v)) v = 0;
    return currencyFmt.format(v);
  }

  function formatDateBR(iso) {
    if (!iso) return '';
    var parts = iso.split('-');
    return parts[2] + '/' + parts[1] + '/' + parts[0];
  }

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  function todayISO() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function todayMonthKey() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
  }

  function monthKeyParts(monthKey) {
    var p = monthKey.split('-');
    return { y: parseInt(p[0], 10), m: parseInt(p[1], 10) };
  }

  function monthKeyToLabel(monthKey, short) {
    var p = monthKeyParts(monthKey);
    var name = (short ? MONTH_NAMES_SHORT : MONTH_NAMES)[p.m - 1];
    return name + (short ? '/' : ' de ') + p.y;
  }

  function addMonths(monthKey, n) {
    var p = monthKeyParts(monthKey);
    var total = (p.y * 12 + (p.m - 1)) + n;
    var y = Math.floor(total / 12);
    var m = (total % 12) + 1;
    return y + '-' + pad2(m);
  }

  function monthDiff(fromKey, toKey) {
    var a = monthKeyParts(fromKey), b = monthKeyParts(toKey);
    return (b.y * 12 + b.m) - (a.y * 12 + a.m);
  }

  function compareMonthKey(a, b) { return a === b ? 0 : (a < b ? -1 : 1); }

  function daysInMonth(monthKey) {
    var p = monthKeyParts(monthKey);
    return new Date(p.y, p.m, 0).getDate();
  }

  function monthDateISO(monthKey, day) {
    var p = monthKeyParts(monthKey);
    var d = Math.min(day || 1, daysInMonth(monthKey));
    return monthKey + '-' + pad2(d);
  }

  function diffDaysFromToday(iso) {
    var today = new Date(todayISO() + 'T00:00:00');
    var target = new Date(iso + 'T00:00:00');
    return Math.round((target - today) / 86400000);
  }

  function weekdayOfFirst(monthKey) {
    var p = monthKeyParts(monthKey);
    return new Date(p.y, p.m - 1, 1).getDay();
  }

  /* -------------------------------------------------------
     Dívidas / parcelamentos → lançamentos por mês
     ------------------------------------------------------- */
  function isDebtActiveInMonth(debt, monthKey) {
    var idx = monthDiff(debt.startMonth, monthKey);
    if (idx < 0) return false;
    if (debt.installments === null || debt.installments === undefined) return true;
    return idx < debt.installments;
  }

  function installmentNumber(debt, monthKey) {
    return monthDiff(debt.startMonth, monthKey) + 1;
  }

  function debtEndMonth(debt) {
    if (debt.installments === null || debt.installments === undefined) return null;
    return addMonths(debt.startMonth, debt.installments - 1);
  }

  function overrideKey(sourceId, monthKey) { return sourceId + '_' + monthKey; }

  function getOverride(state, sourceId, monthKey) {
    return state.transactionOverrides[overrideKey(sourceId, monthKey)] || null;
  }

  function computeStatus(dueISO, ov) {
    if (ov && ov.status === 'paid') return 'paid';
    var d = diffDaysFromToday(dueISO);
    if (d < 0) return 'overdue';
    if (d <= 3) return 'due_soon';
    return 'pending';
  }

  function statusLabel(status) {
    return { paid: 'Pago', pending: 'Pendente', due_soon: 'Vence em breve', overdue: 'Atrasado' }[status] || status;
  }

  function priorityLabel(p) {
    return { urgent: 'Não pode atrasar', important: 'Importante', negotiable: 'Negociável' }[p] || p;
  }

  /* -------------------------------------------------------
     Lançamentos de um mês (entradas + saídas)
     ------------------------------------------------------- */
  function generateExpensesForMonth(state, monthKey) {
    var list = [];
    (state.debtGroups || []).forEach(function (debt) {
      if (isDebtActiveInMonth(debt, monthKey)) {
        var dueISO = monthDateISO(monthKey, debt.dueDay);
        var ov = getOverride(state, debt.id, monthKey);
        var instNum = installmentNumber(debt, monthKey);
        list.push({
          id: debt.id,
          sourceId: debt.id,
          monthKey: monthKey,
          type: 'expense',
          name: debt.name,
          category: debt.category,
          amount: debt.installmentValue,
          dueDay: debt.dueDay,
          dueISO: dueISO,
          priority: debt.priority,
          installmentCurrent: instNum,
          installmentTotal: (debt.installments === null || debt.installments === undefined) ? null : debt.installments,
          status: computeStatus(dueISO, ov),
          paidDate: ov && ov.paidDate ? ov.paidDate : null,
          notes: debt.notes || '',
          recurring: (debt.installments === null || debt.installments === undefined)
        });
      }

      // Parcelas de meses já passados que ficaram sem marcar como pagas não podem simplesmente
      // sumir do cálculo — continuam aparecendo (atrasadas) em todo mês seguinte até serem
      // pagas. Só se aplica a dívidas com número de parcelas definido (recorrente sem fim já
      // reaparece sozinha todo mês, não precisa disso).
      if (debt.installments !== null && debt.installments !== undefined) {
        var lastPastIdx = Math.min(debt.installments - 1, monthDiff(debt.startMonth, monthKey) - 1);
        for (var idx = 0; idx <= lastPastIdx; idx++) {
          var pastMonthKey = addMonths(debt.startMonth, idx);
          var pastOv = getOverride(state, debt.id, pastMonthKey);
          if (pastOv && pastOv.status === 'paid') continue;
          var pastDueISO = monthDateISO(pastMonthKey, debt.dueDay);
          list.push({
            id: debt.id + '_carry_' + idx,
            sourceId: debt.id,
            monthKey: pastMonthKey,
            type: 'expense',
            name: debt.name,
            category: debt.category,
            amount: debt.installmentValue,
            dueDay: debt.dueDay,
            dueISO: pastDueISO,
            priority: debt.priority,
            installmentCurrent: idx + 1,
            installmentTotal: debt.installments,
            status: computeStatus(pastDueISO, pastOv),
            paidDate: null,
            notes: debt.notes || '',
            recurring: false,
            carried: true
          });
        }
      }
    });
    list.sort(function (a, b) {
      var order = { urgent: 0, important: 1, negotiable: 2 };
      var byPriority = (order[a.priority] || 9) - (order[b.priority] || 9);
      if (byPriority !== 0) return byPriority;
      return a.dueDay - b.dueDay;
    });
    return list;
  }

  function salaryForMonth(state, monthKey) {
    var overrides = state.settings.salaryOverrides || {};
    var ov = overrides[monthKey];
    if (ov !== undefined && ov !== null) return ov;
    // Meses anteriores ao mês inicial controlado não herdam valor nenhum.
    if (compareMonthKey(monthKey, state.settings.epochMonth) < 0) return 0;
    // Sem valor próprio: repete o último salário definido em um mês anterior
    // (o Perfil deixa o usuário preencher os próximos meses; depois disso,
    // o valor do último mês preenchido continua valendo indefinidamente).
    var bestKey = null;
    Object.keys(overrides).forEach(function (k) {
      if (compareMonthKey(k, monthKey) <= 0 && (bestKey === null || compareMonthKey(k, bestKey) > 0)) bestKey = k;
    });
    if (bestKey !== null) return overrides[bestKey];
    // Compatibilidade com saves antigos que só tinham um "salário padrão" único.
    return state.settings.salaryDefault || 0;
  }

  function extraIncomeForMonth(state, monthKey) {
    return (state.extraIncomeEntries || []).filter(function (e) { return e.monthKey === monthKey; });
  }

  function extraIncomeTotalForMonth(state, monthKey) {
    return extraIncomeForMonth(state, monthKey).reduce(function (s, e) { return s + e.amount; }, 0);
  }

  function cashCarriedFromPrevious(state, monthKey) {
    var epoch = state.settings.epochMonth;
    if (monthKey === epoch) return state.settings.cashStartEpoch || 0;
    if (compareMonthKey(monthKey, epoch) < 0) return 0;
    var prev = addMonths(monthKey, -1);
    var prevSummary = computeMonthSummary(state, prev);
    return prevSummary.saldoEmConta;
  }

  function generateIncomesForMonth(state, monthKey, includeCaixaAnterior) {
    var list = [];
    var salary = salaryForMonth(state, monthKey);
    list.push({ id: 'salary', sourceId: 'salary', monthKey: monthKey, type: 'income', name: 'Salário', category: 'Salário', amount: salary, dueDay: state.settings.salaryDay });

    var extra = extraIncomeTotalForMonth(state, monthKey);
    if (extra > 0) {
      list.push({ id: 'extra', sourceId: 'extra', monthKey: monthKey, type: 'income', name: 'Renda Extra', category: 'Renda Extra', amount: extra, dueDay: null });
    }

    (state.manualIncomes || []).filter(function (i) { return i.monthKey === monthKey; }).forEach(function (i) {
      list.push({ id: i.id, sourceId: i.id, monthKey: monthKey, type: 'income', name: i.name, category: i.category || 'Outros', amount: i.amount, dueDay: i.date ? parseInt(i.date.split('-')[2], 10) : null });
    });

    if (includeCaixaAnterior !== false) {
      var carried = cashCarriedFromPrevious(state, monthKey);
      list.push({ id: 'caixa_anterior', sourceId: 'caixa_anterior', monthKey: monthKey, type: 'income', name: 'Caixa anterior', category: 'Saldo anterior', amount: carried, dueDay: null, isCarry: true });
    }
    return list;
  }

  /* -------------------------------------------------------
     Caixinhas de investimento — juros compostos mensais sobre a Selic
     ------------------------------------------------------- */
  function selicMonthlyRate(state) {
    var annual = (state.settings.selicRateAnnual || 0) / 100;
    return Math.pow(1 + annual, 1 / 12) - 1;
  }

  function pocketMovementsForMonth(pocket, monthKey) {
    return (pocket.movements || []).filter(function (m) { return m.monthKey === monthKey; });
  }

  function netPocketMovementsForMonth(state, monthKey) {
    var net = 0;
    (state.investmentPockets || []).forEach(function (p) {
      pocketMovementsForMonth(p, monthKey).forEach(function (m) {
        net += (m.type === 'deposit' ? m.amount : -m.amount);
      });
    });
    return net;
  }

  function computePocketBalance(state, pocket, asOfMonthKey) {
    var movements = (pocket.movements || []).slice().sort(function (a, b) { return a.monthKey < b.monthKey ? -1 : (a.monthKey > b.monthKey ? 1 : 0); });
    if (!movements.length) return { balance: 0, principal: 0, yieldThisMonth: 0, yieldTotal: 0 };
    var rate = selicMonthlyRate(state);
    var mk = movements[0].monthKey;
    var balance = 0, principal = 0, yieldTotal = 0, yieldThisMonth = 0;
    while (compareMonthKey(mk, asOfMonthKey) <= 0) {
      var y = balance * rate;
      balance += y;
      yieldTotal += y;
      if (mk === asOfMonthKey) yieldThisMonth = y;
      pocketMovementsForMonth(pocket, mk).forEach(function (m) {
        var delta = m.type === 'deposit' ? m.amount : -m.amount;
        balance += delta; principal += delta;
      });
      mk = addMonths(mk, 1);
    }
    return { balance: round2(balance), principal: round2(principal), yieldThisMonth: round2(yieldThisMonth), yieldTotal: round2(yieldTotal) };
  }

  function computeInvestmentsSummary(state, asOfMonthKey) {
    var pockets = (state.investmentPockets || []).map(function (p) {
      var calc = computePocketBalance(state, p, asOfMonthKey);
      return { id: p.id, name: p.name, balance: calc.balance, principal: calc.principal, yieldThisMonth: calc.yieldThisMonth, yieldTotal: calc.yieldTotal };
    });
    var totalBalance = pockets.reduce(function (s, p) { return s + p.balance; }, 0);
    var totalPrincipal = pockets.reduce(function (s, p) { return s + p.principal; }, 0);
    var totalYieldThisMonth = pockets.reduce(function (s, p) { return s + p.yieldThisMonth; }, 0);
    var totalYieldAll = pockets.reduce(function (s, p) { return s + p.yieldTotal; }, 0);
    return { pockets: pockets, totalBalance: round2(totalBalance), totalPrincipal: round2(totalPrincipal), totalYieldThisMonth: round2(totalYieldThisMonth), totalYieldAll: round2(totalYieldAll) };
  }

  var _summaryCache = {};
  function computeMonthSummary(state, monthKey) {
    var cacheKey = monthKey + '::' + JSON.stringify(state.transactionOverrides) + '::' + state.debtGroups.length + '::' + (state.extraIncomeEntries || []).length + '::' + (state.manualIncomes || []).length + '::' + JSON.stringify(state.investmentPockets || []);
    if (_summaryCache[cacheKey]) return _summaryCache[cacheKey];

    var expenses = generateExpensesForMonth(state, monthKey);
    var incomesFull = generateIncomesForMonth(state, monthKey, true);
    var incomesNoCarry = incomesFull.filter(function (i) { return !i.isCarry; });

    var recebidos = incomesNoCarry.reduce(function (s, i) { return s + i.amount; }, 0);
    var caixaAnterior = incomesFull.filter(function (i) { return i.isCarry; }).reduce(function (s, i) { return s + i.amount; }, 0);
    var totalIncome = recebidos + caixaAnterior;
    var investedNet = netPocketMovementsForMonth(state, monthKey);

    var comprometido = expenses.reduce(function (s, e) { return s + e.amount; }, 0);
    var expensesPaid = expenses.filter(function (e) { return e.status === 'paid'; }).reduce(function (s, e) { return s + e.amount; }, 0);
    var expensesUnpaidPriority = expenses.filter(function (e) { return e.status !== 'paid' && (e.priority === 'urgent' || e.priority === 'important'); }).reduce(function (s, e) { return s + e.amount; }, 0);
    var expensesUnpaidUrgent = expenses.filter(function (e) { return e.status !== 'paid' && e.priority === 'urgent'; }).reduce(function (s, e) { return s + e.amount; }, 0);

    var comprometidoAberto = comprometido - expensesPaid; // só o que ainda falta pagar este mês
    var saldoMes = totalIncome - comprometido - investedNet; // saldo simples do mês, tratando tudo como se fosse pago (referência/insight)
    var saldoEmConta = caixaAnterior + recebidos - expensesPaid - investedNet; // dinheiro real: só desconta o que já foi marcado como pago — é isso que vira o "caixa anterior" do próximo mês
    var saldoDisponivel = saldoEmConta - expensesUnpaidPriority;
    var committedPercent = recebidos > 0 ? Math.max(0, Math.min(999, (comprometido / recebidos) * 100)) : 0;

    var result = {
      monthKey: monthKey,
      expenses: expenses,
      incomes: incomesFull,
      recebidos: recebidos,
      caixaAnterior: caixaAnterior,
      totalIncome: totalIncome,
      investedNet: investedNet,
      comprometido: comprometido,
      comprometidoAberto: comprometidoAberto,
      expensesPaid: expensesPaid,
      expensesUnpaidPriority: expensesUnpaidPriority,
      expensesUnpaidUrgent: expensesUnpaidUrgent,
      saldoMes: saldoMes,
      saldoEmConta: saldoEmConta,
      saldoDisponivel: saldoDisponivel,
      committedPercent: committedPercent,
      installmentCount: expenses.filter(function (e) { return e.installmentTotal !== null; }).length,
      installmentTotal: expenses.filter(function (e) { return e.installmentTotal !== null; }).reduce(function (s, e) { return s + e.amount; }, 0)
    };
    _summaryCache[cacheKey] = result;
    return result;
  }

  function invalidateCache() { _summaryCache = {}; }

  /* -------------------------------------------------------
     Dívidas restantes (saldo devedor a partir de um mês)
     ------------------------------------------------------- */
  function remainingDebtTotal(state, asOfMonthKey) {
    var total = 0;
    (state.debtGroups || []).forEach(function (debt) {
      if (debt.installments === null || debt.installments === undefined) return;
      var idx = monthDiff(debt.startMonth, asOfMonthKey);
      var remaining;
      if (idx < 0) remaining = debt.installments;
      else remaining = Math.max(0, debt.installments - idx);
      total += remaining * debt.installmentValue;
    });
    return total;
  }

  /* -------------------------------------------------------
     Projeção (N meses à frente)
     ------------------------------------------------------- */
  function buildProjection(state, startMonthKey, count) {
    var rows = [];
    for (var i = 0; i < count; i++) {
      var mk = addMonths(startMonthKey, i);
      var s = computeMonthSummary(state, mk);
      rows.push({ monthKey: mk, label: monthKeyToLabel(mk, true), receita: s.recebidos, despesa: s.comprometido, saldo: s.saldoMes, saldoEmConta: s.saldoEmConta });
    }
    return rows;
  }

  /* -------------------------------------------------------
     "Quando vou respirar?" — linha do tempo de fim de dívidas
     ------------------------------------------------------- */
  function buildBreathingTimeline(state) {
    var anchor = compareMonthKey(todayMonthKey(), state.settings.epochMonth) > 0 ? todayMonthKey() : state.settings.epochMonth;
    var events = [];
    (state.debtGroups || []).forEach(function (debt) {
      var end = debtEndMonth(debt);
      if (!end) return; // recorrente sem fim
      if (compareMonthKey(end, anchor) < 0) return; // já terminou antes da âncora
      var freedMonth = addMonths(end, 1);
      events.push({ debtId: debt.id, name: debt.name, endMonth: end, freedMonth: freedMonth, amount: debt.installmentValue });
    });
    events.sort(function (a, b) { return compareMonthKey(a.freedMonth, b.freedMonth); });
    var cumulative = 0;
    events.forEach(function (e) { cumulative += e.amount; e.cumulative = cumulative; });
    return { events: events, totalFreed: cumulative };
  }

  /* -------------------------------------------------------
     Insights automáticos
     ------------------------------------------------------- */
  function buildInsights(state, monthKey) {
    var s = computeMonthSummary(state, monthKey);
    var insights = [];

    if (s.recebidos > 0) {
      insights.push({
        type: s.committedPercent >= 70 ? 'warn' : 'info',
        html: '<b>' + Math.round(s.committedPercent) + '%</b> da sua renda deste mês já está comprometida.'
      });
    }

    var overdue = s.expenses.filter(function (e) { return e.status === 'overdue'; });
    if (overdue.length > 0) {
      var overdueTotal = overdue.reduce(function (a, e) { return a + e.amount; }, 0);
      insights.push({ type: 'warn', html: '<b>' + overdue.length + ' conta(s) atrasada(s)</b> somando ' + formatBRL(overdueTotal) + '.' });
    }

    var upcoming = s.expenses.filter(function (e) { return e.status === 'due_soon' || e.status === 'pending'; })
      .filter(function (e) { return e.status !== 'paid'; })
      .sort(function (a, b) { return a.dueISO < b.dueISO ? -1 : 1; })[0];
    if (upcoming) {
      var days = diffDaysFromToday(upcoming.dueISO);
      var when = days <= 0 ? 'hoje' : (days === 1 ? 'amanhã' : 'em ' + days + ' dias');
      insights.push({ type: 'info', html: 'Próxima conta: <b>' + upcoming.name + '</b> vence ' + when + '.' });
    }

    var timeline = buildBreathingTimeline(state);
    if (timeline.events.length > 0) {
      var next = timeline.events[0];
      var monthsAway = monthDiff(monthKey, next.freedMonth);
      if (monthsAway >= 0) {
        insights.push({
          type: 'good',
          html: monthsAway === 0
            ? '<b>' + next.name + '</b> termina — ' + formatBRL(next.amount) + '/mês a mais livres a partir de agora.'
            : 'Em <b>' + monthsAway + ' mes(es)</b> você terá ' + formatBRL(next.amount) + ' a mais livres por mês (' + next.name + ' termina).'
        });
      }
    }

    var goalMonthly = (state.settings.extraIncomeWeeklyGoal || 0) * 4;
    var extraSoFar = extraIncomeTotalForMonth(state, monthKey);
    if (goalMonthly > 0) {
      var remaining = goalMonthly - extraSoFar;
      insights.push({
        type: 'goal',
        html: remaining > 0
          ? 'Faltam <b>' + formatBRL(remaining) + '</b> para atingir sua meta de renda extra.'
          : '<b>Meta de renda extra atingida</b> neste mês! 🎉'
      });
    }

    insights.push({
      type: s.saldoMes >= 0 ? 'good' : 'warn',
      html: 'Mantendo sua renda atual, você termina o mês com <b>' + formatBRL(s.saldoMes) + '</b>.'
    });

    return insights;
  }

  /* -------------------------------------------------------
     Simulador de cenários (não altera dados reais)
     ------------------------------------------------------- */
  function simulateScenario(state, monthKey, overrideSalary, overrideExtraMonthly) {
    var expenses = generateExpensesForMonth(state, monthKey);
    var comprometido = expenses.reduce(function (s, e) { return s + e.amount; }, 0);
    var recebidos = (overrideSalary || 0) + (overrideExtraMonthly || 0);
    var saldo = recebidos - comprometido;
    var committedPercent = recebidos > 0 ? (comprometido / recebidos) * 100 : 0;
    return { recebidos: recebidos, comprometido: comprometido, saldo: saldo, committedPercent: committedPercent };
  }

  /* -------------------------------------------------------
     Exportação para Excel (SheetJS)
     ------------------------------------------------------- */
  function exportToExcel(state, monthCount) {
    if (!global.XLSX) { throw new Error('Biblioteca de Excel não carregada.'); }
    var wb = XLSX.utils.book_new();
    var startMonth = state.settings.epochMonth;
    var n = monthCount || 24;

    var summaryRows = [['Mês', 'Receitas', 'Despesas', 'Saldo do mês', 'Saldo em conta']];
    for (var i = 0; i < n; i++) {
      var mk = addMonths(startMonth, i);
      var s = computeMonthSummary(state, mk);
      summaryRows.push([monthKeyToLabel(mk), round2(s.recebidos), round2(s.comprometido), round2(s.saldoMes), round2(s.saldoEmConta)]);

      var monthRows = [['ENTRADAS', '', ''], ['Descrição', 'Categoria', 'Valor']];
      s.incomes.forEach(function (inc) { monthRows.push([inc.name, inc.category, round2(inc.amount)]); });
      monthRows.push(['Total entradas', '', round2(s.totalIncome)]);
      monthRows.push(['', '', '']);
      monthRows.push(['SAÍDAS', '', '']);
      monthRows.push(['Descrição', 'Vencimento', 'Valor', 'Parcela', 'Prioridade', 'Status']);
      s.expenses.forEach(function (e) {
        monthRows.push([e.name, formatDateBR(e.dueISO), round2(e.amount),
          e.installmentTotal ? (e.installmentCurrent + '/' + e.installmentTotal) : '-',
          priorityLabel(e.priority), statusLabel(e.status)]);
      });
      monthRows.push(['Total saídas', '', round2(s.comprometido), '', '', '']);
      monthRows.push(['', '', '', '', '', '']);
      if (s.investedNet) monthRows.push(['Alocado em caixinhas', '', round2(s.investedNet), '', '', '']);
      monthRows.push(['Saldo do mês', '', round2(s.saldoMes), '', '', '']);

      var ws = XLSX.utils.aoa_to_sheet(monthRows);
      ws['!cols'] = [{ wch: 26 }, { wch: 14 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 14 }];
      var sheetName = monthKeyToLabel(mk, true).replace('/', ' ');
      XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31));
    }

    var summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
    summaryWs['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Resumo');
    // reorder so 'Resumo' is first
    wb.SheetNames.unshift(wb.SheetNames.pop());

    var stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, 'bills-' + stamp + '.xlsx');
  }

  function round2(v) { return Math.round((v + Number.EPSILON) * 100) / 100; }

  /* -------------------------------------------------------
     Importação de planilha (.xlsx) — heurística
     ------------------------------------------------------- */
  function parseWorkbookForImport(workbook) {
    var candidates = { incomes: [], expenses: [] };
    var incomeHints = ['receita', 'entrada', 'salario', 'salário', 'renda'];
    var expenseHints = ['despesa', 'saida', 'saída', 'conta', 'parcela', 'divida', 'dívida'];
    var valueHints = ['valor', 'preço', 'preco', 'total', 'r$'];
    var dateHints = ['venc', 'data', 'dia'];
    var nameHints = ['nome', 'descri', 'item', 'conta'];
    var parcelaHints = ['parcela'];

    workbook.SheetNames.forEach(function (sheetName) {
      var sheet = workbook.Sheets[sheetName];
      var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' });
      if (!rows.length) return;

      var sheetIsIncome = incomeHints.some(function (h) { return sheetName.toLowerCase().indexOf(h) !== -1; });
      var sheetIsExpense = expenseHints.some(function (h) { return sheetName.toLowerCase().indexOf(h) !== -1; });

      var headerRowIdx = -1, cols = {};
      for (var r = 0; r < Math.min(rows.length, 15); r++) {
        var row = rows[r].map(function (c) { return ('' + c).toLowerCase(); });
        var found = {};
        row.forEach(function (cell, ci) {
          if (!found.value && valueHints.some(function (h) { return cell.indexOf(h) !== -1; })) found.value = ci;
          if (!found.date && dateHints.some(function (h) { return cell.indexOf(h) !== -1; })) found.date = ci;
          if (!found.name && nameHints.some(function (h) { return cell.indexOf(h) !== -1; })) found.name = ci;
          if (!found.parcela && parcelaHints.some(function (h) { return cell.indexOf(h) !== -1; })) found.parcela = ci;
        });
        if (found.value !== undefined && (found.name !== undefined)) { headerRowIdx = r; cols = found; break; }
      }
      if (headerRowIdx === -1) return;
      if (cols.name === undefined) cols.name = 0;

      for (var i = headerRowIdx + 1; i < rows.length; i++) {
        var dr = rows[i];
        if (!dr || dr.every(function (c) { return c === '' || c === null; })) continue;
        var rawVal = cols.value !== undefined ? dr[cols.value] : null;
        var amount = typeof rawVal === 'number' ? rawVal : parseFloat(('' + rawVal).replace(/[^\d,.-]/g, '').replace('.', '').replace(',', '.'));
        if (!amount || isNaN(amount)) continue;
        var name = ('' + (dr[cols.name] || 'Item importado')).trim();
        if (!name) continue;
        var item = {
          name: name,
          amount: Math.abs(round2(amount)),
          dateRaw: cols.date !== undefined ? dr[cols.date] : '',
          parcelaRaw: cols.parcela !== undefined ? dr[cols.parcela] : '',
          sheet: sheetName
        };
        if (sheetIsIncome || amount > 0 && !sheetIsExpense && incomeHints.some(function (h) { return name.toLowerCase().indexOf(h) !== -1; })) {
          candidates.incomes.push(item);
        } else {
          candidates.expenses.push(item);
        }
      }
    });
    return candidates;
  }

  global.Finance = {
    MONTH_NAMES: MONTH_NAMES, MONTH_NAMES_SHORT: MONTH_NAMES_SHORT, DOW_SHORT: DOW_SHORT,
    formatBRL: formatBRL, formatDateBR: formatDateBR, todayISO: todayISO, todayMonthKey: todayMonthKey,
    monthKeyToLabel: monthKeyToLabel, addMonths: addMonths, monthDiff: monthDiff, compareMonthKey: compareMonthKey,
    daysInMonth: daysInMonth, monthDateISO: monthDateISO, diffDaysFromToday: diffDaysFromToday, weekdayOfFirst: weekdayOfFirst,
    isDebtActiveInMonth: isDebtActiveInMonth, installmentNumber: installmentNumber, debtEndMonth: debtEndMonth,
    overrideKey: overrideKey, getOverride: getOverride, computeStatus: computeStatus, statusLabel: statusLabel, priorityLabel: priorityLabel,
    generateExpensesForMonth: generateExpensesForMonth, generateIncomesForMonth: generateIncomesForMonth,
    salaryForMonth: salaryForMonth, extraIncomeForMonth: extraIncomeForMonth, extraIncomeTotalForMonth: extraIncomeTotalForMonth,
    computeMonthSummary: computeMonthSummary, invalidateCache: invalidateCache,
    remainingDebtTotal: remainingDebtTotal, buildProjection: buildProjection, buildBreathingTimeline: buildBreathingTimeline,
    buildInsights: buildInsights, simulateScenario: simulateScenario,
    selicMonthlyRate: selicMonthlyRate, computePocketBalance: computePocketBalance, computeInvestmentsSummary: computeInvestmentsSummary,
    exportToExcel: exportToExcel, parseWorkbookForImport: parseWorkbookForImport, round2: round2
  };

})(window);
