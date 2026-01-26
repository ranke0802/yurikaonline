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

        // v1.89: Explicitly set persistence to LOCAL for reliable sessions
        firebase.auth().setPersistence(firebase.auth.Auth.Persistence.LOCAL)
            .then(() => {
                // v0.00.03: Handle Redirect Result (Fix COOP Error)
                return firebase.auth().getRedirectResult();
            })
            .then((result) => {
                if (result && result.user) {
                    Logger.info(`[Auth] Redirect Login Success: ${result.user.displayName}`);
                } else {
                    Logger.log('[Auth] No pending redirect result found.');
                }
                // Start listening to state changes AFTER redirect result is processed
                firebase.auth().onAuthStateChanged(this._onAuthStateChanged);
            })
            .catch((error) => {
                Logger.error("[Auth] Initialization/Redirect Error:", error.code, error.message);

                if (error.code === 'auth/unauthorized-domain') {
                    const msg = `[Auth] 도메인 오류: '${window.location.hostname}'가 Firebase 승인 도메인에 없습니다. (Console > Auth > Settings)`;
                    alert(msg);
                }

                // Still listen to state changes so manual login works
                firebase.auth().onAuthStateChanged(this._onAuthStateChanged);
            });
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

    async migrateToGoogle(currentData = null) {
        try {
            Logger.log('Starting Google Migration...');
            const provider = new firebase.auth.GoogleAuthProvider();

            // 1. Get Google Credentials
            const result = await firebase.auth().signInWithPopup(provider);
            const googleUser = result.user;

            if (!googleUser) throw new Error("Google login failed");

            // 2. Check if this Google Account already has data
            const googleDataSnapshot = await firebase.database().ref(`users/${googleUser.uid}/profile`).once('value');
            const googleData = googleDataSnapshot.val();

            if (googleData) {
                const proceed = confirm(`선택한 구글 계정에 이미 레벨 ${googleData.level} 캐릭터(${googleData.name})가 있습니다.\n현재 데이터를 덮어씌우시겠습니까? (기존 데이터는 삭제됩니다)`);
                if (!proceed) {
                    Logger.log("Migration cancelled by user (Existing data found)");
                    return { success: false, cancelled: true };
                }
            }

            // 3. Overwrite Google UID with Current Guest Data (if provided)
            if (currentData) {
                await firebase.database().ref(`users/${googleUser.uid}/profile`).set({
                    ...currentData,
                    displayName: googleUser.displayName,
                    linkedAt: firebase.database.ServerValue.TIMESTAMP
                });
            }

            Logger.info(`Migration Authorized for ${googleUser.uid}`);
            return { success: true };
        } catch (error) {
            Logger.error("Migration Error:", error);
            throw error;
        }
    }

    getUid() {
        return this.currentUser ? this.currentUser.uid : null;
    }

    isAuthenticated() {
        return !!this.currentUser;
    }
}
