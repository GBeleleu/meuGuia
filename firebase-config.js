  import { initializeApp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
  import { 
    getFirestore, 
    enableIndexedDbPersistence, 
    doc, 
    setDoc, 
    deleteDoc, 
    onSnapshot 
  } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
  import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";

  // Substitua com as credenciais do seu projeto Firebase
  const firebaseConfig = {
    apiKey: "AIzaSyDQ_bQKTnPryYQEfzzcu4H0gHopajv4RP4",
    authDomain: "meuguia-progresso.firebaseapp.com",
    projectId: "meuguia-progresso",
    storageBucket: "meuguia-progresso.firebasestorage.app",
    messagingSenderId: "391949244186",
    appId: "1:391949244186:web:02d5b1da5ffe4e1dadfea3"
  };

  // Inicializa o Firebase
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const auth = getAuth(app);

  // Habilita persistência offline automática do Firestore
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
      console.warn('Persistência offline falhou: Múltiplas abas abertas.');
    } else if (err.code == 'unimplemented') {
      console.warn('Navegador não suporta persistência offline.');
    }
  });

  // Estado global do usuário e cache de progressos
  window.currentUser = null;
  window.userProgressCache = {};

  // Observa mudanças na autenticação do usuário
onAuthStateChanged(auth, (user) => {
  window.currentUser = user;
  if (user) {
    console.log("Usuário autenticado:", user.email || user.uid);
    // Escuta mudanças em tempo real na coleção de progresso do usuário
    const progressRef = doc(db, "users", user.uid);
    onSnapshot(progressRef, (docSnap) => {
      if (docSnap.exists()) {
        window.userProgressCache = docSnap.data().progress || {};
      } else {
        window.userProgressCache = {};
      }
      if (typeof renderList === 'function') renderList();
    });
  } else {
    window.userProgressCache = {};
    console.log("Nenhum usuário autenticado.");
  }
});

// Função global para acionar o login via clique do usuário
window.loginWithGoogle = async function() {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    console.log("Login realizado com sucesso!", result.user);
  } catch (error) {
    console.error("Erro ao fazer login:", error.code, error.message);
    alert("Erro ao autenticar: " + error.message);
  }
};

  // Função global para salvar o progresso de um vídeo específico
  window.updateVideoProgress = async function(videoId, selectedValue) {
    if (!window.currentUser) {
      alert("Usuário não autenticado no Firebase.");
      return;
    }

    const userId = window.currentUser.uid;
    const userProgressDoc = doc(db, "users", userId);

    if (selectedValue === "" || selectedValue === null) {
      delete window.userProgressCache[videoId];
    } else {
      window.userProgressCache[videoId] = Number(selectedValue);
    }

    // Salva no Firestore (sincroniza em background caso esteja offline)
    try {
      await setDoc(userProgressDoc, {
        progress: window.userProgressCache
      }, { merge: true });
    } catch (err) {
      console.error("Erro ao sincronizar com Firestore:", err);
    }
  };
