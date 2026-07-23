// firebase-config.js
// Configuração e inicialização do Firebase para o ContaJusta

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, connectAuthEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFirestore, connectFirestoreEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAdg8M_9jTKsSIFNAoTfxst0liJDBNJ3xc",
  authDomain: "contajusta-app.firebaseapp.com",
  projectId: "contajusta-app",
  storageBucket: "contajusta-app.firebasestorage.app",
  messagingSenderId: "568307009980",
  appId: "1:568307009980:web:4ceabcbe61ae73fc3643b9"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

// Conecta aos emuladores locais quando o app estiver rodando em localhost
// Isso evita que testes afetem dados reais de produção
const isLocalhost = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost";

if (isLocalhost) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099");
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  console.log("🔧 Conectado aos emuladores locais do Firebase");
}