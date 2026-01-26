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

        Logger.log('AuthManager: Initializing Firebase Auth...');

        // v0.00.03: Handle Redirect Result (Fix COOP Error)
        // Ensure this is called once on startup
        firebase.auth().getRedirectResult()
            .then((result) => {
                if (result && result.user) {
                    Logger.info(`[Auth] Redirect Login Success: ${result.user.displayName}`);
                    // onAuthStateChanged will trigger scene change
                } else {
                    Logger.log('[Auth] No pending redirect result found.');
                }
            })
            .catch((error) => {
                Logger.error("[Auth] Redirect Login Error:", error.code, error.message);

                // v0.00.03: Alert for domain authorization issues which are common on localhost
                if (error.code === 'auth/unauthorized-domain') {
                    const msg = "Firebase Console에서 '" + window.location.hostname + "' 도메인을 승인해야 구글 로그인이 가능합니다.";
                    alert(msg);
                    Logger.error(msg);
                }
            });

        firebase.auth().onAuthStateChanged(this._onAuthStateChanged);
    }

    async loginGoogle() {
        try {
            Logger.log('Attempting Google Login (Popup Mode)...');
            const provider = new firebase.auth.GoogleAuthProvider();

            // v0.00.04: Try Popup first for smoother experience (No page reload)
            try {
                const result = await firebase.auth().signInWithPopup(provider);
                if (result.user) {
                    Logger.info(`[Auth] Popup Login Success: ${result.user.displayName}`);
                    // onAuthStateChanged will handle the rest
                }
            } catch (popupError) {
                // If popup is blocked or other error, fallback to Redirect
                if (popupError.code === 'auth/popup-blocked' || popupError.code === 'auth/cancelled-popup-request') {
                    Logger.warn("[Auth] Popup blocked or cancelled. Falling back to Redirect mode...");
                    await firebase.auth().signInWithRedirect(provider);
                } else {
                    throw popupError;
                }
            }
        } catch (error) {
            Logger.error("Google Login Initialization Failed:", error);
            throw error; // Propagate to UI for notice
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
        // v0.00.03: DEPRECATED - Do not create profile stub here.
        // It causes CharacterSelectionScene to skip name input because /profile/ already exists.
        // Profile creation is now exclusively handled by CharacterSelectionScene.handleCreateCharacter()
        /*
        const userRef = firebase.database().ref(`users/${user.uid}/profile`);
        userRef.update({
            displayName: user.displayName || `Guest-${user.uid.substring(0, 4)}`,
            lastLogin: firebase.database.ServerValue.TIMESTAMP
        });
        */
    }

    getUid() {
        return this.currentUser ? this.currentUser.uid : null;
    }

    isAuthenticated() {
        return !!this.currentUser;
    }
}
