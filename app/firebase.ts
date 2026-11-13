import { initializeApp, getApps, getApp } from "firebase/app";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyA9mwg8CwIila_MB5GbFL6_qobRRmoRX0E",
  authDomain: "debate-room-43056.firebaseapp.com",
  databaseURL: "https://debate-room-43056-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "debate-room-43056",
  storageBucket: "debate-room-43056.firebasestorage.app",
  messagingSenderId: "1068491238036",
  appId: "1:1068491238036:web:72ec76bfea7a18d7732281"
};

// Проверяем массив существующих приложений перед инициализацией
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const db = getDatabase(app);