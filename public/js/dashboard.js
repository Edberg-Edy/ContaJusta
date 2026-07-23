// dashboard.js
// Controla a tela "Meus Grupos": listar, criar e entrar em grupos

import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { logoutUser } from "./auth.js";
import { createGroup, requestToJoinGroup, getMyGroups } from "./groups.js";

const loadingBox = document.getElementById("loading-box");
const groupsListBox = document.getElementById("groups-list-box");
const emptyBox = document.getElementById("empty-box");
const createBox = document.getElementById("create-box");
const joinBox = document.getElementById("join-box");
const errorMessage = document.getElementById("error-message");

function hideAll() {
  [loadingBox, groupsListBox, emptyBox, createBox, joinBox].forEach(b => b.classList.add("hidden"));
  errorMessage.classList.add("hidden");
}

function mostrarErro(msg) {
  errorMessage.textContent = msg;
  errorMessage.classList.remove("hidden");
}

async function carregarGrupos(user) {
  hideAll();
  loadingBox.classList.remove("hidden");

  const grupos = await getMyGroups();

  hideAll();
  if (grupos.length === 0) {
    document.getElementById("welcome-msg-empty").textContent = "Bem-vindo(a), " + user.displayName;
    emptyBox.classList.remove("hidden");
  } else {
    document.getElementById("welcome-msg").textContent = "Bem-vindo(a), " + user.displayName;
    const listaDiv = document.getElementById("groups-list");
    listaDiv.innerHTML = "";
    grupos.forEach(grupo => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "group-item-button";
      item.textContent = grupo.name + (grupo.type === "permanente" ? " (Permanente)" : " (Temporário)");
      item.addEventListener("click", () => {
        window.location.href = "group.html?id=" + grupo.id;
      });
      listaDiv.appendChild(item);
    });
    groupsListBox.classList.remove("hidden");
  }
}

document.getElementById("btn-show-create").addEventListener("click", () => { hideAll(); createBox.classList.remove("hidden"); });
document.getElementById("btn-show-join").addEventListener("click", () => { hideAll(); joinBox.classList.remove("hidden"); });
document.getElementById("btn-show-create-from-list").addEventListener("click", () => { hideAll(); createBox.classList.remove("hidden"); });
document.getElementById("btn-show-join-from-list").addEventListener("click", () => { hideAll(); joinBox.classList.remove("hidden"); });
document.getElementById("btn-cancel-create").addEventListener("click", () => carregarGrupos(auth.currentUser));
document.getElementById("btn-cancel-join").addEventListener("click", () => carregarGrupos(auth.currentUser));
document.getElementById("btn-logout-list").addEventListener("click", () => logoutUser());
document.getElementById("btn-logout-empty").addEventListener("click", () => logoutUser());

document.getElementById("create-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("group-name").value;
  const type = document.getElementById("group-type").value;
  try {
    const groupId = await createGroup(name, type);
    window.location.href = "group.html?id=" + groupId;
  } catch (error) {
    mostrarErro("Erro ao criar grupo. Tente novamente.");
  }
});

document.getElementById("join-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const code = document.getElementById("invite-code").value;
  try {
    const groupName = await requestToJoinGroup(code);
    const successMsg = document.getElementById("join-success");
    successMsg.textContent = "Solicitação enviada! Aguarde a aprovação do administrador de \"" + groupName + "\".";
    successMsg.classList.remove("hidden");
    document.getElementById("join-form").reset();
  } catch (error) {
    if (error.message === "CODIGO_INVALIDO") {
      mostrarErro("Código de convite não encontrado.");
    } else if (error.message === "JA_SOLICITADO") {
      mostrarErro("Você já solicitou entrada nesse grupo.");
    } else {
      mostrarErro("Erro ao processar solicitação.");
    }
  }
});

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
  } else {
    carregarGrupos(user);
  }
});