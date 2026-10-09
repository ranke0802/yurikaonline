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
            Logger.error('Firebase SDK not loaded!');
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
                Logger.error('[Auth] Initialization/Redirect Error:', error.code, error.message);

                if (error.code === 'auth/unauthorized-domain') {
                    const msg = `[Auth] 도메인 오류: '${window.location.hostname}'가 Firebase 인증 허용 도메인에 없습니다. (Console > Auth > Settings)`;
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
                    Logger.warn('[Auth] Popup blocked or cancelled. Falling back to Redirect mode...');
                    await firebase.auth().signInWithRedirect(provider);
                } else {
                    throw popupError;
                }
            }
        } catch (error) {
            Logger.error('Google Login Initialization Failed:', error);
            throw error; // Propagate to UI for notice
        }
    }

    async loginAnonymously() {
        try {
            Logger.log('Attempting Anonymous Login...');
            await firebase.auth().signInAnonymously();
        } catch (error) {
            Logger.error('Anonymous Login Failed:', error);
        }
    }

    async logout() {
        try {
            await firebase.auth().signOut();
            Logger.log('Logged out successfully');
        } catch (error) {
            Logger.error('Logout Failed:', error);
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

    async migrateToGoogle() {
        try {
            Logger.log('Starting Google Migration...');
            const provider = new firebase.auth.GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });

            const currentUser = firebase.auth().currentUser;
            if (!currentUser) {
                return { success: false, cancelled: true, reason: 'no_current_user' };
            }

            if (!currentUser.isAnonymous) {
                return { success: false, cancelled: true, reason: 'already_linked' };
            }

            const result = await currentUser.linkWithPopup(provider);
            const linkedUser = result?.user || firebase.auth().currentUser;

            if (!linkedUser) {
                throw new Error('Google link failed');
            }

            Logger.info(`Migration Linked for ${linkedUser.uid}`);
            return {
                success: true,
                mode: 'linked',
                googleUid: linkedUser.uid,
                googleDisplayName: linkedUser.displayName || '',
                googleEmail: linkedUser.email || ''
            };
        } catch (error) {
            const conflictCodes = new Set([
                'auth/credential-already-in-use',
                'auth/account-exists-with-different-credential',
                'auth/email-already-in-use'
            ]);

            if (error?.code === 'auth/popup-closed-by-user') {
                Logger.info('Google migration popup closed by user');
                return { success: false, cancelled: true, reason: 'popup_closed' };
            }

            if (conflictCodes.has(error?.code)) {
                Logger.warn('Google migration found an existing linked account', error);
                return {
                    success: false,
                    cancelled: false,
                    reason: 'existing_google_account',
                    code: error.code,
                    credential: error.credential || null,
                    email: error.email || '',
                    message: error.message || ''
                };
            }

            Logger.error('Migration Error:', error);
            throw error;
        }
    }

    async signInToExistingGoogle(credential = null) {
        const provider = new firebase.auth.GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });

        if (credential) {
            const result = await firebase.auth().signInWithCredential(credential);
            return result?.user || firebase.auth().currentUser;
        }

        const result = await firebase.auth().signInWithPopup(provider);
        return result?.user || firebase.auth().currentUser;
    }

    getUid() {
        return this.currentUser ? this.currentUser.uid : null;
    }

    isAuthenticated() {
        return !!this.currentUser;
    }
}
