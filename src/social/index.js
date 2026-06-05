import { startDiscordConnector } from './discord.js'
import { startClawbotConnector } from './wechat-clawbot.js'
import { cloudCapabilityEnabled } from '../runtime-mode.js'

const running = new Map() // platform → connector

export async function startSocialConnectors({ pushMessage, emitEvent } = {}) {
  const starters = [
    { platform: 'discord', start: () => startDiscordConnector({ pushMessage, emitEvent }) },
    cloudCapabilityEnabled('LOCAL_PRIVILEGED_TOOLS')
      ? { platform: 'wechat-clawbot', start: () => startClawbotConnector({ pushMessage, emitEvent }) }
      : null,
  ].filter(Boolean)

  for (const { platform, start } of starters) {
    try {
      const connector = await start()
      if (connector) {
        running.set(platform, connector)
        emitEvent?.('social_status', { platform, status: 'started' })
      }
    } catch (error) {
      console.error(`[social] ${platform} connector failed to start: ${error.message}`)
      emitEvent?.('social_status', { status: 'start_error', platform, error: error.message })
    }
  }

  return [...running.values()]
}

// 热重启单个平台连接器（用于设置界面保存 token 后立即生效）
export async function restartConnector(platform, { pushMessage, emitEvent } = {}) {
  const existing = running.get(platform)
  if (existing) {
    try { existing.stop() } catch {}
    running.delete(platform)
  }

  const starters = {
    discord: () => startDiscordConnector({ pushMessage, emitEvent }),
    ...(cloudCapabilityEnabled('LOCAL_PRIVILEGED_TOOLS')
      ? { 'wechat-clawbot': () => startClawbotConnector({ pushMessage, emitEvent }) }
      : {}),
  }

  const start = starters[platform]
  if (!start) return

  try {
    const connector = await start()
    if (connector) {
      running.set(platform, connector)
      emitEvent?.('social_status', { platform, status: 'restarted' })
    }
  } catch (error) {
    console.error(`[social] ${platform} restart failed: ${error.message}`)
    emitEvent?.('social_status', { status: 'start_error', platform, error: error.message })
  }
}
