// app.js
// Controla a interface da tela de login/cadastro do ContaJusta

import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { registerUser, loginUser, traduzErro } from "./auth.js";

const loginForm = document.getElementById("login-form");
const registerForm = document.getElementById("register-form");
const btnShowRegister = document.getElementById("btn-show-register");
const btnShowLogin = document.getElementById("btn-show-login");
const errorMessage = document.getElementById("error-message");

// Alterna entre tela de login e cadastro
btnShowRegister.addEventListener("click", () => {
  loginForm.classList.add("hidden");
  btnShowRegister.classList.add("hidden");
  registerForm.classList.remove("hidden");
  btnShowLogin.classList.remove("hidden");
  errorMessage.classList.add("hidden");
});

btnShowLogin.addEventListener("click", () => {
  registerForm.classList.add("hidden");
  btnShowLogin.classList.add("hidden");
  loginForm.classList.remove("hidden");
  btnShowRegister.classList.remove("hidden");
  errorMessage.classList.add("hidden");
});

// Envio do formulário de login
loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  try {
    await loginUser(email, password);
    // O redirecionamento acontece automaticamente pelo onAuthStateChanged abaixo
  } catch (error) {
    mostrarErro(traduzErro(error.code));
  }
});

// Envio do formulário de cadastro
registerForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("reg-name").value;
  const email = document.getElementById("reg-email").value;
  const password = document.getElementById("reg-password").value;

  try {
    await registerUser(name, email, password);
    // O redirecionamento acontece automaticamente pelo onAuthStateChanged abaixo
  } catch (error) {
    mostrarErro(traduzErro(error.code));
  }
});

function mostrarErro(msg) {
  errorMessage.textContent = msg;
  errorMessage.classList.remove("hidden");
}

// Se o usuário já estiver logado, manda direto para o dashboard
onAuthStateChanged(auth, (user) => {
  if (user) {
    window.location.href = "dashboard.html";
  }
});