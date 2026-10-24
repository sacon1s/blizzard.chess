// Firebase: вход (почта или Google) и Realtime Database (профили, поиск соперника, партии онлайн).
// Ключи веб-приложения Firebase не секретны — доступ ограничивают правила базы (database.rules.json).
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyAVJ1Ue3aWy7pwqZDBYPCGwDKCCAVTQcMw',
  authDomain: 'golden-shine-484213-f9.firebaseapp.com',
  databaseURL: 'https://golden-shine-484213-f9-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'golden-shine-484213-f9',
  storageBucket: 'golden-shine-484213-f9.firebasestorage.app',
  messagingSenderId: '31688049920',
  appId: '1:31688049920:web:c4bfba41b50aad7c889fe5',
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
