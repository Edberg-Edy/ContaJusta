// auth.js
// Funções de autenticação (cadastro, login, logout) do ContaJusta

import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Cria uma nova conta de usuário e salva os dados no Firestore
export async function registerUser(name, email, password) {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const user = userCredential.user;

  // Atualiza o nome de exibição no perfil do Firebase Auth
  await updateProfile(user, { displayName: name });

  // Cria o documento do usuário na coleção "users"
  await setDoc(doc(db, "users", user.uid), {
    name: name,
    email: email,
    createdAt: serverTimestamp()
  });

  return user;
}

// Faz login de um usuário existente
export async function loginUser(email, password) {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  return userCredential.user;
}

// Faz logout do usuário atual
export async function logoutUser() {
  await signOut(auth);
}

// Traduz os códigos de erro do Firebase para mensagens em português
export function traduzErro(codigo) {
  const mensagens = {
    "auth/email-already-in-use": "Este e-mail já está cadastrado.",
    "auth/invalid-email": "E-mail inválido.",
    "auth/weak-password": "A senha precisa ter no mínimo 6 caracteres.",
    "auth/user-not-found": "Usuário não encontrado.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/too-many-requests": "Muitas tentativas. Tente novamente mais tarde."
  };
  return mensagens[codigo] || "Ocorreu um erro. Tente novamente.";
}