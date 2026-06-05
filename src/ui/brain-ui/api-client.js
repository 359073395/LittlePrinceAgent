export const API = /^https?:$/.test(window.location?.protocol || "")
  ? window.location.origin
  : "http://localhost:3721";

export function apiUrl(path) {
  return `${API}${path}`;
}

export function wsUrl(path) {
  if (/^https?:$/.test(window.location?.protocol || "")) {
    const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${scheme}//${window.location.host}${path}`;
  }
  return `ws://localhost:3721${path}`;
}

