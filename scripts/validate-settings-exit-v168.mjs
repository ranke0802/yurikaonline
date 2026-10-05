import test from 'node:test';
import assert from 'node:assert/strict';
import { UIManager } from '../src/js/ui/UIManager.js';

function fixture() {
    const events = [], answers = [], classes = new Set(['hidden']);
    globalThis.document = { querySelector: () => null };
    globalThis.window = { history: { back: () => events.push('history-back') } };
    const world = { waitForPendingZoneTransition: async () => events.push('travel-settled'),
        markProfileSavedForSceneExit: () => events.push('saved-for-exit') };
    const player = { id: 'isolated-exit', saveState: async (_force, options) => {
        events.push(['save', options]); return { ok: true };
    } };
    const ui = Object.create(UIManager.prototype);
    Object.assign(ui, {
        gameExitConfirmPending: false, browserBackExitConfirmPending: false, gameExitSceneTransitioning: false,
        confirmModal: { classList: { contains: name => classes.has(name) } },
        confirmCallback: null,
        showConfirm(message, callback, options = {}) {
            classes.delete('hidden');
            if (options.centeredEnhancement) classes.add('enhancement-confirm-centered');
            events.push(['prompt', message]);
            this.confirmCallback = answer => { answers.push(answer); return callback(answer); };
        },
        hideConfirm() { classes.add('hidden'); classes.delete('enhancement-confirm-centered'); this.confirmCallback = null; },
        armBrowserBackExitGuard: () => events.push('guard-arm'),
        disarmBrowserBackExitGuard: () => events.push('guard-disarm'),
        hideAllPopups: () => events.push('popups-close'),
        showCenterMessage: () => events.push('failure-message')
    });
    const game = ui.game = { localPlayer: player, auth: { currentUser: { uid: player.id } },
        _resetTransientInputState: () => events.push('input-reset'),
        tutorial: { stopTutorial: () => events.push('tutorial-stop') },
        net: { flushProfileWrites: async (_id, options) => { events.push(['flush', options]); return { ok: true }; },
            setZoneParticipationEnabled: enabled => events.push(['participation', enabled]) },
        sceneManager: { currentScene: world, scenes: new Map([['world', world], ['camp', {}]]),
            changeScene: async name => { assert.equal(game.localPlayer, null); events.push(['scene', name]); game.sceneManager.currentScene = game.sceneManager.scenes.get(name); } }
    };
    const answer = async value => { const cb = ui.confirmCallback; ui.hideConfirm(); await cb?.(value); };
    return { ui, game, player, events, answers, answer, classes };
}
const saved = events => events.filter(e => Array.isArray(e) && e[0] === 'save');

test('back cancels the existing settings exit once, without replacement, saving or exiting', () => {
    const {ui, events, answers, classes} = fixture();
    assert.equal(ui.requestGameExitToCharacterSelection('settings_exit_game'), true);
    ui.handleBrowserBackPopState();
    assert.deepEqual(answers, [false]);
    assert.equal(ui.gameExitConfirmPending, false);
    assert.equal(ui.browserBackExitConfirmPending, false);
    assert.equal(ui.confirmCallback, null);
    assert.ok(classes.has('hidden'));
    assert.equal(events.filter(e => e[0] === 'prompt').length, 1);
    assert.equal(saved(events).length, 0);
    assert.equal(ui.isWorldSceneActive(), true);
    assert.equal(ui.requestGameExitToCharacterSelection('settings_exit_game'), true);
});

test('duplicate settings requests and later browser back do not invoke the old callback twice', async () => {
    const {ui, events, answers, answer} = fixture();
    assert.equal(ui.requestGameExitToCharacterSelection(), true);
    assert.equal(ui.requestGameExitToCharacterSelection(), false);
    ui.handleBrowserBackPopState();
    ui.handleBrowserBackPopState();
    ui.handleBrowserBackPopState();
    assert.deepEqual(answers, [false]);
    assert.equal(ui.browserBackExitConfirmPending, true);
    assert.equal(events.filter(e => e[0] === 'prompt').length, 2);
    await answer(false); await answer(false);
    assert.deepEqual(answers, [false, false]);
    assert.equal(ui.gameExitConfirmPending, false);
    assert.equal(ui.browserBackExitConfirmPending, false);
    assert.equal(saved(events).length, 0);
});

test('ordinary cancel and duplicate answers leave settings reusable without a save', async () => {
    const {ui, events, answers, answer} = fixture();
    ui.requestGameExitToCharacterSelection(); await answer(false); await answer(false);
    assert.deepEqual(answers, [false]);
    assert.equal(ui.gameExitConfirmPending, false);
    assert.equal(saved(events).length, 0);
    assert.equal(ui.requestGameExitToCharacterSelection(), true);
});

test('confirm after back keeps the existing durable save, flush and camp transition order', async () => {
    const {ui, events, answers, answer} = fixture();
    ui.requestGameExitToCharacterSelection('settings_exit_game'); ui.handleBrowserBackPopState();
    ui.requestGameExitToCharacterSelection('settings_exit_game'); events.length = 0;
    await answer(true); await answer(true);
    assert.deepEqual(answers, [false, true]);
    assert.deepEqual(events.map(e => Array.isArray(e) ? e[0] : e), [
        'popups-close', 'guard-disarm', 'input-reset', 'travel-settled', 'save', 'flush', 'saved-for-exit', 'tutorial-stop', 'participation', 'scene'
    ]);
    assert.deepEqual(saved(events)[0][1], { debounceMs:0, forceImmediate:true, checkpointPolicy:'durable', syncRecoveryProfile:false, reason:'settings_exit_game' });
    assert.deepEqual(events.find(e => e[0] === 'flush')[1], { replayLocalPatchJournal:false });
    assert.deepEqual(events.at(-1), ['scene','camp']);
    assert.equal(ui.gameExitConfirmPending, false);
    assert.equal(ui.gameExitSceneTransitioning, false);
});

test('confirmed settings exit still stays in the field when final save fails', async () => {
    const {ui, game, player, events, answer} = fixture();
    player.saveState = async () => { events.push(['save']); return {ok:false,reason:'isolated_rejection'}; };
    ui.requestGameExitToCharacterSelection(); await answer(true);
    assert.equal(saved(events).length, 1);
    assert.equal(events.some(e => e[0] === 'flush' || e[0] === 'scene'), false);
    assert.equal(game.localPlayer, player);
    assert.equal(ui.isWorldSceneActive(), true);
    assert.equal(ui.gameExitConfirmPending, false);
    assert.equal(ui.gameExitSceneTransitioning, false);
    assert.equal(ui.requestGameExitToCharacterSelection(), true);
});

test('centered inventory confirmation continues through its own cancellation callback', () => {
    const {ui, answers, events} = fixture(); let calls = 0;
    ui.showConfirm('inventory', confirmed => { assert.equal(confirmed, false); calls++; }, {centeredEnhancement:true});
    ui.handleBrowserBackPopState();
    assert.equal(calls, 1); assert.deepEqual(answers, [false]); assert.equal(saved(events).length, 0);
});

test('plain field back retains the separate browser exit confirmation and history step', async () => {
    const {ui, events, answers, answer} = fixture();
    ui.handleBrowserBackPopState(); assert.equal(ui.browserBackExitConfirmPending, true);
    await answer(true); assert.deepEqual(answers, [true]); assert.equal(saved(events).length, 0);
    assert.equal(events.at(-1), 'history-back');
    ui.handleBrowserBackPopState();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(saved(events).length, 1);
    assert.equal(saved(events)[0][1].reason, 'browser_back_exit');
    assert.equal(ui.gameExitSceneTransitioning, false);
});

test('in-progress exit and non-world scenes do not open another exit prompt', () => {
    const {ui, game, events} = fixture();
    ui.gameExitSceneTransitioning = true; ui.handleBrowserBackPopState();
    assert.equal(ui.requestGameExitToCharacterSelection(), false);
    game.sceneManager.currentScene = {}; ui.gameExitSceneTransitioning = false;
    ui.handleBrowserBackPopState();
    assert.equal(ui.requestGameExitToCharacterSelection(), false);
    assert.equal(events.filter(e => e[0] === 'prompt').length, 0);
});
