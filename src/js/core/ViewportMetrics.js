// CSS client coordinates shared by layout, camera sizing and pointer conversion.
export function getViewportMetrics(container, view = window) {
    const visual = view.visualViewport;
    const rect = container?.getBoundingClientRect?.();
    const width = Math.round(container?.clientWidth || rect?.width || visual?.width || view.innerWidth || 0);
    const height = Math.round(container?.clientHeight || rect?.height || visual?.height || view.innerHeight || 0);
    const left = rect?.left ?? visual?.offsetLeft ?? 0;
    const top = rect?.top ?? visual?.offsetTop ?? 0;
    const rootStyle = view.getComputedStyle?.(document.documentElement);
    const inset = side => Math.max(0, parseFloat(rootStyle?.getPropertyValue(`--safe-area-${side}`)) || 0);
    return {
        displayWidth: width, displayHeight: height,
        viewportWidth: Math.round(visual?.width || view.innerWidth || width),
        viewportHeight: Math.round(visual?.height || view.innerHeight || height),
        viewportOffsetLeft: visual?.offsetLeft || 0, viewportOffsetTop: visual?.offsetTop || 0,
        safeAreaTop: inset('top'), safeAreaRight: inset('right'), safeAreaBottom: inset('bottom'), safeAreaLeft: inset('left'),
        devicePixelRatio: view.devicePixelRatio || 1,
        gameViewportRect: { left, top, width, height },
        orientation: width >= height ? 'landscape' : 'portrait',
        inputModality: view.matchMedia?.('(pointer: coarse)')?.matches || view.navigator?.maxTouchPoints > 0 ? 'touch' : 'desktop'
    };
}
