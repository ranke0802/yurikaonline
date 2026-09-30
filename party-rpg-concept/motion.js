/* Gentle 2D illustration motion and tactile controls; no Live2D model or SDK is used. */
(() => {
  'use strict';
  if (window.YurikaMotion) return;

  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const state = { enabled: true, haptics: false, feedback: true };
  let initialized = false;
  let app = null;
  let observer = null;
  let pressed = null;
  let parallaxFrame = 0;
  let pointerX = 0;
  let pointerY = 0;
  let feedbackLayer = null;

  function canAnimate() {
    return state.enabled && !reducedMotion.matches && !document.hidden;
  }

  function updateState() {
    root.dataset.ymMotion = state.enabled && !reducedMotion.matches ? 'on' : 'off';
    root.dataset.ymVisible = document.hidden ? 'hidden' : 'visible';
    root.dataset.ymFeedback = state.feedback ? 'on' : 'off';
    if (!canAnimate()) {
      resetParallax();
      feedbackLayer?.replaceChildren();
    }
    if (!state.feedback) release();
  }

  function isUsable(button) {
    return button instanceof HTMLButtonElement &&
      !button.disabled && !button.matches(':disabled') &&
      button.getAttribute('aria-disabled') !== 'true' && !button.closest('[inert]');
  }

  function targetButton(target) {
    const button = target instanceof Element ? target.closest('button') : null;
    return isUsable(button) ? button : null;
  }

  function release(pointerId) {
    if (!pressed || (pointerId !== undefined && pressed.id !== pointerId)) return;
    pressed.button.classList.remove('ym-pressed');
    pressed = null;
  }

  function press(button, id) {
    if (!state.feedback || !button) return;
    release();
    pressed = { button, id };
    button.classList.add('ym-pressed');
  }

  function resolveEnvironment(backdrop) {
    const explicit = backdrop.dataset.environment || app?.dataset.environment;
    const allowed = ['wind', 'lake', 'thunder', 'ruins', 'rift', 'camp', 'lobby', 'shop', 'clan', 'opening', 'characters'];
    if (allowed.includes(explicit)) return explicit;
    for (const name of allowed) {
      if (app?.classList.contains(`region-${name}`)) return name;
    }
    if (app?.classList.contains('loading-rift')) return 'rift';
    if (app?.classList.contains('loading-camp')) return 'camp';
    if (app?.classList.contains('loading-departure')) return 'wind';
    for (const name of ['opening', 'shop', 'clan', 'characters']) {
      if (app?.classList.contains(`screen-${name}`)) return name;
    }
    return 'lobby';
  }

  function createSceneEffects(backdrop) {
    const environment = resolveEnvironment(backdrop);
    let layer = backdrop.querySelector(':scope > .ym-scene-effects');
    if (layer) {
      layer.dataset.environment = environment;
      return;
    }
    layer = document.createElement('div');
    layer.className = 'ym-scene-effects';
    layer.dataset.environment = environment;
    layer.setAttribute('aria-hidden', 'true');
    const glow = document.createElement('i');
    glow.className = 'ym-scene-glow';
    const mist = document.createElement('i');
    mist.className = 'ym-scene-mist';
    layer.append(glow, mist);
    // Eight sparse particles; deterministic positions avoid patterns that restart randomly on render.
    const positions = [[12, 72], [24, 42], [36, 86], [47, 24], [59, 62], [69, 34], [80, 81], [91, 48]];
    positions.forEach(([x, y], index) => {
      const particle = document.createElement('i');
      particle.className = 'ym-particle';
      particle.style.setProperty('--ym-x', `${x}%`);
      particle.style.setProperty('--ym-y', `${y}%`);
      particle.style.setProperty('--ym-duration', `${10 + index * 1.7}s`);
      particle.style.setProperty('--ym-delay', `${-index * 3.7}s`);
      particle.style.setProperty('--ym-size', `${2 + index % 3}px`);
      layer.append(particle);
    });
    backdrop.append(layer);
  }

  function refresh() {
    app ||= document.querySelector('#app');
    if (!app) return;
    app.querySelectorAll('.backdrop').forEach(createSceneEffects);
    updateState();
  }

  function resetParallax() {
    if (parallaxFrame) cancelAnimationFrame(parallaxFrame);
    parallaxFrame = 0;
    app?.style.removeProperty('--ym-pointer-x');
    app?.style.removeProperty('--ym-pointer-y');
  }

  function move(event) {
    if (pressed?.id === event.pointerId) {
      const rect = pressed.button.getBoundingClientRect();
      if (event.clientX < rect.left - 8 || event.clientX > rect.right + 8 ||
          event.clientY < rect.top - 8 || event.clientY > rect.bottom + 8) release(event.pointerId);
    }
    if (!canAnimate() || !finePointer.matches || event.pointerType !== 'mouse') return;
    pointerX = (event.clientX / window.innerWidth - .5) * 6;
    pointerY = (event.clientY / window.innerHeight - .5) * 4;
    if (parallaxFrame) return;
    // Event-driven, with no persistent requestAnimationFrame loop.
    parallaxFrame = requestAnimationFrame(() => {
      parallaxFrame = 0;
      if (!canAnimate() || !app) return;
      app.style.setProperty('--ym-pointer-x', `${pointerX.toFixed(2)}px`);
      app.style.setProperty('--ym-pointer-y', `${pointerY.toFixed(2)}px`);
    });
  }

  function confirmationFlash(button, event) {
    if (!canAnimate()) return;
    const rect = button.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const inBounds = event.detail > 0 && event.clientX >= rect.left && event.clientX <= rect.right &&
      event.clientY >= rect.top && event.clientY <= rect.bottom;
    const x = inBounds ? event.clientX : rect.left + rect.width / 2;
    const y = inBounds ? event.clientY : rect.top + rect.height / 2;
    // A fixed, inert layer survives route rerenders. Dialog feedback remains in the top layer.
    const host = button.closest('dialog[open]') || document.body;
    let layer = host.querySelector(':scope > .ym-feedback-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'ym-feedback-layer';
      layer.setAttribute('aria-hidden', 'true');
      host.append(layer);
    }
    if (host === document.body) feedbackLayer = layer;
    const ring = document.createElement('span');
    ring.className = 'ym-tap-ring';
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    layer.append(ring);
    while (layer.childElementCount > 4) layer.firstElementChild.remove();
    ring.addEventListener('animationend', () => ring.remove(), { once: true });
    // Also clean up when animations are disabled midway or the document is hidden.
    setTimeout(() => ring.remove(), 520);
  }

  function highlightSelection(button) {
    const key = ['data-character', 'data-region', 'data-go'].find(name => button.hasAttribute(name));
    if (!key) return;
    const value = button.getAttribute(key);
    // Native event dispatch can run microtasks between capture and bubble listeners.
    // Wait for the next frame so app.js has completed its synchronous screen rerender.
    requestAnimationFrame(() => {
      if (!state.feedback || !canAnimate() || !app) return;
      const selected = [...app.querySelectorAll(`button[${key}]`)].find(node =>
        node.getAttribute(key) === value && (node.classList.contains('active') || node.getAttribute('aria-pressed') === 'true'));
      if (!selected) return;
      selected.classList.remove('ym-selected');
      requestAnimationFrame(() => {
        if (!selected.isConnected || !canAnimate()) return;
        selected.classList.add('ym-selected');
        setTimeout(() => selected.classList.remove('ym-selected'), 400);
      });
    });
  }

  function confirm(event) {
    const button = targetButton(event.target);
    if (!button || !state.feedback) return;
    release();
    confirmationFlash(button, event);
    highlightSelection(button);
    if (state.haptics && !document.hidden && typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(9); } catch (_) { /* Haptics are optional; unsupported browsers stay silent. */ }
    }
    // Audio stays owned by app.js to avoid double-playing its existing button sound.
  }

  function init(options = {}) {
    if (typeof options.enabled === 'boolean') state.enabled = options.enabled;
    if (typeof options.haptics === 'boolean') state.haptics = options.haptics;
    if (typeof options.feedback === 'boolean') state.feedback = options.feedback;
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', () => init(), { once: true });
      return getState();
    }
    if (!initialized) {
      initialized = true;
      app = document.querySelector('#app');
      document.addEventListener('pointerdown', event => {
        if (event.isPrimary === false || event.button !== 0) return;
        press(targetButton(event.target), event.pointerId);
      }, { capture: true, passive: true });
      document.addEventListener('pointerup', event => release(event.pointerId), { capture: true, passive: true });
      document.addEventListener('pointercancel', event => release(event.pointerId), { capture: true, passive: true });
      document.addEventListener('pointermove', move, { capture: true, passive: true });
      document.addEventListener('keydown', event => {
        if ((event.key === 'Enter' || event.key === ' ') && !event.repeat) press(targetButton(event.target), 'keyboard');
      }, true);
      document.addEventListener('keyup', event => {
        if (event.key === 'Enter' || event.key === ' ') release('keyboard');
      }, true);
      document.addEventListener('click', confirm, true);
      window.addEventListener('blur', () => { release(); resetParallax(); });
      document.addEventListener('pointerout', event => { if (!event.relatedTarget) { release(); resetParallax(); } }, { passive: true });
      document.addEventListener('visibilitychange', () => { release(); updateState(); });
      const updatePreference = () => { release(); updateState(); };
      if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', updatePreference);
      else reducedMotion.addListener(updatePreference);
      if (app) {
        observer = new MutationObserver(refresh);
        observer.observe(app, { childList: true, attributes: true, attributeFilter: ['class', 'data-environment'] });
      }
    }
    refresh();
    return getState();
  }

  function getState() {
    return { ...state, reducedMotion: reducedMotion.matches, visible: !document.hidden, animated: canAnimate() };
  }

  window.YurikaMotion = Object.freeze({
    init,
    refresh,
    setEnabled(enabled) { state.enabled = Boolean(enabled); updateState(); return getState(); },
    setHaptics(enabled) { state.haptics = Boolean(enabled); return getState(); },
    setFeedback(enabled) { state.feedback = Boolean(enabled); updateState(); return getState(); },
    getState
  });
  init();
})();
