import { normalizeClassId, projectClassProfile, CLASS_IDS, CLASS_NAMES } from '../../core/ClassProfiles.js';
import Scene from '../../core/Scene.js';
import AdventureSummary from '../../core/AdventureSummary.js';
import CampPreparation from '../../core/CampPreparation.js';
import renderCampPresentation from '../../ui/CampPresentation.js';

const ART = '/party-rpg-concept/assets/';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/** Presentation only: the NetworkManager profile is the sole source of progress. */
export default class CampScene extends Scene {
    async enter({ user } = {}) {
        this.user = user;
        this.journey = this.game.adventureSummary ||= new AdventureSummary();
        this.generation = (this.generation || 0) + 1;
        this.busy = false;
        this.view = 'camp';
        this.profile = null;
        this.preparation = null;
        this.failed = false;
        this.operationTimeoutMs ||= 8000;
        this.loadToken = (this.loadToken || 0) + 1;
        this.game.ui.hideHUD();
        this.game.ui.hideAllPopups();
        this.game.net.setZoneParticipationEnabled?.(false);
        this.game.monsterManager.clearAll?.({ preserveNetwork: true });
        this.game.story?.resetFade?.();
        // Retain the original character-selection theme while at camp.
        void this.game.sound?.loadAndPlayBgm?.('bgm_intro');
        this.root = document.createElement('section');
        this.root.id = 'camp-scene';
        this.root.setAttribute('aria-label', '달숲 야영지');
        document.getElementById('game-container').append(this.root);
        this.root.addEventListener('click', event => {
            const action = event.target.closest('[data-camp]')?.dataset.camp;
            if (action) {
                this.game.sound?.playSfx?.('ui_click');
                void this.action(action).catch(error => this.showOperationError(error));
            }
        });
        this.onBack = () => this.handleBack();
        // Reject repeat mutation gestures while the first durable save is pending.
        this.onPreparationGesture = event => {
            if ((this.preparation?.pending || this.preparation?.error) && event.target.closest('.skill-up-btn, .stat-up-btn, .stat-down-btn, #confirm-yes, [id^=inventory-action-], .inventory-category-tab')) {
                event.preventDefault(); event.stopImmediatePropagation();
            }
        };
        document.addEventListener('click', this.onPreparationGesture, true);
        document.addEventListener('touchstart', this.onPreparationGesture, { capture: true, passive: false });
        window.addEventListener('popstate', this.onBack);
        await this.load();
    }

    async waitForOperation(operation, label) {
        let timer;
        try {
            return await Promise.race([operation, new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(label)), this.operationTimeoutMs || 8000);
            })]);
        } finally { clearTimeout(timer); }
    }

    async readSnapshot() {
        return this.waitForOperation(this.game.net.getLatestProfileSnapshot(this.user.uid, {
            throwOnError: true, forceRecoveryLookup: true
        }), 'profile_timeout');
    }

    showOperationError(error) {
        if (!this.root) return;
        this.busy = false;
        this.failed = true;
        this.message = error?.message === 'character_timeout' ? '캐릭터 자료를 불러오는 시간이 길어지고 있어요. 연결을 확인하고 다시 불러와 주세요.'
            : error?.message === 'region_timeout' ? '지역 자료를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
            : '기록을 불러오지 못했어요. 다시 시도해 주세요. 기존 기록은 변경하지 않았어요.';
        this.renderUI();
    }

    async load() {
        const generation = this.generation;
        const token = ++this.loadToken;
        this.busy = true;
        this.message = '모험 기록을 불러오고 있어요…';
        this.renderUI();
        try {
            const snapshot = await this.readSnapshot();
            if (generation !== this.generation || token !== this.loadToken) return;
            await this.prepareProfile(snapshot, generation, token);
            if (generation !== this.generation || token !== this.loadToken) return;
            const returning = !!this.journey.read(this.journey.key(this.user.uid, this.game.isLocalMode)).pending;
            this.summary = this.profile ? this.journey.finish(this.user.uid, this.game.isLocalMode, this.profile) : null;
            if (returning && this.summary) this.view = 'result';
            this.message = '';
            this.failed = false;
        } catch (error) {
            if (generation !== this.generation || token !== this.loadToken) return;
            this.showOperationError(error);
        } finally {
            if (generation === this.generation && token === this.loadToken) { this.busy = false; this.renderUI(); }
        }
    }

    renderUI() {
        if (!this.root) return;
        const p = this.preparation?.player || this.profile;
        const art = file => escape(this.game.resources.getVersionedResourceUrl(ART + file));
        this.root.dataset.view = this.view;
        this.root.innerHTML = renderCampPresentation({
            profile: p, view: this.view, message: this.message, summary: this.summary,
            busy: this.busy, failed: this.failed, local: this.game.isLocalMode, art,
            regionName: this.regionName, regionArt: this.regionArt, stats: p ? { hp: p.hp, maxHp: p.maxHp, damage: p.attackPower, defense: p.defense } : null
        });
        if (this.view === 'character' && p) {
            const choices = document.createElement('div');
            choices.className = 'camp-management'; choices.setAttribute('aria-label', '조작 캐릭터 선택');
            for (const id of CLASS_IDS) {
                const button = document.createElement('button'); button.className = 'camp-secondary';
                button.dataset.camp = 'select-class:' + id; button.textContent = CLASS_NAMES[id];
                button.setAttribute('aria-pressed', String(normalizeClassId(p.activeClassId) === id));
                button.disabled = this.busy || this.failed || normalizeClassId(p.activeClassId) === id;
                choices.append(button);
            }
            this.root.querySelector('.camp-character-sheet')?.prepend(choices);
        }
        if (!this.saveNotice) {
            this.saveNotice = document.createElement('aside');
            this.saveNotice.className = 'camp-save-state'; this.saveNotice.setAttribute('role', 'status');
            this.saveNotice.addEventListener('click', event => { if (event.target.closest('button')) void this.action('save-retry'); });
            document.getElementById('game-container').append(this.saveNotice);
        }
        this.updateSaveStatus();
    }

    updateSaveStatus() {
        const state = this.preparation?.status();
        const notice = this.saveNotice;
        if (!notice) return;
        notice.hidden = !state || state.ok;
        notice.replaceChildren();
        if (!state || state.ok) return;
        const code = String(state.code || state.reason || '').toLowerCase();
        const message = state.pending ? '저장한 내용을 확인하고 있어요…'
            : code.includes('timeout') ? '서버의 저장 확인이 늦어지고 있어요. 변경 내용은 유지하고 있어요.'
            : code.includes('permission') ? '저장 권한을 확인하지 못했어요. 로그인 상태를 확인한 뒤 다시 시도해 주세요.'
            : code.includes('superseded') ? '다른 접속으로 저장이 중단됐어요. 이 기기에서 다시 접속한 뒤 확인해 주세요.'
            : code.includes('conflict') || code.includes('another_tab') ? '다른 곳에서 기록이 갱신됐어요. 저장을 다시 확인해 주세요.'
            : code.includes('disconnect') || code.includes('network') ? '연결이 끊겨 저장하지 못했어요. 연결 후 다시 시도해 주세요.'
            : code.includes('profile_missing') ? '계정 기록을 아직 확인하지 못했어요. 잠시 후 다시 시도해 주세요.'
            : state.dirty ? '정비 내용을 저장하지 못했어요. 변경 내용은 유지됩니다. 다시 저장해 주세요.'
            : '이전 기록의 저장을 확인하지 못했어요. 다시 확인해 주세요.';
        notice.dataset.reason = state.code || state.reason || '';
        notice.append(document.createTextNode(message));
        if (!state.pending) {
            const retry = document.createElement('button'); retry.dataset.camp = 'save-retry'; retry.textContent = state.waiting || !state.dirty ? '저장 확인' : '다시 저장'; notice.append(retry);
        }
    }

    onPreparationPopupClosed() {
        if (!this.busy) this.renderUI();
    }

    closePreparationPopups() {
        this.game.ui.cancelPendingStats?.({ refreshUi: false });
        this.game.ui.hideConfirm?.();
        this.game.ui.hideGenericModal?.();
        this.game.ui.hideAllPopups();
    }

    handleBack() {
        if (this.busy) return;
        const ui = this.game.ui;
        if (document.querySelector('#generic-modal:not(.hidden)')) ui.hideGenericModal();
        else if (document.querySelector('#confirm-modal:not(.hidden)')) { const cb = ui.confirmCallback; ui.hideConfirm(); cb?.(false); }
        else if (document.querySelector('#inventory-item-modal:not(.hidden)')) ui.closeInventoryItemModal(true);
        else if (document.querySelector('#skill-detail-modal:not(.hidden)')) ui.hideSkillDetailModal();
        else if (document.querySelector('.game-popup:not(.hidden)')) this.closePreparationPopups();
        else { this.view = 'camp'; this.renderUI(); return; }
        this.renderUI();
        history.pushState({ camp: this.view }, '');
    }

    async prepareProfile(snapshot, generation = this.generation, token = this.loadToken) {
        const profile = snapshot?.profile || null;
        const definition = profile ? await this.waitForOperation(this.game.characterData.loadDefinition(normalizeClassId(profile.activeClassId)), 'character_timeout') : null;
        if (generation !== this.generation || token !== this.loadToken || !this.root) return;
        if (profile) await this.waitForOperation(this.game.zone.loadZoneCatalog(), 'region_timeout');
        if (generation !== this.generation || token !== this.loadToken || !this.root) return;
        this.profile = projectClassProfile(profile);
        this.preparation = profile ? new CampPreparation(this.game, this.user, profile, definition, () => this.updateSaveStatus()) : null;
        this.game.localPlayer = this.preparation?.player || null;
        if (!profile) return;
        const selected = this.profile;
        const requested = this.game.zone.getZoneMeta(selected.currentZoneId || selected.mapId || 'zone_1');
        const region = requested && (selected.level || 1) >= (requested.requiredLevel || 1) ? requested : this.game.zone.getZoneMeta('zone_1');
        this.regionName = region?.name || '시작의 숲';
        this.regionArt = ({ zone_1: 'wind.webp', zone_2: 'lake.webp', zone_3: 'thunder.webp' })[region?.id] || 'wind.webp';
    }

    async action(action) {
        if (this.busy) return;
        if (action.startsWith('select-class:')) {
            const id = action.slice('select-class:'.length);
            if (!CLASS_IDS.includes(id) || !this.preparation || this.failed) return;
            this.busy = true; this.closePreparationPopups(); this.renderUI();
            try {
                const flushed = await this.preparation.flush();
                if (flushed?.ok === false) return;
                const saved = await this.game.net.savePlayerDataPatch(this.user.uid, { activeClassId: id }, {
                    debounceMs: 0, forceImmediate: true, syncToZone: false, checkpointPolicy: 'durable', saveReason: 'class_selection'
                });
                if (saved?.ok !== true) throw new Error(saved?.reason || 'class_selection_failed');
                await this.load();
            } finally { this.busy = false; this.renderUI(); }
            return;
        }
        if (action === 'save-retry') {
            this.busy = true;
            try { await this.preparation?.flush(); } finally { this.busy = false; this.updateSaveStatus(); }
            return;
        }
        if (['inventory', 'stats', 'skills'].includes(action) && this.preparation && !this.failed) {
            this.game.ui.togglePopup({ inventory: 'inventory-popup', stats: 'status-popup', skills: 'skill-popup' }[action]);
            return;
        }
        if (action === 'camp' || action === 'result') {
            this.closePreparationPopups(); this.view = action; this.renderUI(); return;
        }
        if (action === 'depart' && this.view === 'character') action = 'prepare';
        if (action === 'character' || action === 'prepare') {
            if (!this.preparation || this.failed) return;
            this.closePreparationPopups();
            this.view = action;
            this.message = '';
            history.pushState({ camp: action }, '');
            this.renderUI();
            return;
        }
        if (['account', 'retry', 'reload'].includes(action)) {
            this.closePreparationPopups();
            this.busy = true;
            this.message = '저장한 기록을 확인하고 있어요…'; this.renderUI();
            try {
                const saved = await this.preparation?.flush();
                if (saved?.ok === false) return;
                if (action === 'account') {
                    await this.game.sceneManager.changeScene('charSelect', { user: this.user, manageAccount: true }); return;
                }
                await this.load();
                if (!this.root || this.failed) return;
                this.message = '';
            } finally { this.busy = false; this.renderUI(); }
            return;
        }
        if (action === 'create') {
            if (!this.game.isLocalMode) return this.game.sceneManager.changeScene('charSelect', { user: this.user });
            const name = this.root.querySelector('#camp-name').value.trim();
            if (name.length < 2) { this.message = '이름은 두 글자 이상 입력해 주세요.'; this.renderUI(); return; }
            this.busy = true;
            this.message = '캐릭터 기록을 저장하고 있어요…'; this.renderUI();
            try {
                const result = await this.game.net.createLocalProfile(name);
                if (!result?.ok) throw new Error(result?.reason);
                await this.load();
            } catch { this.busy = false; this.message = '저장하지 못했어요. 브라우저 저장 공간을 확인한 뒤 다시 시도해 주세요.'; this.renderUI(); }
            return;
        }
        if (action !== 'depart' || !this.profile || this.failed) return;
        this.busy = true; this.message = '필드를 준비하고 있어요…'; this.renderUI();
        try {
            this.closePreparationPopups();
            const saved = await this.preparation?.flush();
            if (saved?.ok === false) { this.busy = false; this.message = ''; this.renderUI(); return; }
            // Re-read before entry: no stale camp snapshot can overwrite newer progress.
            const snapshot = await this.readSnapshot();
            if (!this.root || this.game.sceneManager.currentScene !== this) return;
            if (!snapshot?.profile) throw new Error('missing_profile');
            this.journey.begin(this.user.uid, this.game.isLocalMode, projectClassProfile(snapshot.profile));
            await this.game.sceneManager.changeScene('world', { user: this.user, profile: snapshot.profile, localName: snapshot.profile.name });
        } catch {
            this.journey.cancel(this.user.uid, this.game.isLocalMode);
            // World entry can fail after the camp has exited. Rebuild a retryable scene.
            if (!this.root) {
                try { await this.game.sceneManager.changeScene('camp', { user: this.user }); }
                catch {
                    const notice = document.createElement('div');
                    notice.className = 'camp-save-error';
                    notice.setAttribute('role', 'alert');
                    notice.textContent = '필드를 정리하지 못했어요. 페이지를 새로고침해 저장된 기록을 다시 불러와 주세요.';
                    document.getElementById('game-container').append(notice);
                    return;
                }
            }
            this.busy = false; this.message = '출전하지 못했어요. 연결과 리소스를 확인한 뒤 다시 시도해 주세요.'; this.renderUI();
        }
    }

    async exit() {
        this.generation++;
        this.loadToken++;
        window.removeEventListener('popstate', this.onBack);
        document.removeEventListener('click', this.onPreparationGesture, true);
        document.removeEventListener('touchstart', this.onPreparationGesture, true);
        this.closePreparationPopups();
        if (this.game.localPlayer === this.preparation?.player) this.game.localPlayer = null;
        this.preparation = null;
        this.root?.remove(); this.root = null;
        this.saveNotice?.remove(); this.saveNotice = null;
    }
}
