import Scene from '../../core/Scene.js';
import AdventureSummary from '../../core/AdventureSummary.js';

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
        this.game.ui.hideHUD();
        this.game.ui.hideAllPopups();
        this.game.net.setZoneParticipationEnabled?.(false);
        this.game.monsterManager.clearAll?.({ preserveNetwork: true });
        this.game.story?.resetFade?.();
        this.root = document.createElement('section');
        this.root.id = 'camp-scene';
        this.root.setAttribute('aria-label', '달숲 야영지');
        document.getElementById('game-container').append(this.root);
        this.root.addEventListener('click', event => {
            const action = event.target.closest('[data-camp]')?.dataset.camp;
            if (action) void this.action(action);
        });
        this.onBack = () => { if (this.view !== 'camp' && !this.busy) { this.view = 'camp'; this.renderUI(); } };
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
            this.profile = snapshot?.profile || null;
            this.summary = this.profile ? this.journey.finish(this.user.uid, this.game.isLocalMode, this.profile) : null;
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
        const p = this.profile;
        const local = this.game.isLocalMode;
        const art = file => escape(this.game.resources.getVersionedResourceUrl(ART + file));
        this.root.dataset.view = this.view;
        this.root.classList.toggle('has-journey-result', !!this.summary);
        const result = this.summary;
        const delta = result ? result.after.manastone - result.before.manastone : 0;
        this.root.innerHTML = `
            <img class="camp-backdrop" src="${art(this.view === 'character' ? 'mage-key.webp' : 'camp-master-v2.webp')}" alt="">
            <header class="camp-header"><div><span class="camp-wordmark">YURIKA</span><p>달숲 야영지 · ${local ? '로컬 모험' : '계정 모험'}</p></div><span class="camp-save-label">${local ? '이 브라우저에 저장 · 계정과 별개' : '기존 계정 기록 사용'}</span></header>
            <main class="camp-panel">
                <p class="camp-eyebrow">${this.view === 'character' ? '나의 캐릭터' : '다시, 모험의 시간'}</p>
                <h1>${p ? escape(p.name || '마법사') : '첫 번째 모험'}</h1>
                <p class="camp-status" role="status" aria-live="polite">${escape(this.message || (p ? '저장한 기록에서 여정을 이어가세요.' : '아직 보유한 캐릭터가 없어요.'))}</p>
                ${p ? `<div class="camp-profile"><img src="${art('idle-mage.webp')}" alt="보유 마법사"><div><strong>마법사 · Lv.${number(p.level || 1)}</strong><p>경험치 ${number(p.exp)} / ${number(p.maxExp || 100)}</p><p>마석 ${number(p.manastone)}</p></div></div>
                <div class="camp-progress" role="progressbar" aria-label="레벨 경험치" aria-valuenow="${Number(p.exp)||0}" aria-valuemax="${Number(p.maxExp)||100}"><i style="width:${Math.min(100,Math.max(0,(Number(p.exp)||0)/(Number(p.maxExp)||100)*100))}%"></i></div>
                ${result && this.view === 'camp' ? `<section class="camp-result" aria-label="저장된 원정 결과"><strong>최근 원정 · 저장된 기록</strong><p>Lv.${number(result.before.level)} · 경험치 ${number(result.before.exp)} → Lv.${number(result.after.level)} · 경험치 ${number(result.after.exp)}</p><p>마석 변동 ${delta > 0 ? '+' : delta < 0 ? '−' : ''}${number(Math.abs(delta))} · 가방 ${number(result.after.bagSlots)}칸 사용</p><small>보상과 사용량을 반영한 변화예요. 추가 지급은 없습니다.</small></section>` : ''}
                <p class="camp-detail">${this.view === 'character' ? `체력 능력 ${number(p.vitality || 1)} · 지능 ${number(p.intelligence || 3)} · 남은 능력치 ${number(p.statPoints)}<br>능력치·스킬 강화와 장비 관리는 필드의 상태·스킬·가방 메뉴에서 이어집니다.` : '한 명을 직접 조작하는 원정입니다. 야영지의 동료들은 아직 전투에 참여하지 않아요.'}</p>
                <button class="camp-primary" data-camp="${this.view === 'character' ? 'depart' : 'character'}" ${this.busy || this.failed ? 'disabled' : ''}>${this.view === 'character' ? '선택한 마법사로 출전' : '보유 캐릭터 선택'}</button>` : (!this.busy && !this.failed ? `<label class="camp-name">모험가 이름<input id="camp-name" maxlength="16" minlength="2" placeholder="두 글자 이상" autocomplete="off"></label><button class="camp-primary" data-camp="create">${local ? '로컬 캐릭터 만들기' : '캐릭터 만들기'}</button>` : '')}
                ${this.failed ? '<button class="camp-primary" data-camp="retry">다시 불러오기</button>' : ''}
                ${this.view === 'character' ? '<button class="camp-secondary" data-camp="camp">야영지로</button>' : ''}
                <p class="camp-disclosure">상점 · 클랜 준비 중 / 4인 전투 미연결</p>
            </main>
            <footer class="camp-footer"><span>달숲에서 시작되는 작은 여정</span>${!local ? '<button class="camp-secondary" data-camp="account">계정 관리</button>' : ''}<button class="camp-secondary" data-camp="reload" ${this.busy ? 'disabled' : ''}>기록 새로고침</button></footer>`;
    }

    async action(action) {
        if (this.busy) return;
        if (action === 'account') return this.game.sceneManager.changeScene('charSelect', { user: this.user, manageAccount: true });
        if (action === 'retry' || action === 'reload') return this.load();
        if (action === 'character' || action === 'camp') {
            this.view = action;
            if (action === 'character') history.pushState({ camp: 'character' }, '');
            this.renderUI(); return;
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
        this.root?.remove(); this.root = null;
    }
}
