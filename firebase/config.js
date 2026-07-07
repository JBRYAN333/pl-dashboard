// Firebase config — PL Dashboard
// Cole aqui as config do teu projeto Firebase
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
  authDomain: "pl-dashboard-XXXXX.firebaseapp.com",
  projectId: "pl-dashboard-XXXXX",
  storageBucket: "pl-dashboard-XXXXX.appspot.com",
  messagingSenderId: "XXXXXXXXXXXXX",
  appId: "1:XXXXXXXXXXXXX:web:XXXXXXXXXXXXXXXXXXX"
};

// Exportar para uso no browser
if (typeof window !== 'undefined') {
  window.FIREBASE_CONFIG = firebaseConfig;
}
