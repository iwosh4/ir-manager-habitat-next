let host = null;
/** Non-blocking notifications (info | warn | error). */
export function toast(message, kind = 'info', ms = 2600) {
  if (!host) { host = document.createElement('div'); host.className = 'toasts'; document.body.appendChild(host); }
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  host.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 300); }, kind === 'error' ? ms * 2 : ms);
  while (host.children.length > 4) host.firstChild.remove();
}
