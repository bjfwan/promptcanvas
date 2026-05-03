import { ref, watch } from 'vue'
import { ApiRequestError, testProvider } from '../api'
import type { useDiscoveredModels } from './useDiscoveredModels'
import type { useProviderConfig } from './useProviderConfig'
import type { useToast } from './useToast'

type Toast = ReturnType<typeof useToast>
type ProviderStore = ReturnType<typeof useProviderConfig>
type DiscoveredModelsStore = ReturnType<typeof useDiscoveredModels>

export type HealthStatus = 'checking' | 'online' | 'offline'

export function useHealthCheck(deps: {
  provider: ProviderStore
  discoveredModels: DiscoveredModelsStore
  toast: Toast
}) {
  const status = ref<HealthStatus>('checking')
  const message = ref('正在检查 API 配置')

  async function refresh(options?: { silent?: boolean }) {
    if (!deps.provider.isConfigured.value) {
      status.value = 'offline'
      message.value = '未配置 API 服务商，请打开「设置」填写 baseUrl 与 Key'
      return
    }

    status.value = 'checking'
    message.value = '正在测试连接…'

    try {
      const result = await testProvider()

      if (result.models?.length) {
        deps.discoveredModels.setModels(result.models)
      }

      if (!result.generationsCorsOk) {
        status.value = 'offline'
        message.value = result.message
        if (!options?.silent) {
          deps.toast.error('生成路径 CORS 缺失', '生成会被浏览器拦截，但上游仍会扣费。详见「设置」中的测试面板')
        }
        return
      }

      status.value = 'online'
      message.value = result.message

      if (!options?.silent) {
        deps.toast.success('API 连接正常', result.message)
      }
    } catch (error) {
      status.value = 'offline'

      if (error instanceof ApiRequestError) {
        message.value = error.message
        if (!options?.silent) {
          deps.toast.error('API 连接失败', error.message)
        }
        return
      }

      const msg = error instanceof Error ? error.message : '连接测试失败'
      message.value = msg
      if (!options?.silent) {
        deps.toast.error('API 连接失败', msg)
      }
    }
  }

  function handleTestResult(payload: { ok: boolean; message: string; code?: string }) {
    if (payload.ok) {
      status.value = 'online'
      message.value = payload.message
    } else {
      status.value = 'offline'
      message.value = payload.message
    }
  }

  watch(
    () => deps.provider.isConfigured.value,
    () => {
      refresh({ silent: true })
    },
  )

  return { status, message, refresh, handleTestResult }
}
