'use strict';
// This standalone copy only uses LocalAuthManager / LocalNetworkManager.
Object.defineProperty(window, 'YURIKA_LOCAL_MODE', { value: true, writable: false, configurable: false });
const localOrigin = location.origin;
function localUrl(input) {
    const url = new URL(input?.url || String(input), location.href);
    if (url.origin !== localOrigin || !['http:', 'https:'].includes(url.protocol)) throw new Error('오프라인 테스트에서는 외부 연결을 사용할 수 없습니다.');
    return url;
}
const originalFetch = window.fetch.bind(window);
window.fetch = (input, options) => {
    try { localUrl(input); } catch (error) { return Promise.reject(error); }
    return originalFetch(input, { ...options, redirect: 'error' });
};
const originalOpen = XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open = function(method, url, ...args) { localUrl(url); return originalOpen.call(this, method, url, ...args); };
window.WebSocket = class { constructor() { throw new Error('오프라인 테스트에서는 온라인 소켓을 사용할 수 없습니다.'); } };
window.EventSource = class { constructor() { throw new Error('오프라인 테스트에서는 온라인 스트림을 사용할 수 없습니다.'); } };
navigator.sendBeacon = () => false;
window.open = () => null;
document.addEventListener('click', event => {
    const link = event.target.closest?.('a[href]');
    if (link) { try { localUrl(link.href); } catch { event.preventDefault(); } }
}, true);
document.addEventListener('DOMContentLoaded', () => {
    const badge = document.createElement('div'); badge.id = 'offline-test-badge';
    badge.textContent = '오프라인 테스트 · 이 브라우저에 저장';
    badge.setAttribute('role', 'note'); document.body.append(badge);
});
