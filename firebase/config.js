// Firebase config — PL Dashboard
const firebaseConfig = {
  apiKey: "AIzaSyDvDk5aoU-UDidEnn5HowUyRQLdatTQ-nI",
  authDomain: "pl-dashboard-f7315.firebaseapp.com",
  projectId: "pl-dashboard-f7315",
  storageBucket: "pl-dashboard-f7315.firebasestorage.app",
  messagingSenderId: "98422610300",
  appId: "1:98422610300:web:a138666f2218634d152cf9"
};

// Exportar para uso no browser
if (typeof window !== 'undefined') {
  window.FIREBASE_CONFIG = firebaseConfig;
}
