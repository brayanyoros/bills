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

  function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function load() {
    var raw = null;
    try { raw = global.localStorage.getItem(STORAGE_KEY); } catch (e) { raw = null; }
    if (!raw) {
      var fresh = emptyState();
      save(fresh);
      return fresh;
    }
    try {
      var parsed = JSON.parse(raw);
      return migrate(parsed);
    } catch (e) {
      console.error('Bills: estado salvo corrompido, recriando dados iniciais.', e);
      var fresh2 = emptyState();
      save(fresh2);
      return fresh2;
    }
  }

  function migrate(state) {
    if (!state.schemaVersion) state.schemaVersion = SCHEMA_VERSION;
    if (!state.settings) state.settings = emptyState().settings;
    if (state.settings.selicRateAnnual === undefined) state.settings.selicRateAnnual = 0;
    if (state.settings.userName === undefined) state.settings.userName = '';
    if (!state.debtGroups) state.debtGroups = [];
    if (!state.manualIncomes) state.manualIncomes = [];
    if (!state.extraIncomeEntries) state.extraIncomeEntries = [];
    if (!state.negotiableDebts) state.negotiableDebts = [];
    if (!state.investmentPockets) state.investmentPockets = [];
    if (!state.transactionOverrides) state.transactionOverrides = {};
    if (!state.theme) state.theme = 'dark';
    return state;
  }

  function save(state) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error('Bills: falha ao salvar no localStorage.', e);
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
      settings: { userName: '', salaryDefault: 0, salaryOverrides: {}, salaryDay: 5, extraIncomeWeeklyGoal: 0, epochMonth: todayMk, cashStartEpoch: 0, selicRateAnnual: 0 },
      debtGroups: [],
      manualIncomes: [],
      extraIncomeEntries: [],
      negotiableDebts: [],
      investmentPockets: [],
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
    downloadBlob(JSON.stringify(payload, null, 2), 'bills-backup-' + stamp + '.json', 'application/json');
  }

  function importJSONFile(file, onDone, onError) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(reader.result);
        if (!parsed || typeof parsed !== 'object' || !('debtGroups' in parsed)) {
          throw new Error('Arquivo não parece ser um backup válido do Bills.');
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
    seedState: emptyState,
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
