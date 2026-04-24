export function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function setTextContent(element, value) {
    element.textContent = value;
    return element;
}

export function setTrustedHtml(element, html) {
    element.innerHTML = html;
    return element;
}
