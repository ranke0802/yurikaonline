// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDJJXShBTu4aPJ0CbFjU4QiOjd3NEYrL38",
    authDomain: "yurika-online.firebaseapp.com",
    databaseURL: "https://yurika-online-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "yurika-online",
    storageBucket: "yurika-online.firebasestorage.app",
    messagingSenderId: "766892097779",
    appId: "1:766892097779:web:bb20d028b4b8e1ddc63786",
    measurementId: "G-1F27X863KV"
};

// Initialize Firebase
try {
    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
        console.log("Firebase Initialized Successfully");
    }
} catch (e) {
    console.error("Firebase Initialization Error:", e);
}
