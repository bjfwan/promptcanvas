import { ref, watch } from 'vue'
import { ApiRequestError, testProvider } from '../api'
import { t } from '../lib/i18n'
import type { useDiscoveredModels } from './useDiscoveredModels'
import type { useProviderConfig } from './useProviderConfig'
import type { useToast } from './useToast'

type Toast = ReturnType<typeof useToast>
type ProviderStore = ReturnType<typeof useProviderConfig>
type DiscoveredModelsStore = ReturnType<typeof useDiscoveredModels>

function formatProviderResultMessage(result: {
  modelCount?: number
  durationMs: number
  generationRouteOk: boolean
}) {
  if (result.modelCount !== undefined) {
    return t(result.generationRouteOk ? 'providerTest.connectedModels' : 'providerTest.partialModels', {
      count: result.modelCount,
      ms: result.durationMs,
    })
  }
  return t(result.generationRouteOk ? 'providerTest.connectedMs' : 'providerTest.partialMs', {
    ms: result.durationMs,
  })
}

function providerResultMessageToken(result: {
  modelCount?: number
  durationMs: number
  generationRouteOk: boolean
}) {
  if (result.modelCount !== undefined) {
    const key = result.generationRouteOk ? 'providerTest.connectedModels' : 'providerTest.partialModels'
    return `${key}|${result.modelCount}|${result.durationMs}`
  }
  const key = result.generationRouteOk ? 'providerTest.connectedMs' : 'providerTest.partialMs'
  return `${key}|${result.durationMs}`
}

export type HealthStatus = 'checking' | 'online' | 'offline'

export function useHealthCheck(deps: {
  provider: ProviderStore
  discoveredModels: DiscoveredModelsStore
  toast: Toast
}) {
  const status = ref<HealthStatus>('checking')
  const message = ref('health.checkingConfig')

  async function refresh(options?: { silent?: boolean }) {
    if (!deps.provider.isConfigured.value) {
      status.value = 'offline'
      message.value = 'health.unconfigured'
      return
    }

    status.value = 'checking'
    message.value = 'health.testing'

    try {
      const result = await testProvider()

      if (result.models?.length) {
        deps.discoveredModels.setModels(result.models)
      }
      deps.provider.update({ imageGeneration: result.imageGeneration })

      if (!result.generationRouteOk) {
        status.value = 'offline'
        message.value = providerResultMessageToken(result)
        if (!options?.silent) {
          deps.toast.error(t('health.generationCorsMissing'), t('health.generationCorsMissingHint'))
        }
        return
      }

      status.value = 'online'
      message.value = providerResultMessageToken(result)

      if (!options?.silent) {
        deps.toast.success(t('health.apiConnected'), formatProviderResultMessage(result))
      }
    } catch (error) {
      status.value = 'offline'

      if (error instanceof ApiRequestError) {
        message.value = error.message
        if (!options?.silent) {
          deps.toast.error(t('health.apiConnectionFailed'), error.message)
        }
        return
      }

      const msg = error instanceof Error ? error.message : t('health.testFailed')
      message.value = msg
      if (!options?.silent) {
        deps.toast.error(t('health.apiConnectionFailed'), msg)
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
