// All exports are initiated by the user. No persistence or transport is used.
export function bindRenderDiagnosticPanel(d, root = document) {
    const get = suffix => root.getElementById(`render-diagnostic-${suffix}`);
    const status = get('status'), fallback = get('fallback');
    if (!status || !d) return null;
    let revision = 0;
    const refresh = () => {
        revision++;
        fallback.value = ''; fallback.hidden = true;
        get('start').disabled = d.active;
        get('stop').disabled = !d.active;
        get('copy').disabled = get('download').disabled = d.active || !d.count;
        get('clear').disabled = !d.active && !d.count;
        const reason = { timeout: '20초가 되어 자동 정지했습니다.', buffer_full: '기록 상한에 도달해 정지했습니다.',
            hidden: '앱이 숨겨져 정지했습니다.', recorder_error: '진단 기록을 안전하게 중단했습니다.',
            entity_limit: '진단 범위 상한에 도달해 정지했습니다.', hook_limit: '진단 범위 상한에 도달해 정지했습니다.' }[d.reason];
        status.textContent = d.active ? '기록 중 · 설정을 닫고 전투하세요. 최대 20초 후 자동 정지합니다.'
            : d.reason ? `${reason || '기록을 정지했습니다.'} ${d.count ? `${d.count}프레임 · 복사 또는 다운로드할 수 있습니다.` : '기록된 프레임이 없습니다. 다시 시작해 주세요.'}`
                : '대기 중 · 시작을 눌러야 기록합니다.';
    };
    d.onChange = refresh;
    get('start').addEventListener('click', () => { if (!d.start()) status.textContent = '지금은 진단을 시작할 수 없습니다.'; });
    get('stop').addEventListener('click', () => d.stop());
    get('clear').addEventListener('click', () => d.clear());
    get('copy').addEventListener('click', async () => {
        let text;
        try { text = d.exportJSON(); } catch { status.textContent = '내보내지 못했습니다. 다시 시도해 주세요.'; return; }
        if (!text) return;
        const current = revision;
        try {
            await navigator.clipboard.writeText(text);
            if (current === revision) status.textContent = 'JSON을 복사했습니다. 원하는 곳에 직접 붙여넣으세요.';
        } catch {
            if (current !== revision) return; // Clear/start must not resurrect a pending copy.
            fallback.value = text; fallback.hidden = false; fallback.focus(); fallback.select();
            status.textContent = '자동 복사가 안 됩니다. 아래 내용을 길게 눌러 복사하거나 JSON 다운로드를 눌러 주세요.';
        }
    });
    get('download').addEventListener('click', () => {
        let url;
        try {
            const text = d.exportJSON(); if (!text) return;
            url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
            const link = root.createElement('a');
            link.href = url; link.download = 'yurika-render-diagnostic.json';
            root.body.append(link);
            try { link.click(); } finally { link.remove(); }
            status.textContent = 'JSON 다운로드를 요청했습니다. 기기의 다운로드 목록을 확인하세요.';
        } catch { status.textContent = '다운로드하지 못했습니다. JSON 복사를 이용해 주세요.'; }
        finally { if (url) setTimeout(() => URL.revokeObjectURL(url), 1000); }
    });
    refresh();
    return { refresh };
}
