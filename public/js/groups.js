// groups.js
// Funções de criação, entrada e listagem de grupos do ContaJusta

import { db, auth } from "./firebase-config.js";
import {
  collection, doc, setDoc, getDoc, getDocs,
  query, where, serverTimestamp, arrayUnion, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Gera um código de convite de 6 caracteres, sem letras/números ambíguos (0, O, 1, I)
function generateInviteCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Cria um novo grupo. O criador já entra como dono (ownerId) e membro aprovado.
export async function createGroup(name, type) {
  const user = auth.currentUser;
  const inviteCode = generateInviteCode();

  const groupRef = doc(collection(db, "groups"));

  await setDoc(groupRef, {
    name: name,
    type: type, // "permanente" ou "temporario"
    inviteCode: inviteCode,
    ownerId: user.uid,
    members: [user.uid],
    createdAt: serverTimestamp()
  });

  await setDoc(doc(db, "groups", groupRef.id, "members", user.uid), {
    uid: user.uid,
    email: user.email,
    name: user.displayName,
    role: "admin",
    status: "approved",
    joinedAt: serverTimestamp()
  });

  return groupRef.id;
}

// Solicita entrada em um grupo existente através do código de convite (fica "pending")
export async function requestToJoinGroup(inviteCode) {
  const user = auth.currentUser;

  const q = query(collection(db, "groups"), where("inviteCode", "==", inviteCode.toUpperCase()));
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    throw new Error("CODIGO_INVALIDO");
  }

  const groupDoc = snapshot.docs[0];
  const memberRef = doc(db, "groups", groupDoc.id, "members", user.uid);
  const existing = await getDoc(memberRef);

  if (existing.exists()) {
    throw new Error("JA_SOLICITADO");
  }

  await setDoc(memberRef, {
    uid: user.uid,
    email: user.email,
    name: user.displayName,
    role: "member",
    status: "pending",
    joinedAt: serverTimestamp()
  });

  return groupDoc.data().name;
}

// Busca todos os grupos onde o usuário atual é membro aprovado (está no array "members" do grupo)
export async function getMyGroups() {
  const user = auth.currentUser;

  const q = query(collection(db, "groups"), where("members", "array-contains", user.uid));
  const snapshot = await getDocs(q);

  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Aprova um membro pendente (só o dono do grupo pode chamar isso)
export async function approveMember(groupId, uid) {
  await updateDoc(doc(db, "groups", groupId), {
    members: arrayUnion(uid)
  });
  await updateDoc(doc(db, "groups", groupId, "members", uid), {
    status: "approved"
  });
}