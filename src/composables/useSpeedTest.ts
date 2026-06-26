import { computed, ref } from 'vue'
import { testProvider } from '../api'
import type { ProviderPreset } from '../storage'

/**
 * 测速 composable：复用 api.ts 的 testProvider(override)，并行测速。
 * - 传入 override，不读写 useProviderConfig 的 reactive 状态，避免污染当前 provider
 * - results 按 presetId 记录每次状态；rankedResults 按耗时升序输出成功项
 */
export interface SpeedTestResult {
  status: 'pending' | 'testing' | 'success' | 'error'
  durationMs?: number
  modelCount?: number
  error?: string
}

export interface RankedSpeedTestResult extends SpeedTestResult {
  id: string
  rank: number
}

const results = ref<Record<string, SpeedTestResult>>({})
const running = ref(false)

async function testOne(preset: ProviderPreset): Promise<{ id: string; result: SpeedTestResult }> {
  const outcome = await testProvider({
    baseUrl: preset.baseUrl,
    apiKey: preset.apiKey,
    proxyUrl: preset.proxyUrl,
  })
  return {
    id: preset.id,
    result: {
      status: 'success',
      durationMs: outcome.durationMs,
      modelCount: outcome.modelCount,
    },
  }
}

async function runSpeedTest(targets: ProviderPreset[]) {
  if (running.value || !targets.length) return
  running.value = true

  const initial: Record<string, SpeedTestResult> = {}
  for (const preset of targets) {
    initial[preset.id] = { status: 'testing' }
  }
  // 保留已有其它 preset 的结果，仅把本次目标置为 testing
  results.value = { ...results.value, ...initial }

  const settled = await Promise.allSettled(targets.map((preset) => testOne(preset)))

  const merged: Record<string, SpeedTestResult> = { ...results.value }
  settled.forEach((entry, index) => {
    const preset = targets[index]
    if (entry.status === 'fulfilled') {
      merged[preset.id] = entry.value.result
    } else {
      const reason = entry.reason
      const message =
        reason instanceof Error ? reason.message : typeof reason === 'string' ? reason : 'error'
      merged[preset.id] = { status: 'error', error: message }
    }
  })

  results.value = merged
  running.value = false
}

/** 成功项按 durationMs 升序，附上 1-based 排名 */
const rankedResults = computed<RankedSpeedTestResult[]>(() => {
  return Object.entries(results.value)
    .filter(([, result]) => result.status === 'success' && typeof result.durationMs === 'number')
    .map(([id, result]) => ({ id, ...result }))
    .sort((a, b) => (a.durationMs ?? 0) - (b.durationMs ?? 0))
    .map((entry, index) => ({ ...entry, rank: index + 1 }))
})

export function useSpeedTest() {
  return {
    results,
    running,
    runSpeedTest,
    rankedResults,
  }
}
