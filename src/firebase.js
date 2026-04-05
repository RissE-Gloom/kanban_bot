import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, child, set } from "firebase/database";

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

        // Запрашиваем параллельно и список меток, и задачи
        const [labelsSnapshot, tasksSnapshot] = await Promise.all([
            get(child(dbRef, 'projects/default/labels')),
            get(child(dbRef, 'projects/default/tasks'))
        ]);

        const allLabels = new Set();

        // 1. Добавляем метки из списока (Manage Labels)
        if (labelsSnapshot.exists()) {
            const val = labelsSnapshot.val();
            console.log("🔍 DEBUG: Raw Labels Snapshot:", JSON.stringify(val));
            if (Array.isArray(val)) {
                val.forEach(l => { if (l) allLabels.add(l) });
            } else if (typeof val === 'object') {
                Object.values(val).forEach(l => { if (l) allLabels.add(l) });
            }
        }

        // 2. Добавляем метки, которые есть на реальных задачах (даже если их нет в списке)
        if (tasksSnapshot.exists()) {
            const tasks = tasksSnapshot.val();
            Object.values(tasks).forEach(task => {
                if (task.label) allLabels.add(task.label);
            });
        }

        const uniqueLabels = Array.from(allLabels).sort();
        console.log("✅ Combined labels (List + Tasks):", uniqueLabels);
        return uniqueLabels;

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

export const getSubscriptions = async () => {
    try {
        const dbRef = ref(db);
        const snapshot = await get(child(dbRef, 'projects/default/subscriptions'));
        if (snapshot.exists()) {
            return snapshot.val();
        }
        return {};
    } catch (error) {
        console.error("Error fetching subscriptions from Firebase:", error);
        return {};
    }
};

export const saveSubscriptions = async (subscriptions) => {
    try {
        await set(ref(db, 'projects/default/subscriptions'), subscriptions);
        return true;
    } catch (error) {
        console.error("Error saving subscriptions to Firebase:", error);
        return false;
    }
};
