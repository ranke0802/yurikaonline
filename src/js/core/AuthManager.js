import EventEmitter from './EventEmitter.js';
import Logger from '../utils/Logger.js';

export default class AuthManager extends EventEmitter {
    constructor() {
        super();
        this.currentUser = null;
        this.isInitialized = false;

        // Listen to Firebase Auth state changes
        // We bind this to ensure 'this' context is preserved
        this._onAuthStateChanged = this._onAuthStateChanged.bind(this);
    }

    init() {
        if (!window.firebase) {
            Logger.error("Firebase SDK not loaded!");
            return;
        }

        Logger.log('AuthManager: Waiting for Firebase Auth...');
        firebase.auth().onAuthStateChanged(this._onAuthStateChanged);
    }

    async loginGoogle() {
        try {
            Logger.log('Attempting Google Login...');
            const provider = new firebase.auth.GoogleAuthProvider();
            await firebase.auth().signInWithPopup(provider);
            // State change will be handled by onAuthStateChanged
        } catch (error) {
            Logger.error("Google Login Failed:", error);
            // Fallback to anonymous if popup blocked or closed, or notify UI
        }
    }

    async loginAnonymously() {
        try {
            Logger.log('Attempting Anonymous Login...');
            await firebase.auth().signInAnonymously();
        } catch (error) {
            Logger.error("Anonymous Login Failed:", error);
        }
    }

    async logout() {
        try {
            await firebase.auth().signOut();
            Logger.log('Logged out successfully');
        } catch (error) {
            Logger.error("Logout Failed:", error);
        }
    }

    _onAuthStateChanged(user) {
        this.isInitialized = true;
        this.currentUser = user;

        if (user) {
            Logger.log(`User Logged In: ${user.uid} (${user.isAnonymous ? 'Guest' : user.displayName})`);

            // Sync user data to DB if needed (e.g. create initial profile)
            // This could be moved to a separate DataManager
            this._updateUserProfile(user);
        } else {
            Logger.log('User Logged Out (No Active Session)');
        }

        this.emit('authStateChanged', user);

        // Emit only once for init check if needed, but usually authStateChanged is enough
        if (!this._initEmitted) {
            this.emit('initialized');
            this._initEmitted = true;
        }
    }

    _updateUserProfile(user) {
        // Basic profile sync to Realtime Database
        // We do this to ensure other players can see this user's name
        const userRef = firebase.database().ref(`users/${user.uid}/profile`);
        userRef.update({
            displayName: user.displayName || `Guest-${user.uid.substring(0, 4)}`,
            lastLogin: firebase.database.ServerValue.TIMESTAMP
        });
    }

    getUid() {
        return this.currentUser ? this.currentUser.uid : null;
    }

    isAuthenticated() {
        return !!this.currentUser;
    }
}
