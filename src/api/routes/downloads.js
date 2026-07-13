import fs from 'fs'
import path from 'path'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { paths } from '../../paths.js'
import { jsonResponse } from '../utils.js'

const INSTALL_SCRIPT_PATH = path.join(paths.resourcesDir, 'scripts', 'install-debian-ubuntu.sh')
const DOWNLOAD_CACHE_DIR = path.join(paths.userDir, 'downloads', 'client-cache')

function getPackageMeta() {
  try {
    return JSON.parse(fs.readFileSync(path.join(paths.resourcesDir, 'package.json'), 'utf8'))
  } catch {
    return {}
  }
}

function getPublicBaseUrl(req) {
  const configured = String(process.env.LITTLE_PRINCE_AGENT_PUBLIC_URL || '').trim().replace(/\/+$/, '')
  if (configured) return configured
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'http'
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').trim()
  return host ? `${proto}://${host}` : ''
}

function publicUrl(req, pathname) {
  const base = getPublicBaseUrl(req)
  return base ? `${base}${pathname}` : pathname
}

function getDownloadInfo(req) {
  const pkg = getPackageMeta()
  const publish = Array.isArray(pkg.build?.publish) ? pkg.build.publish[0] : null
  const owner = process.env.LITTLE_PRINCE_AGENT_GITHUB_OWNER || publish?.owner || '359073395'
  const repo = process.env.LITTLE_PRINCE_AGENT_GITHUB_REPO || publish?.repo || 'LittlePrinceAgent'
  const branch = process.env.LITTLE_PRINCE_AGENT_GITHUB_BRANCH || 'main'
  const repoUrl = (process.env.LITTLE_PRINCE_AGENT_REPO_URL || `https://github.com/${owner}/${repo}`).replace(/\.git$/i, '')
  const latestReleaseUrl = process.env.LITTLE_PRINCE_AGENT_RELEASES_URL || `${repoUrl}/releases/latest`
  const windowsDownloadUrl = process.env.LITTLE_PRINCE_AGENT_WINDOWS_DOWNLOAD_PROXY_URL || publicUrl(req, '/downloads/windows')
  const linuxInstallUrl = process.env.LITTLE_PRINCE_AGENT_LINUX_INSTALL_URL || publicUrl(req, '/downloads/linux-install.sh')
  return {
    ok: true,
    version: pkg.version || 'unknown',
    repo: { owner, name: repo, branch, url: repoUrl },
    downloads: {
      windows: {
        label: 'Windows 桌面客户端',
        url: windowsDownloadUrl,
        upstreamUrl: process.env.LITTLE_PRINCE_AGENT_WINDOWS_DOWNLOAD_URL || latestReleaseUrl,
        note: '由服务器先缓存 GitHub Release 安装包，再提供本地下载',
      },
      linux: {
        label: 'Debian / Ubuntu 一键安装',
        url: linuxInstallUrl,
        command: `curl -fsSL ${linuxInstallUrl} | bash`,
        note: '服务器私有云端网页版安装脚本',
      },
      source: {
        label: '项目源码',
        url: repoUrl,
        note: '桌面端和云端网页端共用同一个仓库',
      },
    },
    updatePolicy: '桌面客户端与云端网页版共用同一仓库；原项目更新后，网页端代码随同一分支/Release 一起更新。',
  }
}

function sanitizeFileName(name = '') {
  return String(name || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160) || 'LittlePrinceAgent-Setup.exe'
}

function fileNameFromUrl(url = '') {
  try {
    return sanitizeFileName(decodeURIComponent(path.basename(new URL(url).pathname)))
  } catch {
    return 'LittlePrinceAgent-Setup.exe'
  }
}

async function resolveWindowsDownloadAsset(req) {
  const directUrl = String(process.env.LITTLE_PRINCE_AGENT_WINDOWS_DOWNLOAD_URL || '').trim()
  if (directUrl) return { url: directUrl, fileName: fileNameFromUrl(directUrl) }

  const info = getDownloadInfo(req)
  const apiUrl = process.env.LITTLE_PRINCE_AGENT_RELEASES_API_URL
    || `https://api.github.com/repos/${info.repo.owner}/${info.repo.name}/releases/latest`
  const response = await fetch(apiUrl, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'LittlePrinceAgent-download-cache',
    },
  })
  if (!response.ok) throw new Error(`GitHub Release 查询失败: HTTP ${response.status}`)
  const release = await response.json()
  const assets = Array.isArray(release.assets) ? release.assets : []
  const asset = assets.find(item => /\.(exe|msi)$/i.test(item.name || '') && /setup|windows|win|小王子|littleprince|bailongma/i.test(item.name || ''))
    || assets.find(item => /\.(exe|msi)$/i.test(item.name || ''))
    || assets.find(item => /\.(zip|7z)$/i.test(item.name || ''))
  if (!asset?.browser_download_url) throw new Error('GitHub Release 中没有找到 Windows 安装包资产')
  return {
    url: asset.browser_download_url,
    fileName: sanitizeFileName(asset.name || fileNameFromUrl(asset.browser_download_url)),
  }
}

async function ensureCachedWindowsInstaller(req) {
  await fs.promises.mkdir(DOWNLOAD_CACHE_DIR, { recursive: true })
  const asset = await resolveWindowsDownloadAsset(req)
  const fileName = sanitizeFileName(asset.fileName)
  const filePath = path.join(DOWNLOAD_CACHE_DIR, fileName)
  const metaPath = path.join(DOWNLOAD_CACHE_DIR, 'windows.json')

  try {
    const meta = JSON.parse(await fs.promises.readFile(metaPath, 'utf8'))
    const stat = await fs.promises.stat(filePath)
    if (meta.url === asset.url && stat.isFile() && stat.size > 0) {
      return { filePath, fileName, size: stat.size, url: asset.url }
    }
  } catch {}

  const tmpPath = `${filePath}.download`
  await fs.promises.rm(tmpPath, { force: true })
  try {
    const response = await fetch(asset.url, { headers: { 'User-Agent': 'LittlePrinceAgent-download-cache' } })
    if (!response.ok || !response.body) throw new Error(`Windows 安装包下载失败: HTTP ${response.status}`)
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(tmpPath))
    const stat = await fs.promises.stat(tmpPath)
    if (!stat.size) throw new Error('Windows 安装包下载为空')
    await fs.promises.rename(tmpPath, filePath)
    await fs.promises.writeFile(metaPath, JSON.stringify({
      url: asset.url,
      fileName,
      size: stat.size,
      cachedAt: new Date().toISOString(),
    }, null, 2))
    return { filePath, fileName, size: stat.size, url: asset.url }
  } catch (error) {
    await fs.promises.rm(tmpPath, { force: true }).catch(() => {})
    throw error
  }
}

function serveLocalDownload(res, filePath, fileName) {
  const stat = fs.statSync(filePath)
  const encodedName = encodeURIComponent(fileName)
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': stat.size,
    'Content-Disposition': `attachment; filename="${encodedName}"; filename*=UTF-8''${encodedName}`,
    'Cache-Control': 'private, max-age=300',
  })
  fs.createReadStream(filePath).pipe(res)
}

export async function handleDownloadRoutes(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/downloads') {
    jsonResponse(res, 200, getDownloadInfo(req))
    return true
  }

  if (req.method === 'GET' && url.pathname === '/downloads/linux-install.sh') {
    if (!fs.existsSync(INSTALL_SCRIPT_PATH)) {
      jsonResponse(res, 404, { ok: false, error: 'install script not found' })
      return true
    }
    const content = fs.readFileSync(INSTALL_SCRIPT_PATH)
    res.writeHead(200, {
      'Content-Type': 'text/x-shellscript; charset=utf-8',
      'Content-Length': content.length,
      'Content-Disposition': 'attachment; filename="install-littleprince-agent.sh"',
      'Cache-Control': 'no-cache',
    })
    res.end(content)
    return true
  }

  if (req.method === 'GET' && url.pathname === '/downloads/windows') {
    try {
      const cached = await ensureCachedWindowsInstaller(req)
      serveLocalDownload(res, cached.filePath, cached.fileName)
    } catch (error) {
      console.warn('[downloads] Windows installer relay failed:', error?.message || error)
      jsonResponse(res, 502, { ok: false, error: error?.message || String(error) })
    }
    return true
  }

  return false
}
