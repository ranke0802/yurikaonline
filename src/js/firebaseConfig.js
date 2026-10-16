// Firebase Configuration
const firebaseConfig = {
    "apiKey": "AIzaSyBlbyRMWvTh_m-ohqHglhLTqdF1__1Vjng",
    "authDomain": "project-e2f0a.firebaseapp.com",
    "databaseURL": "https://project-e2f0a-default-rtdb.asia-southeast1.firebasedatabase.app",
    "projectId": "project-e2f0a",
    "storageBucket": "project-e2f0a.firebasestorage.app",
    "messagingSenderId": "186736741566",
    "appId": "1:186736741566:web:73efe8edcc510de9ea22ef",
    "measurementId": "G-55M3RH0ZH4"
};

// Initialize Firebase
try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
} catch (e) {
    console.error("Firebase Initialization Error:", e);
}
