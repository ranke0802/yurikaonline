import Scene from '../../core/Scene.js';
import AdventureSummary from '../../core/AdventureSummary.js';
import CampPreparation from '../../core/CampPreparation.js';
import renderCampPresentation from '../../ui/CampPresentation.js';

const ART = '/party-rpg-concept/assets/';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number = value => Math.max(0, Number(value) || 0).toLocaleString('ko-KR');

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
                void this.action(action);
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

    async readSnapshot() {
        let timer;
        try {
            return await Promise.race([
                this.game.net.getLatestProfileSnapshot(this.user.uid, { throwOnError: true, forceRecoveryLookup: true }),
                new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('profile_timeout')), 8000); })
            ]);
        } finally { clearTimeout(timer); }
    }

    async load() {
        const generation = this.generation;
        this.busy = true;
        this.message = '모험 기록을 불러오고 있어요…';
        this.renderUI();
        try {
            const snapshot = await this.readSnapshot();
            if (generation !== this.generation) return;
            await this.prepareProfile(snapshot, generation);
            if (generation !== this.generation) return;
            const returning = !!this.journey.read(this.journey.key(this.user.uid, this.game.isLocalMode)).pending;
            this.summary = this.profile ? this.journey.finish(this.user.uid, this.game.isLocalMode, this.profile) : null;
            if (returning && this.summary) this.view = 'result';
            this.message = '';
            this.failed = false;
        } catch {
            if (generation !== this.generation) return;
            this.failed = true;
            this.message = '기록을 불러오지 못했어요. 다시 시도해 주세요. 기존 기록은 변경하지 않았어요.';
        } finally {
            if (generation === this.generation) { this.busy = false; this.renderUI(); }
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
        notice.append(document.createTextNode(state.pending ? '정비 내용을 저장하고 있어요…' : '정비 내용을 저장하지 못했어요. 다시 저장한 뒤 출정해 주세요. '));
        if (!state.pending) {
            const retry = document.createElement('button'); retry.dataset.camp = 'save-retry'; retry.textContent = '다시 저장'; notice.append(retry);
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

    async prepareProfile(snapshot, generation = this.generation) {
        const profile = snapshot?.profile || null;
        const definition = profile ? await this.game.characterData.loadDefinition('wizard') : null;
        if (profile) await this.game.zone.loadZoneCatalog();
        if (generation !== this.generation || !this.root) return;
        this.profile = profile;
        this.preparation = profile ? new CampPreparation(this.game, this.user, profile, definition, () => this.updateSaveStatus()) : null;
        this.game.localPlayer = this.preparation?.player || null;
        if (!profile) return;
        const requested = this.game.zone.getZoneMeta(profile.currentZoneId || profile.mapId || 'zone_1');
        const region = requested && (profile.level || 1) >= (requested.requiredLevel || 1) ? requested : this.game.zone.getZoneMeta('zone_1');
        this.regionName = region?.name || '시작의 숲';
        this.regionArt = ({ zone_1: 'wind.webp', zone_2: 'lake.webp', zone_3: 'thunder.webp' })[region?.id] || 'wind.webp';
    }

    async action(action) {
        if (this.busy) return;
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
        if (['character', 'prepare', 'account', 'retry', 'reload'].includes(action)) {
            this.closePreparationPopups();
            this.busy = true;
            try {
                const saved = await this.preparation?.flush();
                if (saved?.ok === false) return;
                if (action === 'account') {
                    await this.game.sceneManager.changeScene('charSelect', { user: this.user, manageAccount: true }); return;
                }
                await this.load();
                if (!this.root || this.failed) return;
                this.view = ['character', 'prepare'].includes(action) ? action : 'camp';
                if (action === 'character' || action === 'prepare') history.pushState({ camp: action }, '');
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
            if (saved?.ok === false) { this.busy = false; this.message = '정비 저장을 다시 시도해 주세요.'; this.renderUI(); return; }
            // Re-read before entry: no stale camp snapshot can overwrite newer progress.
            const snapshot = await this.readSnapshot();
            if (!this.root || this.game.sceneManager.currentScene !== this) return;
            if (!snapshot?.profile) throw new Error('missing_profile');
            this.journey.begin(this.user.uid, this.game.isLocalMode, snapshot.profile);
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
