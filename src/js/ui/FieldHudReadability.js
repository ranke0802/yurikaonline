// Presentation only; CSS variables never replace saved HUD positions or game data.
export default class FieldHudReadability {
    clear() {
        document.body.classList.remove('field-readable-hud');
        this.signature = '';
    }
    sync(ui, force = false) {
        const exit = document.querySelector('.camp-return:not([hidden])');
        const active = window.innerWidth <= 1024 && !!exit && !ui.uiLayoutEditMode
            && !ui.game?.tutorial?.activeTutorial && !ui.tutorialGuideState
            && !document.body.classList.contains('popup-open')
            && !document.getElementById('ui-layer')?.classList.contains('hidden');
        if (!active) { this.clear(); return; }
        const resource = document.querySelector('.top-bar'), quest = document.querySelector('.quest-list-panel');
        if (!resource || !quest) return;
        const signature = JSON.stringify([window.innerWidth, window.innerHeight, quest.textContent,
            [...resource.querySelectorAll('.bar-text')].map(e => e.textContent.length),
            resource.dataset.uiLayoutAppliedScale, quest.dataset.uiLayoutAppliedScale]);
        if (!force && signature === this.signature) return;
        this.clear();
        const style = document.body.style;
        const set = (key, value) => style.setProperty('--field-' + key, String(value));
        const scale = el => el?.offsetWidth ? el.getBoundingClientRect().width / el.offsetWidth : 1;
        const resourceScale = scale(resource) || 1, questScale = scale(quest) || 1;
        set('resource-scale', resourceScale); set('quest-scale', questScale);
        const minimap = document.querySelector('#minimap-container')?.getBoundingClientRect();
        const resourceLeft = resource.getBoundingClientRect().left;
        const rootStyle = getComputedStyle(document.documentElement);
        const inset = side => parseFloat(rootStyle.getPropertyValue('--safe-area-' + side)) || 0;
        const safeRight = inset('right');
        const availableRight = minimap?.width ? minimap.left - 8 : window.innerWidth - safeRight - 12;
        set('resource-width', `${Math.min(224, Math.max(120, availableRight - resourceLeft))}px`);
        for (const key of ['exit-x', 'exit-y', 'quest-y', 'chat-y']) set(key, '0px');
        document.body.classList.add('field-readable-hud');
        const r = resource.getBoundingClientRect(), e = exit.getBoundingClientRect();
        const overlap = r.left < e.right && r.right > e.left && r.top < e.bottom && r.bottom > e.top;
        const exitLeft = overlap ? r.left : e.left;
        const exitTop = overlap ? r.bottom + 8 : e.top;
        set('exit-x', `${Math.max(inset('left'), Math.min(exitLeft, window.innerWidth - safeRight - e.width)) - e.left}px`);
        set('exit-y', `${Math.max(inset('top'), exitTop) - e.top}px`);
        const exitRect = exit.getBoundingClientRect();
        const top = Math.max(r.bottom, overlap ? exitRect.bottom : 0) + 8;
        const context = document.querySelector('.left-ui-container');
        const contextScale = ui.getElementComputedScale(context) || 1;
        set('quest-y', `${Math.max(0, top - quest.getBoundingClientRect().top) / contextScale}px`);
        const questTop = quest.getBoundingClientRect().top;
        const safeBottom = inset('bottom');
        // Keep the lower left movement area available. Long text remains scrollable.
        const questRect = quest.getBoundingClientRect();
        const controls = [...document.querySelectorAll('.action-buttons .skill-btn, .action-buttons .attack-btn')]
            .filter(el => el.getClientRects().length).map(el => el.getBoundingClientRect())
            .filter(r => r.top > questTop && r.left < questRect.right && r.right > questRect.left);
        const bottom = Math.min(window.innerHeight - 176 - safeBottom, ...controls.map(r => r.top - 8));
        set('quest-height', `${Math.max(48, Math.min(260, bottom - questTop)) / questScale}px`);
        const chat = document.querySelector('.chat-window');
        if (window.innerHeight > window.innerWidth && chat?.getClientRects().length) {
            const delta = quest.getBoundingClientRect().bottom + 8 - chat.getBoundingClientRect().top;
            if (delta > 0) set('chat-y', `${delta / contextScale}px`);
        }
        this.signature = signature;
    }
}
