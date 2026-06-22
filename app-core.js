/* Core: Estado, helpers, modal e renderização base.
   Ações CRUD (criar/editar/remover) ficam no app-actions.js.
*/

// --- Firebase (fase de migração) ---
// Ainda não ligado ao CRUD; será utilizado para sincronização futura.
// Para já, mantém fallback localStorage até conectar as operações.

const firebaseConfig = {
  apiKey: "AIzaSyAdg8M_9jTKsSIFNAoTfxst0liJDBNJ3xc",
  authDomain: "contajusta-app.firebaseapp.com",
  projectId: "contajusta-app",
  storageBucket: "contajusta-app.firebasestorage.app",
  messagingSenderId: "568307009980",
  appId: "1:568307009980:web:4ceabcbe61ae73fc3643b9"
};


let currentUser = null;
let firebaseApp = null;
let db = null;
let auth = null;

function ensureFirebaseInitialized() {
  // carrega apenas se a lib existir (index.html pode ou não incluir os SDKs)
  if (firebaseApp) return;
  if (typeof firebase === 'undefined') return;

  try {
    // Compat para SDK modular vs namespaced (evita break dependendo do que você incluir)
    if (firebase.apps && firebase.apps.length) {
      firebaseApp = firebase.apps[0];
    } else {
      firebaseApp = firebase.initializeApp(firebaseConfig);
    }

    if (firebaseApp) {
      // Firestore
      if (firebaseApp.firestore) db = firebaseApp.firestore();
      // Auth
      if (firebase.auth) auth = firebase.auth();
    }
  } catch (e) {
    console.error('Firebase init error:', e);
  }
}

// --- STATE MANAGEMENT (fallback localStorage) ---
let state = JSON.parse(localStorage.getItem('contajusta_state')) || {
  groups: [],
  activeGroupId: null
};

let editing = { residentIndex: null, expenseIndex: null, settlementIndex: null };

function getActiveGroup() {
  return state.groups.find(g => g.id === state.activeGroupId);
}

let isApplyingRemoteSnapshot = false;
let savePending = false;
let lastSavedHash = null;

async function save() {
  // Fallback localStorage (para não perder nada enquanto Firestore não carrega)
  localStorage.setItem('contajusta_state', JSON.stringify(state));
  render();

  // Sincronização Firestore: debounce simples para evitar tempestade de writes
  if (savePending) return;
  savePending = true;

  // hash leve para evitar writes iguais
  try {
    const group = getActiveGroup();
    const gid = state.activeGroupId;
    if (!gid || !group) return;

    const fs = requireFirebaseFirestore();
    if (!fs) return;

    const hash = JSON.stringify({
      name: group.name,
      description: group.description,
      createdAt: group.createdAt,
      residents: group.residents,
      expenses: group.expenses,
      settlements: group.settlements,
      history: group.history
    });

    if (hash === lastSavedHash) return;
    lastSavedHash = hash;

    await fs.collection('groups').doc(gid).set(
      {
        name: group.name,
        description: group.description || '',
        createdAt: group.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        residents: group.residents || [],
        expenses: group.expenses || [],
        settlements: group.settlements || [],
        history: group.history || []
      },
      { merge: true }
    );
  } catch (e) {
    console.error('Firestore save error:', e);
  } finally {
    // dá um tick pra permitir novos edits
    setTimeout(() => { savePending = false; }, 250);
  }
}


// ---- Firestore: sincronização (passo a passo) ----
// Nesta etapa vamos fazer a leitura/escrita simples no formato atual de dados.
// Isso mantém o visual e as regras; a diferença é que o state passa a ser persistido no Firestore.

function getCurrentGroupId() {
  return state.activeGroupId;
}

function requireFirebaseFirestore() {
  // espera libs carregadas
  if (!firebaseApp) ensureFirebaseInitialized();
  if (typeof firebase === 'undefined') return null;
  if (!firebase.firestore) return null;
  return firebaseApp.firestore ? firebaseApp.firestore() : firebase.firestore();
}

async function loadStateFromFirestore() {
  // Interface: lê grupos e seleciona grupo ativo.
  // Mantém compat: se não existir no Firestore, não destrói localStorage.
  const gid = state.activeGroupId;
  if (!gid) return;

  const fs = requireFirebaseFirestore();
  if (!fs) return;

  // Documento único por grupo (durável e evita arrays gigantes)
  // groups/{groupId} -> { name, description, createdAt, updatedAt }
  // subcoleções: residents/expenses/settlements/history (vamos mapear mais adiante)
  // Nesta fase, como o CRUD ainda opera em arrays locais, vamos gravar/ler um snapshot compacto.

  try {
    const snap = await fs.collection('groups').doc(gid).get();
    if (!snap.exists) return;

    const data = snap.data() || {};

    // Só hidrata se estiver com o formato esperado.
    // Mantém o app funcionando enquanto migramos o modelo.
    // (Após estabilizar, trocamos para subcoleções de verdade.)
    const hydratedGroup = {
      id: gid,
      name: data.name || 'Grupo',
      description: data.description || '',
      createdAt: data.createdAt || new Date().toISOString(),
      residents: data.residents || [],
      expenses: data.expenses || [],
      settlements: data.settlements || [],
      history: data.history || []
    };

    // Atualiza state.groups mantendo as demais
    const idx = state.groups.findIndex(g => g.id === gid);
    if (idx >= 0) state.groups[idx] = hydratedGroup;
    else state.groups.push(hydratedGroup);

    render();
  } catch (e) {
    console.error('loadStateFromFirestore error:', e);
  }
}

async function pushActiveGroupToFirestore() {
  const gid = getCurrentGroupId();
  if (!gid) return;

  const fs = requireFirebaseFirestore();
  if (!fs) return;

  const group = getActiveGroup();
  if (!group) return;

  // Persistência compacta temporária (para não quebrar regra visual).
  // Depois convertemos para subcoleções por coleção.
  try {
    await fs.collection('groups').doc(gid).set(
      {
        name: group.name,
        description: group.description || '',
        createdAt: group.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        residents: group.residents || [],
        expenses: group.expenses || [],
        settlements: group.settlements || [],
        history: group.history || []
      },
      { merge: true }
    );
  } catch (e) {
    console.error('pushActiveGroupToFirestore error:', e);
  }
}


function getCollectionPathsForGroup(groupId) {
  // Estrutura escalável: grupos/{groupId} e subcoleções
  // (nomeações em minúsculo para compat/boas práticas)
  return {
    groupDoc: `groups/${groupId}`,
    residentsCol: `groups/${groupId}/residents`,
    expensesCol: `groups/${groupId}/expenses`,
    settlementsCol: `groups/${groupId}/settlements`,
    historyCol: `groups/${groupId}/history`
  };
}

// Sincronização Firestore (onSnapshot)
let unsubscribeActiveGroup = null;

function clearFirestoreListeners() {
  if (unsubscribeActiveGroup) {
    try { unsubscribeActiveGroup(); } catch (_) {}
    unsubscribeActiveGroup = null;
  }
}

function applyRemoteGroupSnapshot(groupId, data) {
  if (!groupId) return;

  const hydratedGroup = {
    id: groupId,
    name: data.name || 'Grupo',
    description: data.description || '',
    createdAt: data.createdAt || new Date().toISOString(),
    residents: data.residents || [],
    expenses: data.expenses || [],
    settlements: data.settlements || [],
    history: data.history || []
  };

  const idx = state.groups.findIndex(g => g.id === groupId);
  if (idx >= 0) state.groups[idx] = hydratedGroup;
  else state.groups.push(hydratedGroup);
}

function subscribeToActiveGroup(groupId) {
  clearFirestoreListeners();

  if (!groupId) return;
  const fs = requireFirebaseFirestore();
  if (!fs) return;

  unsubscribeActiveGroup = fs.collection('groups').doc(groupId).onSnapshot(
    (snap) => {
      if (!snap.exists) {
        isApplyingRemoteSnapshot = true;
        const idx = state.groups.findIndex(g => g.id === groupId);
        if (idx >= 0) state.groups.splice(idx, 1);
        if (state.activeGroupId === groupId) state.activeGroupId = null;
        isApplyingRemoteSnapshot = false;
        render();
        return;
      }

      const data = snap.data() || {};
      isApplyingRemoteSnapshot = true;
      try {
        applyRemoteGroupSnapshot(groupId, data);
      } finally {
        isApplyingRemoteSnapshot = false;
      }

      render();
    },
    (err) => {
      console.error('Firestore onSnapshot error:', err);
    }
  );
}



// --- DATE HELPER ---
const today = () => new Date().toISOString().split('T')[0];

// ---------------- HELPERS ----------------
function money(n) {
  const v = Number(n || 0);
  return `R$ ${v.toFixed(2).replace('.', ',')}`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '<', '>': '>', '"': '"', "'": '&#039;' }[s]));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ---------------- MODAL LOGIC ----------------
function openModal(title, bodyHtml, onConfirm) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('editModal').style.display = 'flex';
  document.getElementById('modalConfirmBtn').onclick = () => {
    onConfirm();
    closeModal();
  };
}

function closeModal() {
  document.getElementById('editModal').style.display = 'none';
  editing = { residentIndex: null, expenseIndex: null, settlementIndex: null };
}

function formatDate(d) {
  if (!d) return '';
  const parts = String(d).split('-');
  const y = parts[0];
  const m = parts[1];
  const day = parts[2];
  return `${day}/${m}`;
}

// ---------------- RENDER ----------------
function render() {
  const group = getActiveGroup();

  // View Switching
  if (!group) {
    document.getElementById('viewGroups').classList.remove('hidden');
    document.getElementById('viewDetail').classList.add('hidden');
    document.getElementById('navBar').classList.add('hidden');
    document.getElementById('mainHeader').textContent = 'CONTAJUSTA';
    renderGroupList();
    return;
  }

  document.getElementById('viewGroups').classList.add('hidden');
  document.getElementById('viewDetail').classList.remove('hidden');
  document.getElementById('navBar').classList.remove('hidden');
  document.getElementById('activeGroupName').textContent = group.name;

  renderActiveGroup();
}

function renderGroupList() {
  const list = document.getElementById('groupList');
  if (state.groups.length === 0) {
    list.innerHTML = '<div class="empty-state card">Você não possui grupos. Crie um para começar!</div>';
    return;
  }

  list.innerHTML = state.groups
    .map(
      (g, idx) => `
      <div class="card group-card" onclick="selectGroup('${g.id}')">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
          <div>
            <div class="title" style="font-size: 1.2rem">${escapeHtml(g.name)}</div>
            <div class="small">${escapeHtml(g.description || 'Sem descrição')}</div>
          </div>
          <div class="list-actions">
            <button class="icon secondary" onclick="startEditGroup(${idx}, event)">✏️</button>
            <button class="icon danger" onclick="removeGroup(${idx}, event)">🗑️</button>
          </div>
        </div>
        <div class="hr"></div>
        <div class="small">Criado em: ${new Date(g.createdAt).toLocaleDateString()}</div>
      </div>
    `
    )
    .join('');
}

function renderActiveGroup() {
  const group = getActiveGroup();
  updateExpenseSelectOptions();
  const comparisonDiv = document.getElementById('monthlyComparison');
  const c = calculate();

  // KPIs
  document.getElementById('kpiTotal').textContent = money(c.total);
  document.getElementById('kpiAvg').textContent = money(c.avg);
  document.getElementById('kpiResidents').textContent = group.residents.length;
  document.getElementById('kpiExpensesCount').textContent = group.expenses.length;

  // Trends
  if (group.history && group.history.length > 0) {
    const lastMonth = group.history[group.history.length - 1];
    const diff = c.total - lastMonth.total;
    const percent = lastMonth.total > 0 ? ((diff / lastMonth.total) * 100).toFixed(1) : 0;
    const isEco = diff <= 0;
    comparisonDiv.innerHTML = `
          <div class="trend-indicator">
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <span>Mês Anterior (${lastMonth.date}): <b>${money(lastMonth.total)}</b></span>
              <span>Mês Atual: <b>${money(c.total)}</b></span>
            </div>
            <div style="text-align: right;">
              <span class="${isEco ? 'pos' : 'neg'}" style="font-weight: bold;">
                ${isEco ? '↓ Econ.' : '↑ Aum.'} ${money(Math.abs(c.total - lastMonth.total))}
              </span>
              <div class="small">(${isEco ? '-' : '+'}${Math.abs(percent)}%)</div>
            </div>
          </div>`;
  } else {
    comparisonDiv.innerHTML = '';
  }

  // Expenses
  document.getElementById('expenses').innerHTML = group.expenses
    .map(
      (e, idx) => `
        <div class="item">
          <div class="meta" style="flex: 1">
            <div class="title">${escapeHtml(e.desc)}</div>
            <div class="badges">
              <span class="badge" style="background: var(--surface-light)">📅 ${formatDate(e.date)}</span>
              <span class="badge mono" style="color:var(--neg)">${money(e.value)}</span>
              <span class="badge">Pago por: ${escapeHtml(e.paidBy)}</span>
            </div>
          </div>
          <div class="list-actions">
            <button class="icon secondary" title="Editar" onclick="startEditExpense(${idx})">✏️</button>
            <button class="icon danger" title="Remover" onclick="removeExpense(${idx})">🗑️</button>
          </div>
        </div>
      `
    )
    .join('');

  // Settlements
  document.getElementById('settlements').innerHTML = group.settlements
    .map(
      (s, idx) => `
        <div class="item">
          <div class="meta" style="flex-grow: 1;">
            <div class="title" style="color: var(--accent)">${escapeHtml(s.from)} <span style="color: var(--muted); font-weight: 400;">pagou para</span> ${escapeHtml(s.to)}</div>
            <div class="badges">
              <span class="badge" style="background: var(--surface-light)">📅 ${formatDate(s.date)}</span>
              <span class="badge mono" style="color:var(--pos)">+ ${money(s.value)}</span>
              <span class="badge">Acerto</span>
            </div>
          </div>
          <div class="list-actions">
            <button class="icon secondary" title="Editar" onclick="startEditSettlement(${idx})">✏️</button>
            <button class="icon danger" title="Remover" onclick="removeSettlement(${idx})">🗑️</button>
          </div>
        </div>
      `
    )
    .join('');

  // Summary
  if (group.residents.length === 0) {
    document.getElementById('summary').innerHTML = 'Adicione moradores para começar.';
    return;
  }

  let html = '';
  html += `<div class="small">Gasto final + diferença vs média (meta)</div>`;
  group.residents.forEach(r => {
    const v = c.final[r.name] || 0;
    const d = c.diff[r.name] || 0;
    const isPos = d >= 0;
    html += ` 
        <div class="item">
          <div style="flex: 1">
            <div class="title">${escapeHtml(r.name)}</div>
            <div class="badges">
              <span class="badge">Final: <b class="mono">${money(v)}</b></span>
              <span class="badge ${isPos ? 'pos' : 'neg'}">
                ${isPos ? 'A receber' : 'A pagar'}: ${money(Math.abs(d))}
              </span>
            </div>
          </div>
          <div class="list-actions">
            <button class="icon secondary" style="background: transparent; border: 1px solid var(--line);" title="Editar" onclick="startEditResident(${group.residents.findIndex(res => res.name === r.name)}, event)">✏️</button>
            <button class="icon danger" style="background: transparent; border: 1px solid var(--line);" title="Remover" onclick="removeResident(${group.residents.findIndex(res => res.name === r.name)}, event)">🗑️</button>
          </div>
        </div>
      `;
  });

  html += `<div class="hr"></div>`;
  document.getElementById('summary').innerHTML = html;
}

// Initial
window.onload = async () => {
  ensureFirebaseInitialized();

  // Se já houver grupo ativo no localStorage, tenta hidratar do Firestore.
  try {
    await loadStateFromFirestore();
  } catch (e) {}

  render();
};

// Permite que app-actions chame o push no Firestore
window.pushActiveGroupToFirestore = pushActiveGroupToFirestore;


// Expor para onclick (global)
window.render = render;
window.save = save;
window.getActiveGroup = getActiveGroup;
window.money = money;
window.escapeHtml = escapeHtml;
window.generateId = generateId;
window.openModal = openModal;
window.closeModal = closeModal;
window.formatDate = formatDate;
window.state = state;
window.editing = editing;

function loginGoogle() {
  if (typeof firebase === 'undefined') return;

  const provider = new firebase.auth.GoogleAuthProvider();

  firebase.auth().signInWithPopup(provider)
    .then(result => {
      currentUser = result.user;
      console.log("Logado:", currentUser.email);
    })
    .catch(err => console.error(err));
}

window.loginGoogle = loginGoogle;