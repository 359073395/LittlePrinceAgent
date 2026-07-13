const TRUE_RE = /^(1|true|yes|on)$/i
const FALSE_RE = /^(0|false|no|off)$/i

export const runtimeMode = String(process.env.LITTLE_PRINCE_AGENT_MODE || 'desktop').trim().toLowerCase()

export function isCloudMode() {
  return runtimeMode === 'cloud' || runtimeMode === 'web' || runtimeMode === 'server'
}

export function envFlag(name, fallback = false) {
  const raw = process.env[name]
  if (raw === undefined || raw === null || raw === '') return fallback
  const value = String(raw).trim()
  if (TRUE_RE.test(value)) return true
  if (FALSE_RE.test(value)) return false
  return fallback
}

export function cloudCapabilityEnabled(name, desktopFallback = true) {
  if (!isCloudMode()) return desktopFallback
  const key = `LITTLE_PRINCE_AGENT_ENABLE_${String(name || '').trim().toUpperCase()}`
  return envFlag(key, false)
}

const CLOUD_DISABLED_TOOLS = new Set([
  'exec_command',
  'exec_quick_command',
  'exec_task_command',
  'exec_background_command',
  'download_file',
  'kill_process',
  'list_processes',
  'delegate_to_agent',
  'grant_agent_delegation',
  'install_tool',
  'uninstall_tool',
  'install_software',
  'manage_tool_factory',
  'run_capability',
  'manage_api_capability',
  'run_api_capability',
  'terminal_stream',
  'manage_app',
  'connect_wechat',
  'set_security',
])

export function isRuntimeToolEnabled(name) {
  if (!isCloudMode()) return true
  if (!CLOUD_DISABLED_TOOLS.has(name)) return true
  const capability = name === 'exec_command' || name === 'exec_quick_command' || name === 'exec_task_command' || name === 'exec_background_command' || name === 'download_file' || name === 'kill_process' || name === 'list_processes'
    ? 'SHELL_TOOLS'
    : 'LOCAL_PRIVILEGED_TOOLS'
  return envFlag(`LITTLE_PRINCE_AGENT_ENABLE_${capability}`, false)
}

export function runtimeModeSummary() {
  return {
    mode: runtimeMode,
    cloud: isCloudMode(),
    hostContext: cloudCapabilityEnabled('HOST_CONTEXT'),
    desktopScan: cloudCapabilityEnabled('DESKTOP_SCAN'),
    installedSoftwareScan: cloudCapabilityEnabled('INSTALLED_SOFTWARE_SCAN'),
    localResourcesScan: cloudCapabilityEnabled('LOCAL_RESOURCES_SCAN'),
    geoWeather: cloudCapabilityEnabled('GEO_WEATHER'),
    localAgentScan: cloudCapabilityEnabled('LOCAL_AGENT_SCAN'),
  }
}
