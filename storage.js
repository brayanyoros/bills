/* ============================================================
   NORTE — storage.js
   Persistência local (localStorage) + dados iniciais + backup.
   Nada aqui é enviado para fora do navegador.
   ============================================================ */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'norte_finance_state_v1';
  var SCHEMA_VERSION = 1;

  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* -------------------------------------------------------
     Dados iniciais (Setembro/2026), conforme informado.
     ------------------------------------------------------- */
  function seedState() {
    return {
      schemaVersion: SCHEMA_VERSION,
      theme: (global.matchMedia && global.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark',

      settings: {
        salaryDefault: 5000,           // a partir de 10/2026
        salaryOverrides: { '2026-09': 2500 },
        salaryDay: 5,
        extraIncomeWeeklyGoal: 200,    // por semana (~R$800/mês)
        epochMonth: '2026-09',         // primeiro mês controlado no app
        cashStartEpoch: 1000           // caixa inicial de Setembro/2026
      },

      // Despesas: parcelamentos, contas únicas e contas recorrentes sem fim (installments = null)
      debtGroups: [
        { id: 'mp', name: 'Ministério Público', category: 'Jurídico', installmentValue: 3200, installments: 1, startMonth: '2026-09', dueDay: 7, priority: 'urgent', notes: 'Pagamento único' },
        { id: 'marquin', name: 'Marquin / Notebook', category: 'Compras', installmentValue: 266, installments: 15, startMonth: '2026-09', dueDay: 10, priority: 'urgent', notes: '' },
        { id: 'silvio', name: 'Silvio TMB', category: 'Empréstimo', installmentValue: 350, installments: 5, startMonth: '2026-09', dueDay: 15, priority: 'urgent', notes: '' },
        { id: 'moto', name: 'Moto', category: 'Veículo', installmentValue: 468.96, installments: 23, startMonth: '2026-09', dueDay: 16, priority: 'urgent', notes: '23 parcelas restantes' },
        { id: 'tv', name: 'Televisão', category: 'Compras', installmentValue: 300, installments: 7, startMonth: '2026-09', dueDay: 27, priority: 'urgent', notes: '' },
        { id: 'shop15', name: 'Shop 15', category: 'Compras', installmentValue: 182, installments: 6, startMonth: '2026-09', dueDay: 27, priority: 'urgent', notes: '' },
        { id: 'internet', name: 'Internet', category: 'Casa', installmentValue: 110, installments: null, startMonth: '2026-09', dueDay: 10, priority: 'important', notes: 'Recorrente' },
        { id: 'luz', name: 'Luz', category: 'Casa', installmentValue: 80, installments: null, startMonth: '2026-09', dueDay: 20, priority: 'important', notes: 'Recorrente' }
      ],

      manualIncomes: [],

      extraIncomeEntries: [
        { id: 'ei1', monthKey: '2026-09', amount: 200, date: '2026-09-07', label: 'Semana 1' },
        { id: 'ei2', monthKey: '2026-09', amount: 200, date: '2026-09-14', label: 'Semana 2' },
        { id: 'ei3', monthKey: '2026-09', amount: 200, date: '2026-09-21', label: 'Semana 3' },
        { id: 'ei4', monthKey: '2026-09', amount: 200, date: '2026-09-28', label: 'Semana 4' }
      ],

      negotiableDebts: [],

      // status/pagamento por lançamento gerado: chave = `${debtGroupId ou manualId}_${monthKey}`
      transactionOverrides: {},

      meta: { createdAt: new Date().toISOString() }
    };
  }

  function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function load() {
    var raw = null;
    try { raw = global.localStorage.getItem(STORAGE_KEY); } catch (e) { raw = null; }
    if (!raw) {
      var fresh = seedState();
      save(fresh);
      return fresh;
    }
    try {
      var parsed = JSON.parse(raw);
      return migrate(parsed);
    } catch (e) {
      console.error('Norte: estado salvo corrompido, recriando dados iniciais.', e);
      var fresh2 = seedState();
      save(fresh2);
      return fresh2;
    }
  }

  function migrate(state) {
    if (!state.schemaVersion) state.schemaVersion = SCHEMA_VERSION;
    if (!state.settings) state.settings = seedState().settings;
    if (!state.debtGroups) state.debtGroups = [];
    if (!state.manualIncomes) state.manualIncomes = [];
    if (!state.extraIncomeEntries) state.extraIncomeEntries = [];
    if (!state.negotiableDebts) state.negotiableDebts = [];
    if (!state.transactionOverrides) state.transactionOverrides = {};
    if (!state.theme) state.theme = 'dark';
    return state;
  }

  function save(state) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error('Norte: falha ao salvar no localStorage.', e);
      return false;
    }
  }

  function clearAll() {
    try { global.localStorage.removeItem(STORAGE_KEY); return true; }
    catch (e) { return false; }
  }

  function testPersistence() {
    var k = '__norte_persist_test__';
    try {
      global.localStorage.setItem(k, '1');
      var ok = global.localStorage.getItem(k) === '1';
      global.localStorage.removeItem(k);
      return ok;
    } catch (e) {
      return false;
    }
  }

  function emptyState() {
    var todayMk = (function () {
      var d = new Date();
      return d.getFullYear() + '-' + (d.getMonth() + 1 < 10 ? '0' : '') + (d.getMonth() + 1);
    })();
    return {
      schemaVersion: SCHEMA_VERSION,
      theme: 'dark',
      settings: { salaryDefault: 0, salaryOverrides: {}, salaryDay: 5, extraIncomeWeeklyGoal: 0, epochMonth: todayMk, cashStartEpoch: 0 },
      debtGroups: [],
      manualIncomes: [],
      extraIncomeEntries: [],
      negotiableDebts: [],
      transactionOverrides: {},
      meta: { createdAt: new Date().toISOString() }
    };
  }

  function downloadBlob(content, filename, mime) {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportJSON(state) {
    var payload = deepClone(state);
    payload.exportedAt = new Date().toISOString();
    var stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(JSON.stringify(payload, null, 2), 'norte-backup-' + stamp + '.json', 'application/json');
  }

  function importJSONFile(file, onDone, onError) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== 'object' || !('debtGroups' in parsed)) {
          throw new Error('Arquivo não parece ser um backup válido do Norte.');
        }
        onDone(migrate(parsed));
      } catch (e) {
        onError && onError(e);
      }
    };
    reader.onerror = function () { onError && onError(reader.error); };
    reader.readAsText(file);
  }

  global.Storage = {
    KEY: STORAGE_KEY,
    uid: uid,
    seedState: seedState,
    emptyState: emptyState,
    load: load,
    save: save,
    clearAll: clearAll,
    testPersistence: testPersistence,
    exportJSON: exportJSON,
    importJSONFile: importJSONFile,
    downloadBlob: downloadBlob,
    deepClone: deepClone
  };

})(window);
