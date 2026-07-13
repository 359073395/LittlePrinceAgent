import crypto from 'crypto'
import net from 'net'

export const WS_TOKEN_PROTOCOL_PREFIX = 'bailongma.auth.'
export const WS_PUBLIC_PROTOCOL = 'bailongma.v1'

export function normalizeRemoteAddress(address = '') {
  let value = String(address || '').trim().toLowerCase()
  if (value.startsWith('[') && value.endsWith(']')) value = value.slice(1, -1)
  return value.startsWith('::ffff:') ? value.slice('::ffff:'.length) : value
}

export function isLoopbackAddress(address = '') {
  const value = normalizeRemoteAddress(address)
  return value === '127.0.0.1' || value === '::1' || value === 'localhost'
}

export function isPrivateLanAddress(address = '') {
  const value = normalizeRemoteAddress(address)
  if (!value) return false
  if (net.isIP(value) === 4) {
    const [a, b] = value.split('.').map(Number)
    return a === 10
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 169 && b === 254)
  }
  return net.isIP(value) === 6
    && (value.startsWith('fc') || value.startsWith('fd') || value.startsWith('fe80:'))
}

export function timingSafeTokenEqual(provided, expected) {
  const left = Buffer.from(String(provided || ''), 'utf8')
  const right = Buffer.from(String(expected || ''), 'utf8')
  if (left.length !== right.length || right.length === 0) return false
  return crypto.timingSafeEqual(left, right)
}

function decodeProtocolToken(protocolHeader = '') {
  for (const item of String(protocolHeader || '').split(',')) {
    const protocol = item.trim()
    if (!protocol.startsWith(WS_TOKEN_PROTOCOL_PREFIX)) continue
    try {
      return Buffer.from(protocol.slice(WS_TOKEN_PROTOCOL_PREFIX.length), 'base64url').toString('utf8')
    } catch { return '' }
  }
  return ''
}

export function getWebSocketCredential(req) {
  const authorization = String(req.headers?.authorization || '')
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (bearer) return bearer
  const protocolToken = decodeProtocolToken(req.headers?.['sec-websocket-protocol'])
  if (protocolToken) return protocolToken
  try {
    const queryToken = new URL(req.url || '/', 'http://localhost').searchParams.get('token')
    if (queryToken) return queryToken
  } catch {}
  for (const part of String(req.headers?.cookie || '').split(';')) {
    const index = part.indexOf('=')
    if (index <= 0 || part.slice(0, index).trim() !== 'lp_agent_token') continue
    const value = part.slice(index + 1).trim()
    try { return decodeURIComponent(value) } catch { return value }
  }
  return ''
}

export function selectWebSocketProtocol(protocols) {
  return protocols.has(WS_PUBLIC_PROTOCOL) ? WS_PUBLIC_PROTOCOL : false
}

function isMatchingPublicOrigin(origin, publicOrigin = '') {
  if (!origin || !publicOrigin) return false
  try { return new URL(origin).origin === new URL(publicOrigin).origin } catch { return false }
}

function isAllowedWebSocketOrigin(origin, remoteIsLoopback, lanEnabled, publicOrigin = '') {
  // Native WebSocket clients commonly omit Origin. Browser file:// and Electron use null locally.
  if (!origin) return true
  if (origin === 'null') return remoteIsLoopback
  try {
    const parsed = new URL(origin)
    if (isMatchingPublicOrigin(origin, publicOrigin)) return true
    const hostname = parsed.hostname
    if (isLoopbackAddress(hostname)) return true
    return lanEnabled && isPrivateLanAddress(hostname)
  } catch { return false }
}

export function authorizeWebSocketUpgrade(req, {
  pathname,
  lanEnabled,
  expectedToken,
  publicOrigin = '',
  knownPaths = new Set(['/scene', '/voice/cloud']),
} = {}) {
  if (!knownPaths.has(pathname)) return { ok: false, status: 404, reason: 'unknown_path' }

  const remoteAddress = req.socket?.remoteAddress
  const remoteIsLoopback = isLoopbackAddress(remoteAddress)
  const publicRequest = isMatchingPublicOrigin(req.headers?.origin, publicOrigin)
  if (!isAllowedWebSocketOrigin(req.headers?.origin, remoteIsLoopback, lanEnabled, publicOrigin)) {
    return { ok: false, status: 403, reason: 'forbidden_origin' }
  }
  if (remoteIsLoopback) return { ok: true }

  if (!publicRequest && (!lanEnabled || !isPrivateLanAddress(remoteAddress))) {
    return { ok: false, status: 403, reason: 'forbidden' }
  }
  const credential = getWebSocketCredential(req)
  if (!timingSafeTokenEqual(credential, expectedToken)) {
    return { ok: false, status: 403, reason: 'forbidden' }
  }
  return { ok: true }
}

export function rejectWebSocketUpgrade(socket, status = 403) {
  const label = status === 404 ? 'Not Found' : 'Forbidden'
  try { socket.write(`HTTP/1.1 ${status} ${label}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`) } catch {}
  socket.destroy()
}

export function attachWebSocketIdleTimeout(ws, timeoutMs, onTimeout = () => {}) {
  let timer = null
  const arm = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      try { onTimeout() } catch {}
      try { ws.terminate() } catch {}
    }, timeoutMs)
    timer.unref?.()
  }
  const clear = () => { if (timer) clearTimeout(timer); timer = null }
  ws.on('message', arm)
  ws.on('close', clear)
  ws.on('error', clear)
  arm()
  return clear
}
