/* ============================================================
   NORTE — app.js
   Controlador de UI: navegação, renderização das telas,
   modais, gráficos (Chart.js) e ligação de eventos.
   ============================================================ */
(function () {
  'use strict';
  var F = window.Finance, S = window.Storage;

  var state = S.load();
  var persistenceOk = S.testPersistence();
  var currentView = 'overview';
  var monthCursor = defaultMonthKey();
  var charts = {};

  function defaultMonthKey() {
    var today = F.todayMonthKey();
    return F.compareMonthKey(today, state.settings.epochMonth) < 0 ? state.settings.epochMonth : today;
  }

  function persist() { F.invalidateCache(); S.save(state); }

  function escapeHtml(str) {
    return ('' + str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function showToast(msg) {
    var c = qs('#toastContainer');
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }

  /* ============================================================
     Tema
     ============================================================ */
  function applyTheme() {
    document.documentElement.setAttribute('data-theme', state.theme);
    var label = state.theme === 'dark' ? 'Modo escuro' : 'Modo claro';
    qs('#themeToggleLabel').textContent = label;
    qs('#themeToggleTop').textContent = state.theme === 'dark' ? '☾' : '☀';
  }
  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    applyTheme(); persist(); renderCurrentView();
  }

  /* ============================================================
     Navegação
     ============================================================ */
  var VIEW_TITLES = {
    overview: 'Visão Geral', month: 'Mês', calendar: 'Calendário', debts: 'Dívidas',
    extra: 'Renda Extra', projection: 'Projeção', reports: 'Relatórios', settings: 'Configurações'
  };

  function setView(view) {
    currentView = view;
    qsa('.view').forEach(function (v) { v.hidden = (v.id !== 'view-' + view); });
    qsa('.nav-item').forEach(function (b) { b.classList.toggle('active', b.dataset.view === view); });
    qsa('.bn-item').forEach(function (b) { b.classList.toggle('active', b.dataset.view === view); });
    qs('#topbarTitle').textContent = VIEW_TITLES[view] || '';
    closeSidebar();
    renderCurrentView();
    qs('#mainContent').scrollTop = 0;
  }

  function renderCurrentView() {
    ({
      overview: renderOverview, month: renderMonth, calendar: renderCalendar, debts: renderDebts,
      extra: renderExtra, projection: renderProjection, reports: renderReports, settings: renderSettings
    }[currentView])();
  }

  function openSidebar() { qs('#sidebar').classList.add('open'); qs('#sidebarScrim').hidden = false; qs('#sidebarScrim').setAttribute('data-open', '1'); }
  function closeSidebar() { qs('#sidebar').classList.remove('open'); qs('#sidebarScrim').hidden = true; qs('#sidebarScrim').removeAttribute('data-open'); }

  /* ============================================================
     Componentes reutilizáveis (strings de template)
     ============================================================ */
  function statusBadge(status) {
    var map = { paid: ['badge-paid', 'Pago'], pending: ['badge-pending', 'Pendente'], due_soon: ['badge-soon', 'Vence em breve'], overdue: ['badge-overdue', 'Atrasado'] };
    var m = map[status] || map.pending;
    return '<span class="badge ' + m[0] + '">' + m[1] + '</span>';
  }
  function priorityDot(p) { return '<span class="priority-dot priority-' + p + '" title="' + F.priorityLabel(p) + '"></span>'; }

  function txRow(e) {
    var isIncome = e.type === 'income';
    var day = e.dueISO ? e.dueISO.split('-')[2] : (e.dueDay || '');
    var mon = e.dueISO ? F.MONTH_NAMES_SHORT[parseInt(e.dueISO.split('-')[1], 10) - 1] : '';
    var metaParts = [];
    if (!isIncome) metaParts.push(priorityDot(e.priority) + F.priorityLabel(e.priority));
    if (e.installmentTotal) metaParts.push('Parcela ' + e.installmentCurrent + '/' + e.installmentTotal);
    else if (e.recurring) metaParts.push('Recorrente');
    if (e.category) metaParts.push(e.category);
    var actions = '';
    if (!isIncome) {
      actions = '<div class="tx-actions">' +
        '<button class="icon-btn btn-sm" data-action="' + (e.status === 'paid' ? 'unmark-paid' : 'mark-paid') + '" data-id="' + e.sourceId + '" data-month="' + e.monthKey + '" title="' + (e.status === 'paid' ? 'Desmarcar' : 'Marcar como paga') + '">' + (e.status === 'paid' ? '↺' : '✓') + '</button>' +
        '<button class="icon-btn btn-sm" data-action="edit-debt" data-id="' + e.sourceId + '" title="Editar">✎</button>' +
        '<button class="icon-btn btn-sm" data-action="delete-debt" data-id="' + e.sourceId + '" title="Excluir">🗑</button>' +
        '</div>';
    }
    return '<div class="tx-row ' + (isIncome ? 'is-income' : '') + ' ' + (e.status === 'paid' ? 'is-paid' : '') + '">' +
      '<div class="tx-day"><span class="tx-day-num">' + (day || '·') + '</span><span class="tx-day-mon">' + mon + '</span></div>' +
      '<div class="tx-info"><div class="tx-name">' + escapeHtml(e.name) + '</div><div class="tx-meta">' + metaParts.map(function (m) { return '<span>' + m + '</span>'; }).join('<span>•</span>') + '</div></div>' +
      '<div class="tx-right"><div class="tx-amount ' + (isIncome ? (e.amount < 0 ? 'neg' : 'pos') : '') + '">' + F.formatBRL(e.amount) + '</div>' + (!isIncome ? statusBadge(e.status) : '') + '</div>' +
      actions +
      '</div>';
  }

  function emptyState(icon, text) {
    return '<div class="empty-state"><div class="empty-state-ico">' + icon + '</div><p>' + text + '</p></div>';
  }

  function greeting() {
    var h = new Date().getHours();
    if (h < 12) return 'Bom dia';
    if (h < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  /* ============================================================
     VISÃO GERAL (Home)
     ============================================================ */
  function renderOverview() {
    var mk = defaultMonthKey();
    var s = F.computeMonthSummary(state, mk);
    var remainingDebt = F.remainingDebtTotal(state, mk);
    var goalMonthly = (state.settings.extraIncomeWeeklyGoal || 0) * 4;
    var extraSoFar = F.extraIncomeTotalForMonth(state, mk);
    var upcoming = s.expenses.filter(function (e) { return e.status !== 'paid'; }).slice(0, 5);
    var insights = F.buildInsights(state, mk);

    var html = '';
    html += '<div class="hero-card">' +
      '<div class="hero-greeting">' + greeting() + ' 👋</div>' +
      '<div class="hero-amount money">' + F.formatBRL(s.saldoDisponivel) + '</div>' +
      '<div class="hero-caption">Disponível para usar em ' + F.monthKeyToLabel(mk).toLowerCase() + '</div>' +
      '<div class="hero-sub-row">' +
      '<div class="hero-sub-item"><span class="hero-sub-label">Saldo em conta</span><span class="hero-sub-value money">' + F.formatBRL(s.saldoEmConta) + '</span></div>' +
      '<div class="hero-sub-item"><span class="hero-sub-label">Reservado para contas</span><span class="hero-sub-value money">' + F.formatBRL(s.expensesUnpaidPriority) + '</span></div>' +
      '</div>' +
      '<div class="commit-bar-wrap"><div class="commit-bar-labels"><span>' + Math.round(s.committedPercent) + '% da renda comprometida</span><span>' + F.formatBRL(s.recebidos) + ' recebidos</span></div>' +
      '<div class="commit-bar"><div class="commit-bar-fill" style="width:' + Math.min(100, s.committedPercent) + '%"></div></div></div>' +
      '</div>';

    html += '<div class="stat-grid">' +
      statCard('Receitas', F.formatBRL(s.recebidos)) +
      statCard('Despesas', F.formatBRL(s.comprometido)) +
      statCard('Saldo do mês', F.formatBRL(s.saldoMes)) +
      statCard('Dívidas restantes', F.formatBRL(remainingDebt)) +
      statCard('Parcelas deste mês', s.installmentCount + '') +
      statCard('Renda comprometida', Math.round(s.committedPercent) + '%') +
      '</div>';

    html += '<div class="two-col">';
    html += '<div class="card">' +
      '<div class="section-head"><span class="section-title">Próximos pagamentos</span><button class="section-link" data-action="goto" data-view="month">Ver mês</button></div>' +
      '<div class="tx-list" style="margin-top:12px">' + (upcoming.length ? upcoming.map(txRow).join('') : emptyState('🎉', 'Nenhuma conta pendente por aqui.')) + '</div>' +
      '</div>';

    html += '<div style="display:flex;flex-direction:column;gap:16px">';
    html += '<div class="card">' +
      '<span class="section-title">Resumo do mês</span>' +
      '<div class="stat-grid" style="grid-template-columns:repeat(3,1fr);margin-top:12px">' +
      statCardMini('Recebi', F.formatBRL(s.recebidos), 'pos') +
      statCardMini('Gastei', F.formatBRL(s.comprometido), 'neg') +
      statCardMini('Sobra', F.formatBRL(s.saldoMes), s.saldoMes >= 0 ? 'pos' : 'neg') +
      '</div></div>';

    html += '<div class="card">' +
      '<div class="section-head"><span class="section-title">Meta de renda extra</span><button class="section-link" data-action="goto" data-view="extra">Ver</button></div>' +
      '<div style="margin-top:12px"><div class="commit-bar-labels"><span>' + F.formatBRL(extraSoFar) + ' / ' + F.formatBRL(goalMonthly) + '</span><span>' + Math.round(goalMonthly ? (extraSoFar / goalMonthly) * 100 : 0) + '%</span></div>' +
      '<div class="progress"><div class="progress-fill" style="width:' + Math.min(100, goalMonthly ? (extraSoFar / goalMonthly) * 100 : 0) + '%;background:var(--teal)"></div></div></div>' +
      '</div>';
    html += '</div></div>';

    html += '<div class="card"><span class="section-title">Insights</span><div class="insight-list" style="margin-top:12px">' + insights.map(insightItem).join('') + '</div></div>';

    qs('#view-overview').innerHTML = html;
  }

  function statCard(label, value) {
    return '<div class="stat-card"><span class="stat-label">' + label + '</span><span class="stat-value money">' + value + '</span></div>';
  }
  function statCardMini(label, value, cls) {
    return '<div class="stat-card"><span class="stat-label">' + label + '</span><span class="stat-value small money ' + (cls || '') + '">' + value + '</span></div>';
  }
  function insightItem(ins) {
    var iconMap = { warn: ['i-warn', '⚠'], good: ['i-good', '✓'], info: ['i-info', 'ℹ'], goal: ['i-goal', '◈'] };
    var m = iconMap[ins.type] || iconMap.info;
    return '<div class="insight-item"><div class="insight-icon ' + m[0] + '">' + m[1] + '</div><div class="insight-text">' + ins.html + '</div></div>';
  }

  /* ============================================================
     MÊS
     ============================================================ */
  function renderMonth() {
    var s = F.computeMonthSummary(state, monthCursor);
    var html = '';
    html += monthSwitcher();
    html += '<div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">' +
      statCardMini('Entradas', F.formatBRL(s.recebidos), s.recebidos >= 0 ? 'pos' : 'neg') +
      statCardMini('Saídas', F.formatBRL(s.comprometido), 'neg') +
      statCardMini('Saldo do mês', F.formatBRL(s.saldoMes), s.saldoMes >= 0 ? 'pos' : 'neg') +
      '</div>';

    if (s.caixaAnterior !== 0) {
      var prevMk = F.addMonths(monthCursor, -1);
      html += '<div class="settings-row"><div class="settings-row-text"><div class="settings-row-title">Saldo trazido de ' + F.monthKeyToLabel(prevMk) + '</div><div class="settings-row-sub">Não é receita deste mês — soma direto no saldo do mês</div></div><span class="money ' + (s.caixaAnterior >= 0 ? 'pos' : 'neg') + '" style="font-weight:800;font-size:15px">' + F.formatBRL(s.caixaAnterior) + '</span></div>';
    }

    html += '<div class="card"><div class="section-head"><span class="section-title">Entradas</span><span class="section-sub money">Total: ' + F.formatBRL(s.recebidos) + '</span></div>' +
      '<div class="tx-list" style="margin-top:12px">' + s.incomes.filter(function (i) { return !i.isCarry; }).map(txRow).join('') + '</div></div>';

    html += '<div class="card"><div class="section-head"><span class="section-title">Saídas</span><span class="section-sub money">Total: ' + F.formatBRL(s.comprometido) + '</span></div>' +
      '<div class="tx-list" style="margin-top:12px">' + (s.expenses.length ? s.expenses.map(txRow).join('') : emptyState('📭', 'Nenhuma despesa cadastrada para este mês.')) + '</div></div>';

    qs('#view-month').innerHTML = html;
  }

  function monthSwitcher() {
    return '<div class="month-switch">' +
      '<button class="icon-btn" data-action="month-prev">←</button>' +
      '<span class="month-switch-label">' + F.monthKeyToLabel(monthCursor) + '</span>' +
      '<button class="icon-btn" data-action="month-next">→</button>' +
      '</div>';
  }

  /* ============================================================
     CALENDÁRIO
     ============================================================ */
  var calSelectedDay = null;
  function renderCalendar() {
    var s = F.computeMonthSummary(state, monthCursor);
    var byDay = {};
    s.expenses.forEach(function (e) {
      var d = parseInt(e.dueISO.split('-')[2], 10);
      (byDay[d] = byDay[d] || []).push(e);
    });

    var startWd = F.weekdayOfFirst(monthCursor);
    var totalDays = F.daysInMonth(monthCursor);
    var today = F.todayISO();

    var html = monthSwitcher();
    html += '<div class="card">';
    html += '<div class="cal-grid">' + F.DOW_SHORT.map(function (d) { return '<div class="cal-dow">' + d + '</div>'; }).join('');
    for (var i = 0; i < startWd; i++) html += '<div class="cal-cell empty"></div>';
    for (var day = 1; day <= totalDays; day++) {
      var iso = F.monthDateISO(monthCursor, day);
      var items = byDay[day] || [];
      var dots = items.slice(0, 4).map(function (e) {
        var cls = e.status === 'paid' ? 'positive' : e.status === 'overdue' ? 'danger' : e.status === 'due_soon' ? 'warning' : 'info';
        return '<span class="cal-dot" style="background:var(--' + cls + ')"></span>';
      }).join('');
      html += '<div class="cal-cell ' + (iso === today ? 'today' : '') + '" data-action="cal-day" data-day="' + day + '"><span class="cal-date">' + day + '</span><div class="cal-dot-row">' + dots + '</div></div>';
    }
    html += '</div></div>';

    if (calSelectedDay) {
      var dayItems = byDay[calSelectedDay] || [];
      html += '<div class="card"><span class="section-title">' + calSelectedDay + ' de ' + F.monthKeyToLabel(monthCursor).toLowerCase() + '</span>' +
        '<div class="tx-list" style="margin-top:12px">' + (dayItems.length ? dayItems.map(txRow).join('') : emptyState('🗓️', 'Nada previsto para este dia.')) + '</div></div>';
    }

    qs('#view-calendar').innerHTML = html;
  }

  /* ============================================================
     DÍVIDAS
     ============================================================ */
  function renderDebts() {
    var order = { urgent: 0, important: 1, negotiable: 2 };
    var debts = state.debtGroups.slice().sort(function (a, b) { return (order[a.priority] || 9) - (order[b.priority] || 9); });
    var timeline = F.buildBreathingTimeline(state);

    var html = '<div class="card"><div class="section-head"><span class="section-title">Parcelamentos e contas ativas</span></div><div class="tx-list" style="margin-top:12px">';
    html += debts.length ? debts.map(debtCard).join('') : emptyState('📄', 'Nenhuma dívida cadastrada.');
    html += '</div></div>';

    html += '<div class="card"><span class="section-title">Quando vou respirar?</span>';
    if (timeline.events.length) {
      html += '<div class="breath-timeline" style="margin-top:18px">' + timeline.events.map(function (e, i) {
        return '<div class="breath-node ' + (i === 0 ? 'next' : '') + '"><span class="breath-dot"></span>' +
          '<div class="breath-month">' + F.monthKeyToLabel(e.endMonth, true) + '</div>' +
          '<div class="breath-title">' + escapeHtml(e.name) + ' termina</div>' +
          '<div class="breath-freed">+ ' + F.formatBRL(e.amount) + '/mês livres a partir de ' + F.monthKeyToLabel(e.freedMonth, true) + '</div></div>';
      }).join('') + '</div>';
      html += '<div class="breath-total"><div class="breath-total-label">Renda liberada quando tudo terminar</div><div class="breath-total-value">' + F.formatBRL(timeline.totalFreed) + '/mês</div></div>';
    } else {
      html += '<div style="margin-top:12px">' + emptyState('🌬️', 'Nenhuma dívida com prazo definido no momento.') + '</div>';
    }
    html += '</div>';

    html += renderNegotiableSection();

    qs('#view-debts').innerHTML = html;
  }

  function debtCard(d) {
    var end = F.debtEndMonth(d);
    var idx = F.monthDiff(d.startMonth, monthCursor);
    var current = Math.min(Math.max(idx + 1, 1), d.installments || (idx + 1));
    var progress = d.installments ? Math.min(100, Math.max(0, (current / d.installments) * 100)) : null;
    return '<div class="tx-row" style="align-items:flex-start">' +
      '<div class="tx-day"><span class="tx-day-num">' + d.dueDay + '</span><span class="tx-day-mon">dia</span></div>' +
      '<div class="tx-info">' +
      '<div class="tx-name">' + priorityDot(d.priority) + ' ' + escapeHtml(d.name) + '</div>' +
      '<div class="tx-meta"><span>' + F.formatBRL(d.installmentValue) + (d.installments ? '/mês' : '/mês (recorrente)') + '</span>' +
      (d.installments ? '<span>•</span><span>' + (d.installments === 1 ? 'Pagamento único' : (d.installments) + ' parcelas') + '</span>' : '') +
      (end ? '<span>•</span><span>termina em ' + F.monthKeyToLabel(end, true) + '</span>' : '') + '</div>' +
      (progress !== null ? '<div class="progress" style="margin-top:8px;max-width:220px"><div class="progress-fill" style="width:' + progress + '%"></div></div>' : '') +
      '</div>' +
      '<div class="tx-actions"><button class="icon-btn btn-sm" data-action="edit-debt" data-id="' + d.id + '" title="Editar">✎</button><button class="icon-btn btn-sm" data-action="delete-debt" data-id="' + d.id + '" title="Excluir">🗑</button></div>' +
      '</div>';
  }

  function renderNegotiableSection() {
    var suggestions = ['Sicredi', 'Nubank', 'Itaú', 'PicPay', 'Infinity'];
    var html = '<div class="card"><div class="section-head"><span class="section-title">Dívidas para negociar</span><button class="btn btn-secondary btn-sm" data-action="new-negotiable">+ Adicionar</button></div>';
    if (!state.negotiableDebts.length) {
      html += '<div style="margin-top:12px">' + emptyState('💳', 'Cadastre cartões e dívidas em negociação.') + '<div class="quick-fill-row" style="justify-content:center">' + suggestions.map(function (n) { return '<button class="quick-fill-chip" data-action="new-negotiable" data-name="' + n + '">' + n + '</button>'; }).join('') + '</div></div>';
    } else {
      html += '<div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">' + state.negotiableDebts.map(negotiableCard).join('') + '</div>';
    }
    html += '</div>';
    return html;
  }

  function negotiableCard(nd) {
    var monthlyImpact = nd.installments ? nd.balance / nd.installments : 0;
    return '<div class="debt-neg-card"><div class="debt-neg-head"><span class="debt-neg-name">' + escapeHtml(nd.name) + '</span>' +
      '<div class="tx-actions"><button class="icon-btn btn-sm" data-action="edit-negotiable" data-id="' + nd.id + '">✎</button><button class="icon-btn btn-sm" data-action="delete-negotiable" data-id="' + nd.id + '">🗑</button></div></div>' +
      '<div class="debt-neg-grid">' +
      '<div class="debt-neg-stat">Saldo devedor<b class="money">' + F.formatBRL(nd.balance) + '</b></div>' +
      '<div class="debt-neg-stat">Taxa de juros<b>' + (nd.interestRate || 0) + '% a.m.</b></div>' +
      '<div class="debt-neg-stat">Impacto/mês<b class="money">' + F.formatBRL(monthlyImpact) + '</b></div>' +
      '</div></div>';
  }

  /* ============================================================
     RENDA EXTRA
     ============================================================ */
  function renderExtra() {
    var entries = F.extraIncomeForMonth(state, monthCursor).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var total = entries.reduce(function (s, e) { return s + e.amount; }, 0);
    var goal = (state.settings.extraIncomeWeeklyGoal || 0) * 4;
    var pct = goal ? Math.min(100, (total / goal) * 100) : 0;

    var html = monthSwitcher();
    html += '<div class="card">' +
      '<div class="section-head"><span class="section-title">Meta de renda extra</span><span class="section-sub">' + F.formatBRL(state.settings.extraIncomeWeeklyGoal) + '/semana</span></div>' +
      '<div class="hero-amount" style="font-size:30px;margin-top:10px">' + F.formatBRL(total) + '</div>' +
      '<div class="hero-caption">de ' + F.formatBRL(goal) + ' — meta mensal</div>' +
      '<div class="commit-bar-wrap"><div class="commit-bar"><div class="commit-bar-fill" style="width:' + pct + '%;background:var(--teal)"></div></div>' +
      '<div class="commit-bar-labels" style="margin-top:6px"><span>' + Math.round(pct) + '% da meta</span><span></span></div></div>' +
      '<button class="btn btn-primary btn-block" style="margin-top:16px" data-action="new-extra">+ Registrar entrada</button>' +
      '</div>';

    html += '<div class="card"><span class="section-title">Entradas do mês</span><div class="tx-list" style="margin-top:12px">';
    html += entries.length ? entries.map(function (e) {
      return '<div class="tx-row is-income"><div class="tx-day"><span class="tx-day-num">' + e.date.split('-')[2] + '</span><span class="tx-day-mon">' + F.MONTH_NAMES_SHORT[parseInt(e.date.split('-')[1], 10) - 1] + '</span></div>' +
        '<div class="tx-info"><div class="tx-name">' + escapeHtml(e.label || 'Renda extra') + '</div></div>' +
        '<div class="tx-right"><div class="tx-amount ' + (e.amount < 0 ? 'neg' : 'pos') + '">' + F.formatBRL(e.amount) + '</div></div>' +
        '<div class="tx-actions"><button class="icon-btn btn-sm" data-action="delete-extra" data-id="' + e.id + '" title="Excluir">🗑</button></div></div>';
    }).join('') : emptyState('◈', 'Nenhuma entrada registrada neste mês.');
    html += '</div></div>';

    qs('#view-extra').innerHTML = html;
  }

  /* ============================================================
     PROJEÇÃO
     ============================================================ */
  var simState = null;
  function renderProjection() {
    var rows = F.buildProjection(state, defaultMonthKey(), 12);

    var html = '<div class="card"><span class="section-title">Evolução do saldo</span>' +
      '<div class="chart-wrap tall" style="margin-top:14px"><canvas id="chartProjection"></canvas></div></div>';

    html += '<div class="card"><span class="section-title">Mês a mês</span>' +
      '<div style="overflow-x:auto;margin-top:10px"><table class="rep-table"><thead><tr><th>Mês</th><th>Receita</th><th>Despesas</th><th>Saldo</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td>' + r.label + '</td><td class="money">' + F.formatBRL(r.receita) + '</td><td class="money">' + F.formatBRL(r.despesa) + '</td><td class="money ' + (r.saldo >= 0 ? 'pos' : 'neg') + '">' + F.formatBRL(r.saldo) + '</td></tr>'; }).join('') +
      '</tbody></table></div></div>';

    html += renderSimulator();

    qs('#view-projection').innerHTML = html;
    drawProjectionChart(rows);
  }

  function renderSimulator() {
    var salaryOptions = [2500, 4000, 5000, 6000, 7000];
    var sal = simState ? simState.salary : state.settings.salaryDefault;
    var extra = simState ? simState.extra : (state.settings.extraIncomeWeeklyGoal || 0) * 4;
    var result = F.simulateScenario(state, defaultMonthKey(), sal, extra);

    var html = '<div class="card"><span class="section-title">E se eu ganhar...</span>' +
      '<div class="sim-value-row" style="margin-top:12px">' + salaryOptions.map(function (v) {
        return '<button class="sim-chip ' + (sal === v ? 'selected' : '') + '" data-action="sim-salary" data-value="' + v + '">' + F.formatBRL(v) + '</button>';
      }).join('') + '</div>' +
      '<div class="form-row"><label>Salário personalizado</label><input type="number" id="simSalaryCustom" value="' + sal + '" min="0" step="50"></div>' +
      '<div class="form-row"><label>Renda extra mensal estimada</label><input type="number" id="simExtraCustom" value="' + extra + '" min="0" step="50"></div>' +
      '<button class="btn btn-secondary btn-block" data-action="sim-run">Simular</button>' +
      '<div class="sim-result-grid">' +
      statCardMini('Receita simulada', F.formatBRL(result.recebidos), 'pos') +
      statCardMini('Despesas do mês', F.formatBRL(result.comprometido), 'neg') +
      statCardMini('Saldo simulado', F.formatBRL(result.saldo), result.saldo >= 0 ? 'pos' : 'neg') +
      statCardMini('Comprometido', Math.round(result.committedPercent) + '%', '') +
      '</div>' +
      '<div class="sim-banner">Esta simulação não altera seus dados reais. Toque em "Aplicar" para usar este salário a partir de agora.</div>' +
      '<button class="btn btn-primary btn-block" style="margin-top:10px" data-action="sim-apply" data-salary="' + sal + '">Aplicar este cenário</button>' +
      '</div>';
    return html;
  }

  function drawProjectionChart(rows) {
    var ctx = qs('#chartProjection');
    if (!ctx) return;
    if (charts.projection) charts.projection.destroy();
    var textColor = cssVar('text-2'), gridColor = cssVar('border-soft'), posColor = cssVar('positive');
    charts.projection = new Chart(ctx.getContext('2d'), {
      type: 'line',
      data: {
        labels: rows.map(function (r) { return r.label; }),
        datasets: [{
          label: 'Saldo projetado', data: rows.map(function (r) { return F.round2(r.saldo); }),
          borderColor: posColor, backgroundColor: hexToRgba(posColor, .12), fill: true, tension: .35, pointRadius: 3
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } },
          y: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } }
        }
      }
    });
  }

  /* ============================================================
     RELATÓRIOS
     ============================================================ */
  function renderReports() {
    var mk = defaultMonthKey();
    var s = F.computeMonthSummary(state, mk);
    var byCat = {};
    s.expenses.forEach(function (e) { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
    var catLabels = Object.keys(byCat);

    var trend = [];
    for (var i = -3; i <= 8; i++) {
      var m = F.addMonths(mk, i);
      var sm = F.computeMonthSummary(state, m);
      trend.push({ label: F.monthKeyToLabel(m, true), receita: sm.recebidos, despesa: sm.comprometido });
    }

    var html = '<div class="two-col">';
    html += '<div class="card"><span class="section-title">Receitas x Despesas</span><div class="chart-wrap" style="margin-top:14px"><canvas id="chartTrend"></canvas></div></div>';
    html += '<div class="card"><span class="section-title">Despesas por categoria — ' + F.monthKeyToLabel(mk, true) + '</span>' +
      (catLabels.length ? '<div class="chart-wrap" style="margin-top:14px"><canvas id="chartCategory"></canvas></div>' : emptyState('▥', 'Sem despesas para exibir.')) + '</div>';
    html += '</div>';

    html += '<div class="card"><span class="section-title">Insights</span><div class="insight-list" style="margin-top:12px">' + F.buildInsights(state, mk).map(insightItem).join('') + '</div></div>';

    qs('#view-reports').innerHTML = html;

    drawTrendChart(trend);
    if (catLabels.length) drawCategoryChart(byCat, catLabels);
  }

  function drawTrendChart(trend) {
    var ctx = qs('#chartTrend'); if (!ctx) return;
    if (charts.trend) charts.trend.destroy();
    var textColor = cssVar('text-2'), gridColor = cssVar('border-soft'), pos = cssVar('positive'), danger = cssVar('danger');
    charts.trend = new Chart(ctx.getContext('2d'), {
      type: 'bar',
      data: {
        labels: trend.map(function (t) { return t.label; }),
        datasets: [
          { label: 'Receitas', data: trend.map(function (t) { return F.round2(t.receita); }), backgroundColor: hexToRgba(pos, .75), borderRadius: 4 },
          { label: 'Despesas', data: trend.map(function (t) { return F.round2(t.despesa); }), backgroundColor: hexToRgba(danger, .75), borderRadius: 4 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textColor, font: { size: 11 } } } },
        scales: { x: { ticks: { color: textColor, font: { size: 9 } }, grid: { display: false } }, y: { ticks: { color: textColor, font: { size: 10 } }, grid: { color: gridColor } } }
      }
    });
  }

  function drawCategoryChart(byCat, labels) {
    var ctx = qs('#chartCategory'); if (!ctx) return;
    if (charts.category) charts.category.destroy();
    var palette = [cssVar('info'), cssVar('warning'), cssVar('danger'), cssVar('teal'), cssVar('positive'), '#8B92A0'];
    charts.category = new Chart(ctx.getContext('2d'), {
      type: 'doughnut',
      data: { labels: labels, datasets: [{ data: labels.map(function (l) { return F.round2(byCat[l]); }), backgroundColor: labels.map(function (_, i) { return palette[i % palette.length]; }), borderWidth: 0 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: cssVar('text-2'), font: { size: 10 }, boxWidth: 8 } } } }
    });
  }

  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue('--' + name).trim(); }
  function hexToRgba(hex, alpha) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(function (c) { return c + c; }).join('');
    var r = parseInt(hex.substring(0, 2), 16), g = parseInt(hex.substring(2, 4), 16), b = parseInt(hex.substring(4, 6), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
  }

  /* ============================================================
     CONFIGURAÇÕES
     ============================================================ */
  function renderSettings() {
    var epoch = state.settings.epochMonth;
    var html = '<div class="card"><div class="settings-row" style="background:' + (persistenceOk ? 'var(--positive-soft)' : 'var(--danger-soft)') + '">' +
      '<div class="settings-row-text"><div class="settings-row-title" style="color:' + (persistenceOk ? 'var(--positive)' : 'var(--danger)') + '">' + (persistenceOk ? '✓ Armazenamento local funcionando' : '⚠ Armazenamento local indisponível') + '</div>' +
      '<div class="settings-row-sub">' + (persistenceOk ? 'Seus dados estão sendo salvos neste navegador normalmente.' : 'Suas alterações não estão sendo salvas. Abra o arquivo em um navegador completo (Chrome/Firefox), fora de um visualizador de arquivos.') + '</div></div></div></div>';

    html += '<div class="card"><span class="section-title">Renda</span><div class="settings-group" style="margin-top:12px">' +
      '<div class="form-row"><label>Salário de ' + F.monthKeyToLabel(epoch).toLowerCase() + '</label><input type="number" id="setSalaryEpoch" value="' + (state.settings.salaryOverrides[epoch] || state.settings.salaryDefault) + '" min="0" step="50"></div>' +
      '<div class="form-row"><label>Salário padrão (a partir de ' + F.monthKeyToLabel(F.addMonths(epoch, 1)).toLowerCase() + ')</label><input type="number" id="setSalaryDefault" value="' + state.settings.salaryDefault + '" min="0" step="50"></div>' +
      '<div class="form-row"><label>Meta de renda extra por semana</label><input type="number" id="setExtraGoal" value="' + state.settings.extraIncomeWeeklyGoal + '" min="0" step="50"></div>' +
      '<button class="btn btn-primary" data-action="save-settings">Salvar renda</button>' +
      '</div></div>';

    html += '<div class="card"><span class="section-title">Aparência</span><div class="settings-row" style="margin-top:12px">' +
      '<div class="settings-row-text"><div class="settings-row-title">Tema</div><div class="settings-row-sub">Alterna entre modo claro e escuro</div></div>' +
      '<button class="btn btn-secondary btn-sm" data-action="toggle-theme">' + (state.theme === 'dark' ? 'Usar claro' : 'Usar escuro') + '</button></div></div>';

    html += '<div class="card"><span class="section-title">Dados</span><div class="settings-group" style="margin-top:12px">' +
      '<div class="settings-row"><div class="settings-row-text"><div class="settings-row-title">Exportar Excel</div><div class="settings-row-sub">Planilha .xlsx organizada por mês</div></div><button class="btn btn-secondary btn-sm" data-action="export-excel">Exportar</button></div>' +
      '<div class="settings-row"><div class="settings-row-text"><div class="settings-row-title">Exportar backup (JSON)</div><div class="settings-row-sub">Arquivo para restaurar depois</div></div><button class="btn btn-secondary btn-sm" data-action="export-json">Exportar</button></div>' +
      '<div class="settings-row"><div class="settings-row-text"><div class="settings-row-title">Importar planilha Excel</div><div class="settings-row-sub">.xlsx — mostra uma prévia antes de salvar</div></div><label class="btn btn-secondary btn-sm" style="cursor:pointer">Importar<input type="file" id="importExcelInput" accept=".xlsx,.xls" style="display:none"></label></div>' +
      '<div class="settings-row"><div class="settings-row-text"><div class="settings-row-title">Restaurar backup (JSON)</div><div class="settings-row-sub">Substitui os dados atuais</div></div><label class="btn btn-secondary btn-sm" style="cursor:pointer">Restaurar<input type="file" id="importJsonInput" accept=".json" style="display:none"></label></div>' +
      '</div></div>';

    html += '<div class="card danger-zone"><div class="settings-row" style="background:transparent"><div class="settings-row-text"><div class="settings-row-title">Apagar todos os dados</div><div class="settings-row-sub">Ação permanente — volta aos dados iniciais</div></div><button class="btn btn-danger btn-sm" data-action="wipe-data">Apagar</button></div></div>';

    qs('#view-settings').innerHTML = html;
  }

  /* ============================================================
     MODAL — Novo lançamento (sheet + formulários)
     ============================================================ */
  function openSheet() {
    qs('#sheetRoot').innerHTML = '<div class="sheet-grabber"></div>' +
      sheetOption('income', '<svg viewBox="0 0 384 512" aria-hidden="true" class="ico-pos"><path d="M214.6 41.4c-12.5-12.5-32.8-12.5-45.3 0l-160 160c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L160 141.3V448c0 17.7 14.3 32 32 32s32-14.3 32-32V141.3L329.4 246.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-160-160z"/></svg>', 'Receita', 'Salário, freelance, bônus...') +
      sheetOption('expense', '<svg viewBox="0 0 384 512" aria-hidden="true" class="ico-neg"><path d="M169.4 470.6c12.5 12.5 32.8 12.5 45.3 0l160-160c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L224 370.7V64c0-17.7-14.3-32-32-32s-32 14.3-32 32V370.7L54.6 265.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l160 160z"/></svg>', 'Despesa', 'Conta única, sem parcelas') +
      sheetOption('installment', '📆', 'Parcela', 'Compra parcelada') +
      sheetOption('negotiable', '💳', 'Dívida', 'Cartão ou dívida a negociar');
    qs('#sheetOverlay').hidden = false;
  }
  function sheetOption(action, ico, title, sub) {
    return '<button class="sheet-option" data-action="sheet-' + action + '"><span class="sheet-option-ico">' + ico + '</span><span><div>' + title + '</div><div style="font-size:11.5px;color:var(--text-3);font-weight:600">' + sub + '</div></span></button>';
  }
  function closeSheet() { qs('#sheetOverlay').hidden = true; }

  function openModal(html) { qs('#modalRoot').innerHTML = html; qs('#modalOverlay').hidden = false; }
  function closeModal() { qs('#modalOverlay').hidden = true; }

  function priorityChips(selected) {
    return '<div class="priority-row" id="priorityChips">' +
      ['urgent', 'important', 'negotiable'].map(function (p) {
        var icon = p === 'urgent' ? '🔴' : p === 'important' ? '🟡' : '🟢';
        return '<button type="button" class="priority-chip ' + (p === selected ? 'selected' : '') + '" data-action="select-priority" data-p="' + p + '">' + icon + ' ' + F.priorityLabel(p) + '</button>';
      }).join('') + '</div>';
  }

  function categoryDatalist() {
    var cats = ['Jurídico', 'Compras', 'Empréstimo', 'Veículo', 'Casa', 'Alimentação', 'Saúde', 'Lazer', 'Trabalho', 'Outros'];
    return '<datalist id="categoryOptions">' + cats.map(function (c) { return '<option value="' + c + '">'; }).join('') + '</datalist>';
  }

  function formIncome(existing) {
    var e = existing || {};
    var d = e.date || F.monthDateISO(monthCursor, new Date().getDate());
    openModal(
      '<div class="modal-head"><span class="modal-title">' + (existing ? 'Editar receita' : 'Nova receita') + '</span><button class="icon-btn" data-action="close-modal">✕</button></div>' +
      '<form id="formIncome" data-id="' + (e.id || '') + '">' +
      '<div class="form-row"><label>Nome</label><input required name="name" value="' + escapeHtml(e.name || '') + '" placeholder="Ex: Freelance, bônus..."></div>' +
      '<div class="form-row-2"><div><label>Valor (R$)</label><input required type="number" step="0.01" min="0.01" name="amount" value="' + (e.amount || '') + '"></div>' +
      '<div><label>Data</label><input required type="date" name="date" value="' + d + '"></div></div>' +
      '<div class="form-row"><label>Categoria</label><input name="category" list="categoryOptions" value="' + escapeHtml(e.category || 'Outros') + '">' + categoryDatalist() + '</div>' +
      '<div class="form-actions"><button type="submit" class="btn btn-primary btn-block">Salvar</button></div>' +
      '</form>'
    );
  }

  function formExpense(installmentMode, existing) {
    var e = existing || {};
    var monthVal = e.startMonth || monthCursor;
    openModal(
      '<div class="modal-head"><span class="modal-title">' + (existing ? 'Editar' : (installmentMode ? 'Nova parcela' : 'Nova despesa')) + '</span><button class="icon-btn" data-action="close-modal">✕</button></div>' +
      '<form id="formExpense" data-id="' + (e.id || '') + '" data-installment-mode="' + (installmentMode ? '1' : '0') + '">' +
      '<div class="form-row"><label>Nome</label><input required name="name" value="' + escapeHtml(e.name || '') + '" placeholder="Ex: Conta de luz, Televisão..."></div>' +
      '<div class="form-row-2"><div><label>Valor da ' + (installmentMode ? 'parcela' : 'conta') + ' (R$)</label><input required type="number" step="0.01" min="0.01" name="amount" value="' + (e.installmentValue || '') + '"></div>' +
      '<div><label>Dia do vencimento</label><input required type="number" min="1" max="31" name="dueDay" value="' + (e.dueDay || '') + '"></div></div>' +
      '<div class="form-row-2"><div><label>Mês de início</label><input required type="month" name="startMonth" value="' + monthVal + '"></div>' +
      (installmentMode ? '<div><label>Número de parcelas</label><input required type="number" min="1" name="installments" value="' + (e.installments || 2) + '"></div>' : '<div><label>Recorrente (sem fim)</label><select name="recurringFlag"><option value="0" ' + (e.installments === 1 || !existing ? 'selected' : '') + '>Não</option><option value="1" ' + (e.installments === null ? 'selected' : '') + '>Sim, todo mês</option></select></div>') +
      '</div>' +
      '<div class="form-row"><label>Categoria</label><input name="category" list="categoryOptions" value="' + escapeHtml(e.category || '') + '">' + categoryDatalist() + '</div>' +
      '<div class="form-row"><label>Prioridade</label>' + priorityChips(e.priority || 'important') + '</div>' +
      '<div class="form-actions"><button type="submit" class="btn btn-primary btn-block">Salvar</button></div>' +
      '</form>'
    );
  }

  function formNegotiable(existing) {
    var e = existing || {};
    openModal(
      '<div class="modal-head"><span class="modal-title">' + (existing ? 'Editar dívida' : 'Nova dívida para negociar') + '</span><button class="icon-btn" data-action="close-modal">✕</button></div>' +
      '<form id="formNegotiable" data-id="' + (e.id || '') + '">' +
      '<div class="form-row"><label>Nome / instituição</label><input required name="name" value="' + escapeHtml(e.name || '') + '" placeholder="Ex: Nubank, Sicredi..."></div>' +
      '<div class="form-row-2"><div><label>Valor original (R$)</label><input type="number" step="0.01" min="0" name="originalValue" value="' + (e.originalValue || '') + '"></div>' +
      '<div><label>Saldo devedor atual (R$)</label><input required type="number" step="0.01" min="0" name="balance" value="' + (e.balance || '') + '"></div></div>' +
      '<div class="form-row-2"><div><label>Parcelas negociadas</label><input type="number" min="1" name="installments" value="' + (e.installments || '') + '"></div>' +
      '<div><label>Taxa de juros (% a.m.)</label><input type="number" step="0.01" min="0" name="interestRate" value="' + (e.interestRate || '') + '"></div></div>' +
      '<div class="form-row"><label>Primeiro vencimento</label><input type="date" name="firstDueDate" value="' + (e.firstDueDate || '') + '"></div>' +
      '<div class="form-actions"><button type="submit" class="btn btn-primary btn-block">Salvar</button></div>' +
      '</form>'
    );
  }

  function formExtra() {
    openModal(
      '<div class="modal-head"><span class="modal-title">Registrar renda extra</span><button class="icon-btn" data-action="close-modal">✕</button></div>' +
      '<form id="formExtra">' +
      '<div class="form-row"><label>Descrição</label><input name="label" placeholder="Ex: Semana 1, corridas do sábado..."></div>' +
      '<div class="form-row-2"><div><label>Valor (R$)</label><input required type="number" step="0.01" min="0.01" name="amount"></div>' +
      '<div><label>Data</label><input required type="date" name="date" value="' + F.monthDateISO(monthCursor, new Date().getDate()) + '"></div></div>' +
      '<div class="form-actions"><button type="submit" class="btn btn-primary btn-block">Salvar</button></div>' +
      '</form>'
    );
  }

  function formImportPreview(candidates) {
    var totalI = candidates.incomes.length, totalE = candidates.expenses.length;
    var sample = candidates.incomes.slice(0, 4).map(function (i) { return { n: i.name, v: i.amount, t: 'Receita' }; })
      .concat(candidates.expenses.slice(0, 6).map(function (e) { return { n: e.name, v: e.amount, t: 'Despesa' }; }));
    openModal(
      '<div class="modal-head"><span class="modal-title">Confirmar importação</span><button class="icon-btn" data-action="close-modal">✕</button></div>' +
      '<p style="font-size:13px;color:var(--text-2);margin-bottom:12px">Encontramos <b>' + totalI + ' receita(s)</b> e <b>' + totalE + ' despesa(s)</b>. Elas serão adicionadas aos seus lançamentos manuais (você pode editar cada uma depois).</p>' +
      '<div style="max-height:240px;overflow-y:auto;display:flex;flex-direction:column;gap:6px">' +
      sample.map(function (r) { return '<div class="settings-row" style="padding:9px 12px"><span style="font-size:12.5px;font-weight:700">' + escapeHtml(r.n) + '</span><span class="money" style="font-size:12.5px">' + F.formatBRL(r.v) + '</span></div>'; }).join('') +
      '</div>' +
      '<div class="form-actions">' +
      '<button class="btn btn-secondary btn-block" data-action="close-modal">Cancelar</button>' +
      '<button class="btn btn-primary btn-block" id="confirmImportBtn">Confirmar importação</button>' +
      '</div>'
    );
    qs('#confirmImportBtn').onclick = function () { commitImport(candidates); };
  }

  /* ============================================================
     Ações de mutação de estado
     ============================================================ */
  function markPaid(id, monthKey, paid) {
    var key = F.overrideKey(id, monthKey);
    if (paid) state.transactionOverrides[key] = { status: 'paid', paidDate: F.todayISO() };
    else delete state.transactionOverrides[key];
    persist(); renderCurrentView(); showToast(paid ? 'Marcado como pago' : 'Marcação removida');
  }

  function deleteDebt(id) {
    if (!confirm('Excluir este lançamento? Essa ação não pode ser desfeita.')) return;
    state.debtGroups = state.debtGroups.filter(function (d) { return d.id !== id; });
    Object.keys(state.transactionOverrides).forEach(function (k) { if (k.indexOf(id + '_') === 0) delete state.transactionOverrides[k]; });
    persist(); renderCurrentView(); showToast('Excluído');
  }
  function deleteExtra(id) {
    state.extraIncomeEntries = state.extraIncomeEntries.filter(function (e) { return e.id !== id; });
    persist(); renderCurrentView(); showToast('Excluído');
  }
  function deleteNegotiable(id) {
    if (!confirm('Excluir esta dívida?')) return;
    state.negotiableDebts = state.negotiableDebts.filter(function (d) { return d.id !== id; });
    persist(); renderCurrentView(); showToast('Excluído');
  }

  function commitImport(candidates) {
    candidates.incomes.forEach(function (i) {
      var mk = guessMonthFromRaw(i.dateRaw) || monthCursor;
      state.manualIncomes.push({ id: S.uid('inc'), name: i.name, amount: i.amount, date: F.monthDateISO(mk, 1), monthKey: mk, category: 'Importado' });
    });
    candidates.expenses.forEach(function (e) {
      var mk = guessMonthFromRaw(e.dateRaw) || monthCursor;
      var day = guessDayFromRaw(e.dateRaw) || 10;
      var installments = 1, startMonth = mk;
      var pm = ('' + e.parcelaRaw).match(/(\d+)\s*\/\s*(\d+)/);
      if (pm) { var cur = parseInt(pm[1], 10), tot = parseInt(pm[2], 10); installments = tot; startMonth = F.addMonths(mk, -(cur - 1)); }
      state.debtGroups.push({ id: S.uid('imp'), name: e.name, category: 'Importado', installmentValue: e.amount, installments: installments, startMonth: startMonth, dueDay: day, priority: 'important', notes: 'Importado de planilha' });
    });
    persist(); closeModal(); renderCurrentView(); showToast('Importação concluída');
  }
  function guessMonthFromRaw(raw) {
    if (!raw) return null;
    if (raw instanceof Date) return raw.getFullYear() + '-' + (raw.getMonth() + 1 < 10 ? '0' : '') + (raw.getMonth() + 1);
    var s = ('' + raw);
    var m = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (m) { var yy = m[3].length === 2 ? '20' + m[3] : m[3]; return yy + '-' + (m[2].length < 2 ? '0' + m[2] : m[2]); }
    m = s.match(/(\d{4})-(\d{2})/);
    if (m) return m[1] + '-' + m[2];
    return null;
  }
  function guessDayFromRaw(raw) {
    var s = ('' + raw);
    var m = s.match(/(\d{1,2})[\/\-]/);
    return m ? parseInt(m[1], 10) : null;
  }

  /* ============================================================
     Delegação de eventos
     ============================================================ */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-action]');
    if (!t) {
      if (e.target === qs('#modalOverlay')) closeModal();
      if (e.target === qs('#sheetOverlay')) closeSheet();
      return;
    }
    var a = t.dataset.action;

    if (a === 'goto') { setView(t.dataset.view); return; }
    if (a === 'close-modal') { closeModal(); return; }
    if (a === 'month-prev') { monthCursor = F.addMonths(monthCursor, -1); calSelectedDay = null; renderCurrentView(); return; }
    if (a === 'month-next') { monthCursor = F.addMonths(monthCursor, 1); calSelectedDay = null; renderCurrentView(); return; }
    if (a === 'cal-day') { calSelectedDay = parseInt(t.dataset.day, 10); renderCalendar(); return; }
    if (a === 'toggle-theme') { toggleTheme(); return; }

    if (a === 'mark-paid') { markPaid(t.dataset.id, t.dataset.month, true); return; }
    if (a === 'unmark-paid') { markPaid(t.dataset.id, t.dataset.month, false); return; }
    if (a === 'delete-debt') { deleteDebt(t.dataset.id); return; }
    if (a === 'delete-extra') { deleteExtra(t.dataset.id); return; }
    if (a === 'delete-negotiable') { deleteNegotiable(t.dataset.id); return; }

    if (a === 'edit-debt') {
      var d = state.debtGroups.find(function (x) { return x.id === t.dataset.id; });
      if (d) formExpense(!!(d.installments && d.installments > 1), d);
      return;
    }
    if (a === 'edit-negotiable') {
      var nd = state.negotiableDebts.find(function (x) { return x.id === t.dataset.id; });
      if (nd) formNegotiable(nd);
      return;
    }

    if (a === 'sheet-income') { closeSheet(); formIncome(); return; }
    if (a === 'sheet-expense') { closeSheet(); formExpense(false); return; }
    if (a === 'sheet-installment') { closeSheet(); formExpense(true); return; }
    if (a === 'sheet-negotiable') { closeSheet(); formNegotiable(); return; }
    if (a === 'new-negotiable') { formNegotiable(t.dataset.name ? { name: t.dataset.name } : null); return; }
    if (a === 'new-extra') { formExtra(); return; }

    if (a === 'select-priority') {
      qsa('.priority-chip', t.parentElement).forEach(function (c) { c.classList.remove('selected'); });
      t.classList.add('selected');
      return;
    }

    if (a === 'sim-salary') {
      simState = simState || {};
      simState.salary = parseFloat(t.dataset.value);
      simState.extra = simState.extra || (state.settings.extraIncomeWeeklyGoal || 0) * 4;
      renderProjection();
      return;
    }
    if (a === 'sim-run') {
      simState = { salary: parseFloat(qs('#simSalaryCustom').value) || 0, extra: parseFloat(qs('#simExtraCustom').value) || 0 };
      renderProjection();
      return;
    }
    if (a === 'sim-apply') {
      if (!confirm('Aplicar este salário simulado como seu novo padrão a partir de agora?')) return;
      state.settings.salaryDefault = simState ? simState.salary : parseFloat(t.dataset.salary);
      persist(); renderCurrentView(); showToast('Cenário aplicado');
      return;
    }

    if (a === 'save-settings') {
      var epoch = state.settings.epochMonth;
      state.settings.salaryOverrides[epoch] = parseFloat(qs('#setSalaryEpoch').value) || 0;
      state.settings.salaryDefault = parseFloat(qs('#setSalaryDefault').value) || 0;
      state.settings.extraIncomeWeeklyGoal = parseFloat(qs('#setExtraGoal').value) || 0;
      persist(); renderCurrentView(); showToast('Renda atualizada');
      return;
    }
    if (a === 'export-excel') {
      try { F.exportToExcel(state, 24); showToast('Excel exportado'); }
      catch (err) { showToast('Erro ao exportar: ' + err.message); }
      return;
    }
    if (a === 'export-json') { S.exportJSON(state); showToast('Backup exportado'); return; }
    if (a === 'wipe-data') {
      if (!confirm('Isso vai apagar TODOS os seus dados (fica tudo zerado — sem os dados de exemplo). Essa ação não pode ser desfeita. Confirma?')) return;
      S.clearAll();
      state = S.emptyState();
      S.save(state);
      F.invalidateCache();
      monthCursor = defaultMonthKey();
      applyTheme(); renderCurrentView(); showToast('Todos os dados foram apagados');
      return;
    }
  });

  document.addEventListener('submit', function (e) {
    var form = e.target;
    e.preventDefault();
    var fd = new FormData(form);

    if (form.id === 'formIncome') {
      var id = form.dataset.id;
      var date = fd.get('date');
      var payload = { name: fd.get('name').trim(), amount: parseFloat(fd.get('amount')), date: date, monthKey: date.slice(0, 7), category: fd.get('category') || 'Outros' };
      if (!payload.name || !(payload.amount > 0)) { showToast('Preencha nome e valor.'); return; }
      if (id) { var idx = state.manualIncomes.findIndex(function (x) { return x.id === id; }); state.manualIncomes[idx] = Object.assign({ id: id }, payload); }
      else { payload.id = S.uid('inc'); state.manualIncomes.push(payload); }
      persist(); closeModal(); renderCurrentView(); showToast('Receita salva');
      return;
    }

    if (form.id === 'formExpense') {
      var eid = form.dataset.id;
      var isInstallmentMode = form.dataset.installmentMode === '1';
      var priEl = qs('.priority-chip.selected', form);
      var priority = priEl ? priEl.dataset.p : 'important';
      var installments = isInstallmentMode ? (parseInt(fd.get('installments'), 10) || 1) : (fd.get('recurringFlag') === '1' ? null : 1);
      var payload = {
        name: fd.get('name').trim(), category: fd.get('category') || 'Outros',
        installmentValue: parseFloat(fd.get('amount')), dueDay: Math.min(31, Math.max(1, parseInt(fd.get('dueDay'), 10) || 1)),
        startMonth: fd.get('startMonth'), installments: installments, priority: priority, notes: ''
      };
      if (!payload.name || !(payload.installmentValue > 0)) { showToast('Preencha nome e valor.'); return; }
      if (eid) { var i2 = state.debtGroups.findIndex(function (x) { return x.id === eid; }); state.debtGroups[i2] = Object.assign({ id: eid }, payload); }
      else { payload.id = S.uid('exp'); state.debtGroups.push(payload); }
      persist(); closeModal(); renderCurrentView(); showToast('Despesa salva');
      return;
    }

    if (form.id === 'formNegotiable') {
      var nid = form.dataset.id;
      var payload3 = {
        name: fd.get('name').trim(), originalValue: parseFloat(fd.get('originalValue')) || 0,
        balance: parseFloat(fd.get('balance')), installments: parseInt(fd.get('installments'), 10) || null,
        interestRate: parseFloat(fd.get('interestRate')) || 0, firstDueDate: fd.get('firstDueDate') || ''
      };
      if (!payload3.name || !(payload3.balance >= 0)) { showToast('Preencha nome e saldo devedor.'); return; }
      if (nid) { var i3 = state.negotiableDebts.findIndex(function (x) { return x.id === nid; }); state.negotiableDebts[i3] = Object.assign({ id: nid }, payload3); }
      else { payload3.id = S.uid('neg'); state.negotiableDebts.push(payload3); }
      persist(); closeModal(); renderCurrentView(); showToast('Dívida salva');
      return;
    }

    if (form.id === 'formExtra') {
      var date2 = fd.get('date');
      var payload4 = { id: S.uid('ei'), label: fd.get('label') || 'Renda extra', amount: parseFloat(fd.get('amount')), date: date2, monthKey: date2.slice(0, 7) };
      if (!(payload4.amount > 0)) { showToast('Informe um valor válido.'); return; }
      state.extraIncomeEntries.push(payload4);
      persist(); closeModal(); renderCurrentView(); showToast('Renda extra registrada');
      return;
    }
  });

  /* ============================================================
     Import de arquivos (Excel / JSON)
     ============================================================ */
  document.addEventListener('change', function (e) {
    if (e.target.id === 'importExcelInput') {
      var file = e.target.files[0]; if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var wb = XLSX.read(new Uint8Array(reader.result), { type: 'array', cellDates: true });
          var candidates = F.parseWorkbookForImport(wb);
          if (!candidates.incomes.length && !candidates.expenses.length) { showToast('Não conseguimos identificar dados na planilha.'); return; }
          formImportPreview(candidates);
        } catch (err) { showToast('Erro ao ler o arquivo: ' + err.message); }
      };
      reader.readAsArrayBuffer(file);
      e.target.value = '';
    }
    if (e.target.id === 'importJsonInput') {
      var jfile = e.target.files[0]; if (!jfile) return;
      if (!confirm('Isso vai substituir seus dados atuais pelo conteúdo do backup. Continuar?')) { e.target.value = ''; return; }
      S.importJSONFile(jfile, function (newState) {
        state = newState; S.save(state); F.invalidateCache();
        monthCursor = defaultMonthKey(); applyTheme(); renderCurrentView(); showToast('Backup restaurado');
      }, function (err) { showToast('Arquivo inválido: ' + err.message); });
      e.target.value = '';
    }
  });

  /* ============================================================
     Init
     ============================================================ */
  qs('#menuBtn').addEventListener('click', openSidebar);
  qs('#sidebarCloseBtn').addEventListener('click', closeSidebar);
  qs('#sidebarScrim').addEventListener('click', closeSidebar);
  qs('#themeToggle').addEventListener('click', toggleTheme);
  qs('#themeToggleTop').addEventListener('click', toggleTheme);
  qs('#newLaunchBtn').addEventListener('click', openSheet);
  qs('#newLaunchBtnMobile').addEventListener('click', openSheet);
  qsa('.nav-item, .bn-item').forEach(function (b) { b.addEventListener('click', function () { setView(b.dataset.view); }); });

  applyTheme();
  qs('#persistenceBanner').hidden = persistenceOk;
  setView('overview');

})();
