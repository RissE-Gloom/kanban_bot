import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, child } from "firebase/database";

const firebaseConfig = {
    apiKey: "AIzaSyAqnTZXQDuCF3QqxhOhwTRXCulDaLO_iUI",
    authDomain: "berloga-lisy.firebaseapp.com",
    databaseURL: "https://berloga-lisy-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "berloga-lisy",
    storageBucket: "berloga-lisy.firebasestorage.app",
    messagingSenderId: "266173768415",
    appId: "1:266173768415:web:46e245024336974a7c3f6a"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

export const getLabels = async () => {
    try {
        const dbRef = ref(db);
        const snapshot = await get(child(dbRef, 'projects/default/labels'));
        if (snapshot.exists()) {
            return snapshot.val();
        } else {
            console.log("No labels available in Firebase");
            return [];
        }
    } catch (error) {
        console.error("Error fetching labels from Firebase:", error);
        return [];
    }
};

export const getColumns = async () => {
    try {
        const dbRef = ref(db);
        const snapshot = await get(child(dbRef, 'projects/default/columns'));
        if (snapshot.exists()) {
            const data = snapshot.val();
            return Object.values(data);
        } else {
            return [];
        }
    } catch (error) {
        console.error("Error fetching columns from Firebase:", error);
        return [];
    }
};
