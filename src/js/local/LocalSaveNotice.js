/** Device-local write feedback; no extra rewards, no remote transport. */
export default function mountLocalSaveNotice(game, parent) {
    if (!game.isLocalMode) return () => {};
    const notice = document.createElement('aside');
    notice.className = 'local-save-notice'; notice.setAttribute('role', 'alert'); notice.hidden = true;
    const text = document.createElement('span');
    text.textContent = '아직 저장되지 않았어요. 브라우저 공간을 확인해 주세요.';
    const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '다시 저장';
    notice.append(text, retry); parent.append(notice);
    const update = state => { notice.hidden = state?.ok !== false; };
    game.net.on('localProfileSaveState', update);
    update(game.net.getLocalSaveStatus?.());
    retry.onclick = async () => {
        if (retry.disabled || !game.localPlayer) return;
        retry.disabled = true;
        try {
            const result = await game.localPlayer.saveState(false, { forceImmediate: true, debounceMs: 0, reason: 'local_save_retry' });
            update(result?.ok ? await game.net.flushProfileWrites() : result);
        } catch { update({ ok: false }); }
        finally { retry.disabled = false; }
    };
    return () => { game.net.off('localProfileSaveState', update); notice.remove(); };
}
