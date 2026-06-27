// PairCode 跨设备传输组合式函数
// 状态机：idle → initiating → waiting → sending → done / error
// 发送方：生成 keypair → init → 轮询等 joiner → 加密 bundle → exchange
// 接收方：生成 keypair → join → 轮询等密文 → 解密 → 暴露 result 给调用方落地

import { onScopeDispose, ref, type Ref } from 'vue'
import type { ProviderConfig } from '../types'
import {
  PairError,
  pairCancel,
  pairExchange,
  pairInit,
  pairJoin,
  pairStatus,
} from '../lib/pairClient'
import {
  decryptBundle,
  deriveSharedKey,
  encryptBundle,
  exportPublicKey,
  generateEcdhKeyPair,
  importPublicKey,
} from '../lib/pairCrypto'

export type PairPhase = 'idle' | 'initiating' | 'waiting' | 'sending' | 'done' | 'error'

/** 轮询初始间隔 2s，指数回退到上限 5s */
const POLL_INTERVAL_MS = 2_000
const POLL_MAX_INTERVAL_MS = 5_000
/** 轮询单次网络失败容忍次数，超过则判 error */
const POLL_MAX_CONSECUTIVE_FAILURES = 3

export interface UsePairTransferReturn {
  phase: Ref<PairPhase>
  /** 发送方 init 后拿到的 6 位配对码；接收方不使用 */
  shortCode: Ref<string>
  /** 服务端返回的 session id，取消时用 */
  sessionId: Ref<string>
  /** 错误码：NETWORK / PASSPHRASE_MISMATCH / EXPIRED / CANCELLED / FAILED */
  errorCode: Ref<string>
  errorMessage: Ref<string>
  /** 接收方解密成功后的 bundle，由调用方落地为 provider 配置 */
  result: Ref<ProviderConfig | null>
  /** 发起发送：bundle 为当前 provider 配置快照 */
  startSend: (passphrase: string, bundle: ProviderConfig) => Promise<void>
  /** 发起接收：输入发送方给的配对码 + 同一口令 */
  startReceive: (shortCode: string, passphrase: string) => Promise<void>
  /** 取消进行中的传输（关闭弹窗时调用） */
  cancel: () => void
}

export function usePairTransfer(): UsePairTransferReturn {
  const phase = ref<PairPhase>('idle')
  const shortCode = ref('')
  const sessionId = ref('')
  const errorCode = ref('')
  const errorMessage = ref('')
  const result = ref<ProviderConfig | null>(null)

  let cancelled = false
  let pollTimer: ReturnType<typeof setTimeout> | null = null
  let consecutiveFailures = 0

  function clearPollTimer() {
    if (pollTimer !== null) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  function fail(code: string, message: string) {
    clearPollTimer()
    errorCode.value = code
    errorMessage.value = message
    phase.value = 'error'
  }

  /** 轮询 helper：按间隔递增，到期或取消则停止 */
  function scheduleNext(interval: number, expiresAt: number, task: () => Promise<void>) {
    clearPollTimer()
    pollTimer = setTimeout(async () => {
      if (cancelled) return
      if (Date.now() >= expiresAt) {
        fail('EXPIRED', '配对码已过期')
        return
      }
      try {
        await task()
      } catch (err) {
        if (cancelled) return
        if (err instanceof PairError && err.code === 'PASSPHRASE_MISMATCH') {
          fail('PASSPHRASE_MISMATCH', err.message)
          return
        }
        consecutiveFailures += 1
        if (consecutiveFailures >= POLL_MAX_CONSECUTIVE_FAILURES) {
          fail('NETWORK', err instanceof Error ? err.message : '网络错误')
          return
        }
      }
      // 继续下一次轮询（间隔指数回退到 5s）
      const next = Math.min(interval + 500, POLL_MAX_INTERVAL_MS)
      scheduleNext(next, expiresAt, task)
    }, interval)
  }

  /** 发送方流程：生成 keypair → init → 轮询等 joiner → 加密 bundle → exchange */
  async function startSend(passphrase: string, bundle: ProviderConfig): Promise<void> {
    cancel()
    cancelled = false
    consecutiveFailures = 0
    result.value = null
    phase.value = 'initiating'
    errorCode.value = ''
    errorMessage.value = ''

    try {
      const keyPair = await generateEcdhKeyPair()
      const pubB64 = await exportPublicKey(keyPair.publicKey)
      const init = await pairInit(pubB64)
      sessionId.value = init.session_id
      shortCode.value = init.short_code
      phase.value = 'waiting'

      // 轮询等 joiner_pubkey
      await new Promise<void>((resolve, reject) => {
        const expiresAt = init.expires_at
        const poll = async () => {
          if (cancelled) {
            reject(new PairError('CANCELLED', '已取消'))
            return
          }
          const status = await pairStatus(init.session_id)
          consecutiveFailures = 0
          if (status.cancelled) {
            reject(new PairError('CANCELLED', '对方已取消'))
            return
          }
          if (status.joiner_pubkey) {
            resolve()
            return
          }
          // 仍未有人加入，继续轮询
          scheduleNext(POLL_INTERVAL_MS, expiresAt, poll)
        }
        void poll().catch(reject)
      })

      if (cancelled) return
      phase.value = 'sending'

      // 拿到 joiner pubkey，派生密钥并加密
      const status = await pairStatus(init.session_id)
      const joinerPub = status.joiner_pubkey
      if (!joinerPub) {
        fail('FAILED', '未拿到对方公钥')
        return
      }
      const peerPub = await importPublicKey(joinerPub)
      const sharedKey = await deriveSharedKey(keyPair.privateKey, peerPub, passphrase)
      const { iv, ciphertext } = await encryptBundle(sharedKey, bundle)
      await pairExchange(init.session_id, iv, ciphertext)
      if (cancelled) return
      phase.value = 'done'
    } catch (err) {
      if (cancelled) return
      if (err instanceof PairError) {
        fail(err.code, err.message)
      } else {
        fail('FAILED', err instanceof Error ? err.message : '发送失败')
      }
    }
  }

  /** 接收方流程：生成 keypair → join → 轮询等密文 → 解密 → 暴露 result */
  async function startReceive(code: string, passphrase: string): Promise<void> {
    cancel()
    cancelled = false
    consecutiveFailures = 0
    result.value = null
    phase.value = 'initiating'
    errorCode.value = ''
    errorMessage.value = ''

    try {
      const keyPair = await generateEcdhKeyPair()
      const pubB64 = await exportPublicKey(keyPair.publicKey)
      const joined = await pairJoin(code.trim().toUpperCase(), pubB64)
      sessionId.value = joined.session_id
      shortCode.value = ''
      phase.value = 'waiting'

      const peerPub = await importPublicKey(joined.initiator_pubkey)
      const sharedKey = await deriveSharedKey(keyPair.privateKey, peerPub, passphrase)

      // 轮询等 iv + ciphertext，收到后直接解密并落地
      await new Promise<void>((resolve, reject) => {
        const expiresAt = joined.expires_at
        const poll = async () => {
          if (cancelled) {
            reject(new PairError('CANCELLED', '已取消'))
            return
          }
          const status = await pairStatus(joined.session_id)
          consecutiveFailures = 0
          if (status.cancelled) {
            reject(new PairError('CANCELLED', '对方已取消'))
            return
          }
          if (status.iv && status.ciphertext) {
            // 收到密文，立即解密
            try {
              const bundle = await decryptBundle(sharedKey, status.iv, status.ciphertext)
              if (cancelled) {
                resolve()
                return
              }
              result.value = bundle
              phase.value = 'done'
              resolve()
            } catch {
              fail('PASSPHRASE_MISMATCH', '口令不一致或链路被劫持')
              resolve()
            }
            return
          }
          scheduleNext(POLL_INTERVAL_MS, expiresAt, poll)
        }
        void poll().catch(reject)
      })
    } catch (err) {
      if (cancelled) return
      if (err instanceof PairError) {
        fail(err.code, err.message)
      } else {
        fail('FAILED', err instanceof Error ? err.message : '接收失败')
      }
    }
  }

  /** 取消进行中的传输：停止轮询，通知服务端 */
  function cancel() {
    cancelled = true
    clearPollTimer()
    const id = sessionId.value
    // 重置状态（保留 errorCode 供 UI 显示取消原因，但通常直接回 idle）
    if (phase.value !== 'done' && phase.value !== 'error') {
      phase.value = 'idle'
    }
    if (id) {
      // 后台通知服务端取消，忽略错误
      void pairCancel(id).catch(() => {})
    }
  }

  // 组件销毁时兜底清理
  onScopeDispose(() => {
    cancelled = true
    clearPollTimer()
  })

  return {
    phase,
    shortCode,
    sessionId,
    errorCode,
    errorMessage,
    result,
    startSend,
    startReceive,
    cancel,
  }
}
