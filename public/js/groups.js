// groups.js
// Funções de criação, entrada e listagem de grupos do ContaJusta

import { db, auth } from "./firebase-config.js";
import {
  collection, doc, setDoc, getDoc, getDocs, deleteDoc,
  query, where, serverTimestamp, arrayUnion, updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function generateInviteCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export async function createGroup(name, type) {
  const user = auth.currentUser;
  const inviteCode = generateInviteCode();

  const groupRef = doc(collection(db, "groups"));

  await setDoc(groupRef, {
    name: name,
    type: type,
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

export async function getMyGroups() {
  const user = auth.currentUser;

  const q = query(collection(db, "groups"), where("members", "array-contains", user.uid));
  const snapshot = await getDocs(q);

  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function approveMember(groupId, uid) {
  await updateDoc(doc(db, "groups", groupId), {
    members: arrayUnion(uid)
  });
  await updateDoc(doc(db, "groups", groupId, "members", uid), {
    status: "approved"
  });
}

export async function rejectMember(groupId, uid) {
  await deleteDoc(doc(db, "groups", groupId, "members", uid));
}

export async function getGroupDetails(groupId) {
  const snap = await getDoc(doc(db, "groups", groupId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function getGroupMembers(groupId) {
  const snap = await getDocs(collection(db, "groups", groupId, "members"));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}