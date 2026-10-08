/** Installation is optional; browser menus vary by version.
 * https://support.apple.com/ko-kr/guide/iphone/iphea86e5236/ios
 * https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=ko
 * https://samsunginternet.github.io/docs/homescreen
 */
export function isInstalled(env = globalThis) {
    return !!env.navigator?.standalone || ['standalone', 'fullscreen', 'minimal-ui']
        .some(mode => env.matchMedia?.(`(display-mode: ${mode})`)?.matches);
}

export function installationGuide(navigator = {}) {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) {
        return 'Safari에서 공유 → 홈 화면에 추가를 선택하세요. “웹 앱으로 열기”가 표시되면 켠 뒤 추가하세요.\n메뉴가 다르면 Safari에서 이 주소를 다시 열어 주세요.';
    }
    if (/SamsungBrowser/i.test(ua)) return 'Samsung Internet 메뉴에서 홈 화면 추가 항목을 선택하세요. 주소창에 + 표시가 있으면 그곳에서도 추가할 수 있어요. 메뉴 이름은 버전에 따라 다를 수 있어요.';
    if (/Android/i.test(ua) && (!/Chrome|Chromium/i.test(ua) || /EdgA|OPR/i.test(ua))) return '브라우저 메뉴에서 설치 또는 홈 화면 추가 항목을 찾아주세요. 메뉴가 없다면 Chrome에서 이 주소를 열어 주세요.';
    if (/Android/i.test(ua)) return 'Chrome 메뉴 → “설치 및 바로가기 만들기” → “설치”를 선택하세요. 버전에 따라 “앱 설치” 또는 “홈 화면에 추가”로 표시될 수 있어요.';
    return '브라우저 주소창이나 메뉴에 설치 버튼이 표시되면 선택하세요. 설치 메뉴가 없어도 이 브라우저에서 계속 플레이할 수 있어요.';
}

export function showInstallationGuide(ui, env = globalThis) {
    if (isInstalled(env)) return;
    ui.showGenericModal('홈 화면에서 바로 시작', installationGuide(env.navigator)
        + '\n\n설치는 선택 사항이에요. 온라인 계정과 함께하기 기능에는 인터넷 연결이 필요해요.',
    null, null, { hideNo: true, yesText: '알겠어요' });
}

export function installGuideButton(parent, ui, env = globalThis) {
    if (!parent || isInstalled(env)) return;
    const button = env.document.createElement('button');
    button.type = 'button'; button.className = 'platform-guide-button';
    button.textContent = '홈 화면에 추가하는 방법';
    button.onclick = () => showInstallationGuide(ui, env);
    parent.append(button);
    return button;
}
