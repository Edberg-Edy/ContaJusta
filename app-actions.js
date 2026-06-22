/* Actions CRUD e cálculo.
   Baseado no código original do index.html.

   Nota: esta versão ainda usa localStorage para persistir,
   mantendo a migração para Firebase preparada no app-core.js.
   (Próximo passo: trocar save()/load() para Firestore e sincronizar.)
*/

(function () {
  // --- Firebase sync placeholder (será implementado depois) ---
  // O app-core.js já garante ensureFirebaseInitialized() e variáveis firebaseApp/db/auth.

  function getActiveGroup() {
    return window.getActiveGroup();
  }

  function calculate() {
    const group = getActiveGroup();
    let paid = {};
    let total = 0;

    if (!group) return { total: 0, avg: 0 };

    group.residents.forEach(r => (paid[r.name] = 0));

    group.expenses.forEach(e => {
      paid[e.paidBy] += e.value;
      total += e.value;
    });

    const avg = total / (group.residents.length || 1);

    // ajuste de acertos (REGRA CORRIGIDA)
    let adjust = {};
    group.residents.forEach(r => (adjust[r.name] = 0));

    group.settlements.forEach(s => {
      adjust[s.from] -= s.value;
      adjust[s.to] += s.value;
    });

    let final = {};
    group.residents.forEach(r => {
      final[r.name] = (paid[r.name] || 0) - (adjust[r.name] || 0);
    });

    let diff = {};
    group.residents.forEach(r => {
      diff[r.name] = final[r.name] - avg;
    });

    return { total, avg, paid, final, diff };
  }

  function startCreateGroup() {
    const html = `
      <div class="small">Nome do Grupo</div>
      <input id="modal_group_name" placeholder="Ex: Viagem de Verão" />
      <div class="small" style="margin-top:10px">Descrição (opcional)</div>
      <input id="modal_group_desc" placeholder="Objetivo do grupo..." />
    `;

    window.openModal('Criar Novo Grupo', html, () => {
      const name = document.getElementById('modal_group_name').value.trim();
      const description = document.getElementById('modal_group_desc').value.trim();
      if (!name) return;

      const newGroup = {
        id: window.generateId(),
        name,
        description,
        createdAt: new Date().toISOString(),
        residents: [],
        expenses: [],
        settlements: [],
        history: []
      };

      window.state.groups.push(newGroup);
      window.save();
      // sincroniza grupo ativo para o Firestore quando criar
      try { window.pushActiveGroupToFirestore && window.pushActiveGroupToFirestore(); } catch (e) {}
    });
  }

  function startEditGroup(idx, e) {
    e.stopPropagation();
    const g = window.state.groups[idx];

    const html = `
      <div class="small">Nome do Grupo</div>
      <input id="modal_group_name" value="${window.escapeHtml(g.name)}" />
      <div class="small" style="margin-top:10px">Descrição</div>
      <input id="modal_group_desc" value="${window.escapeHtml(g.description || '')}" />
    `;

    window.openModal('Editar Grupo', html, () => {
      g.name = document.getElementById('modal_group_name').value.trim();
      g.description = document.getElementById('modal_group_desc').value.trim();
      window.save();
    });
  }

  function removeGroup(idx, e) {
    e.stopPropagation();
    if (!confirm('Excluir este grupo e todos os seus dados permanentemente?')) return;

    if (window.state.groups[idx].id === window.state.activeGroupId) window.state.activeGroupId = null;
    window.state.groups.splice(idx, 1);
    window.save();
  }

  function selectGroup(id) {
    window.state.activeGroupId = id;

    // Sincroniza imediatamente via listener do Firestore
    try { window.subscribeToActiveGroup && window.subscribeToActiveGroup(id); } catch (e) {}

    // Resetar campos de data para o dia atual ao trocar de grupo
    setTimeout(() => {
      const ed = document.getElementById('expenseDate');
      const sd = document.getElementById('settlementDate');
      if (ed) ed.value = window.today ? window.today() : new Date().toISOString().split('T')[0];
      if (sd) sd.value = window.today ? window.today() : new Date().toISOString().split('T')[0];
    }, 10);

    window.save();
  }

  function exitGroup() {
    window.state.activeGroupId = null;
    try { window.subscribeToActiveGroup && window.subscribeToActiveGroup(null); } catch (e) {}
    window.save();
  }


  // ---------------- RESIDENTS ----------------
  function addOrSaveResident() {
    let name = '';

    if (window.editing.residentIndex !== null) {
      name = document.getElementById('modal_res_name').value.trim();
    } else {
      name = document.getElementById('name').value.trim();
    }

    processResident(name);
  }

  function processResident(name) {
    const group = getActiveGroup();
    if (!name) return;

    if (window.editing.residentIndex === null) {
      if (group.residents.some(r => r.name === name)) return;
      group.residents.push({ id: window.generateId(), name });
    } else {
      group.residents[window.editing.residentIndex] = { name };
      window.editing.residentIndex = null;
    }

    group.residents.sort((a, b) => a.name.localeCompare(b.name));
    document.getElementById('name').value = '';
    window.save();
  }

  function startEditResident(index, e) {
    if (e) e.stopPropagation();
    const group = getActiveGroup();
    window.editing.residentIndex = index;
    const r = group.residents[index];

    const html = `
      <div class="small">Nome do morador</div>
      <input id="modal_res_name" value="${window.escapeHtml(r.name)}" />
    `;

    window.openModal('Editar Morador', html, () => {
      const newName = document.getElementById('modal_res_name').value.trim();
      processResident(newName);
    });
  }

  function removeResident(index, e) {
    if (e) e.stopPropagation();
    const group = getActiveGroup();
    const r = group.residents[index];

    if (!confirm(`Remover morador "${r.name}"? Isso também remove despesas e acertos relacionados.`)) return;

    const name = r.name;
    group.residents.splice(index, 1);
    group.expenses = group.expenses.filter(ex => ex.paidBy !== name);
    group.settlements = group.settlements.filter(s => s.from !== name && s.to !== name);

    if (window.editing.residentIndex === index) {
      window.editing.residentIndex = null;
      document.getElementById('name').value = '';
    }

    window.save();
  }

  function archiveMonth() {
    const group = getActiveGroup();
    const c = calculate();

    if (c.total === 0) {
      alert('Não há gastos para arquivar neste mês.');
      return;
    }

    if (!confirm('Isso irá limpar todas as despesas e acertos atuais para iniciar um novo mês. O total será salvo no histórico. Continuar?')) return;

    const monthLabel = new Date().toLocaleDateString('pt-br', { month: 'long', year: 'numeric' });

    group.history.push({
      date: monthLabel,
      total: c.total,
      residentsCount: group.residents.length
    });

    group.expenses = [];
    group.settlements = [];
    window.save();
  }

  // ---------------- EXPENSES ----------------
  function updateExpenseSelectOptions() {
    const group = getActiveGroup();
    if (!group) return;

    const residents = group.residents || [];
    const memberOpts = residents
      .map(r => `<option value="${window.escapeHtml(r.name)}">${window.escapeHtml(r.name)}</option>`)
      .join('');

    document.getElementById('paidBy').innerHTML = `<option value="" disabled selected>Quem pagou?</option>` + memberOpts;
    document.getElementById('from').innerHTML = `<option value="" disabled selected>Quem Paga</option>` + memberOpts;
    document.getElementById('to').innerHTML = `<option value="" disabled selected>Quem Recebe</option>` + memberOpts;

    const ed = document.getElementById('expenseDate');
    const today = new Date().toISOString().split('T')[0];
    if (ed && !ed.value) ed.value = today;
  }

  function pied(x) {
    return !!x && String(x).trim() !== '';
  }

  function addOrSaveExpense() {
    const group = getActiveGroup();

    const d = document.getElementById('desc');
    const v = document.getElementById('value');
    const p = document.getElementById('paidBy');
    const dt = document.getElementById('expenseDate');

    const desc = d.value.trim();
    const value = +v.value;
    const paidBy = p.value;
    const date = dt.value || new Date().toISOString().split('T')[0];

    if (!desc || !pied(paidBy) || !Number.isFinite(value) || value <= 0) return;

    if (window.editing.expenseIndex === null) {
      group.expenses.push({ desc, value, paidBy, date });
    } else {
      group.expenses[window.editing.expenseIndex] = { desc, value, paidBy, date };
      window.editing.expenseIndex = null;
    }

    d.value = '';
    v.value = '';
    p.value = '';
    dt.value = '';
    window.save();
  }

  function startEditExpense(index) {
    const group = getActiveGroup();
    window.editing.expenseIndex = index;
    const e = group.expenses[index];

    const residents = group.residents;
    const opt = residents
      .map(
        r => `<option value="${window.escapeHtml(r.name)}" ${r.name === e.paidBy ? 'selected' : ''}>${window.escapeHtml(r.name)}</option>`
      )
      .join('');

    const html = `
      <div class="small">Descrição</div><input id="modal_exp_desc" value="${window.escapeHtml(e.desc)}" />
      <div class="small">Valor</div><input id="modal_exp_val" type="number" step="0.01" value="${e.value}" />
      <div class="small">Data</div><input id="modal_exp_date" type="date" value="${e.date || new Date().toISOString().split('T')[0]}" />
      <div class="small">Pago por</div><select id="modal_exp_who">${opt}</select>
    `;

    window.openModal('Editar Despesa', html, () => {
      processExpense(
        document.getElementById('modal_exp_desc').value.trim(),
        +document.getElementById('modal_exp_val').value,
        document.getElementById('modal_exp_who').value,
        document.getElementById('modal_exp_date').value
      );
    });
  }

  function processExpense(desc, value, paidBy, date) {
    const group = getActiveGroup();
    group.expenses[window.editing.expenseIndex] = { desc, value, paidBy, date };
    window.editing.expenseIndex = null;
    window.save();
  }

  function removeExpense(index) {
    const group = getActiveGroup();
    if (!confirm('Remover despesa?')) return;
    group.expenses.splice(index, 1);
    if (window.editing.expenseIndex === index) window.editing.expenseIndex = null;
    window.save();
  }

  // ---------------- SETTLEMENTS ----------------
  function addOrSaveSettlement() {
    let from, to, value, date;

    if (window.editing.settlementIndex !== null) {
      from = document.getElementById('modal_set_from').value;
      to = document.getElementById('modal_set_to').value;
      value = +document.getElementById('modal_set_val').value;

      const group = getActiveGroup();
      date = group.settlements[window.editing.settlementIndex].date;
    } else {
      from = document.getElementById('from').value;
      to = document.getElementById('to').value;
      value = +document.getElementById('amount').value;

      const dateEl = document.getElementById('settlementDate');
      date = (dateEl ? dateEl.value : null) || new Date().toISOString().split('T')[0];
    }

    processSettlement(from, to, value, date);
  }

  function processSettlement(from, to, value, date) {
    const group = getActiveGroup();

    if (!pied(from) || !pied(to) || !Number.isFinite(value) || value <= 0 || from === to) {
      if (from === to) alert('Um morador não pode pagar para si mesmo.');
      return;
    }

    if (window.editing.settlementIndex === null) {
      group.settlements.push({ from, to, value, date });
    } else {
      group.settlements[window.editing.settlementIndex] = { from, to, value, date };
      window.editing.settlementIndex = null;
    }

    document.getElementById('amount').value = '';
    const fEl = document.getElementById('from');
    const tEl = document.getElementById('to');
    if (fEl) fEl.value = '';
    if (tEl) tEl.value = '';

    window.save();
  }

  function startEditSettlement(index) {
    const group = getActiveGroup();
    window.editing.settlementIndex = index;
    const s = group.settlements[index];

    const optFrom = group.residents
      .map(r => `<option value="${window.escapeHtml(r.name)}" ${r.name === s.from ? 'selected' : ''}>${window.escapeHtml(r.name)}</option>`)
      .join('');

    const optTo = group.residents
      .map(r => `<option value="${window.escapeHtml(r.name)}" ${r.name === s.to ? 'selected' : ''}>${window.escapeHtml(r.name)}</option>`)
      .join('');

    const html = `
      <div class="small">Quem paga</div><select id="modal_set_from">${optFrom}</select>
      <div class="small">Quem recebe</div><select id="modal_set_to">${optTo}</select>
      <input id="modal_set_val" type="number" value="${s.value}" placeholder="Valor" />
      <div class="small">A data original (${window.formatDate(s.date)}) será mantida.</div>
    `;

    window.openModal('Editar Acerto', html, addOrSaveSettlement);
  }

  function removeSettlement(index) {
    const group = getActiveGroup();
    if (!confirm('Remover acerto?')) return;
    group.settlements.splice(index, 1);
    if (window.editing.settlementIndex === index) window.editing.settlementIndex = null;
    window.save();
  }

  // Expor para onclick
  window.startCreateGroup = startCreateGroup;
  window.startEditGroup = startEditGroup;
  window.removeGroup = removeGroup;
  window.selectGroup = selectGroup;
  window.exitGroup = exitGroup;

  window.addOrSaveResident = addOrSaveResident;
  window.startEditResident = startEditResident;
  window.removeResident = removeResident;
  window.archiveMonth = archiveMonth;

  window.updateExpenseSelectOptions = updateExpenseSelectOptions;
  window.addOrSaveExpense = addOrSaveExpense;
  window.startEditExpense = startEditExpense;
  window.removeExpense = removeExpense;

  window.addOrSaveSettlement = addOrSaveSettlement;
  window.startEditSettlement = startEditSettlement;
  window.removeSettlement = removeSettlement;

  window.calculate = calculate;
})();



