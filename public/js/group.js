// group.js
// Controla a tela de um grupo específico: código de convite, membros e aprovações
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getGroupDetails, getGroupMembers, approveMember, rejectMember } from "./groups.js";
const loadingBox = document.getElementById("loading-box");
const groupBox = document.getElementById("group-box");
const errorMessage = document.getElementById("error-message");
const params = new URLSearchParams(window.location.search);
const groupId = params.get("id");
function mostrarErro(msg) {
  errorMessage.textContent = msg;
  errorMessage.classList.remove("hidden");
}
async function carregarGrupo(user) {
  if (!groupId) {
    mostrarErro("Grupo não encontrado.");
    return;
  }
  const grupo = await getGroupDetails(groupId);
  if (!grupo) {
    mostrarErro("Grupo não encontrado.");
    return;
  }
  const isOwner = grupo.ownerId === user.uid;
  document.getElementById("group-name").textContent = grupo.name;
  document.getElementById("group-type").textContent =
    grupo.type === "permanente" ? "Grupo permanente" : "Grupo temporário";
  const membros = await getGroupMembers(groupId);
  const aprovados = membros.filter(m => m.status === "approved");
  const pendentes = membros.filter(m => m.status === "pending");
  // Código de convite: só o dono vê
  if (isOwner) {
    document.getElementById("invite-code-box").classList.remove("hidden");
    document.getElementById("invite-code").textContent = grupo.inviteCode;
  }
  // Lista de membros aprovados
  const membersListDiv = document.getElementById("members-list");
  membersListDiv.innerHTML = "";
  aprovados.forEach(m => {
    const item = document.createElement("div");
    item.className = "member-item";
    item.textContent = m.name + (m.role === "admin" ? " (admin)" : "");
    membersListDiv.appendChild(item);
  });
  // Solicitações pendentes: só o dono vê e pode agir
  if (isOwner && pendentes.length > 0) {
    document.getElementById("pending-box").classList.remove("hidden");
    const pendingListDiv = document.getElementById("pending-list");
    pendingListDiv.innerHTML = "";
    pendentes.forEach(m => {
      const item = document.createElement("div");
      item.className = "member-item pending";
      const nome = document.createElement("span");
      nome.textContent = m.name;
      const btnAprovar = document.createElement("button");
      btnAprovar.textContent = "Aprovar";
      btnAprovar.className = "small-button approve";
      btnAprovar.addEventListener("click", async () => {
        await approveMember(groupId, m.uid);
        carregarGrupo(user);
      });
      const btnRecusar = document.createElement("button");
      btnRecusar.textContent = "Recusar";
      btnRecusar.className = "small-button reject";
      btnRecusar.addEventListener("click", async () => {
        await rejectMember(groupId, m.uid);
        carregarGrupo(user);
      });
      item.appendChild(nome);
      item.appendChild(btnAprovar);
      item.appendChild(btnRecusar);
      pendingListDiv.appendChild(item);
    });
  }
  loadingBox.classList.add("hidden");
  groupBox.classList.remove("hidden");
}
onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    carregarGrupo(user);
  }
});