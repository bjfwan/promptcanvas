// PairCode 后端 HTTP 客户端
// 后端部署在 https://proxy.likeyou.qzz.io/pair/*
// 契约见阶段3-B worker.mjs

const PAIR_BASE = 'https://proxy.likeyou.qzz.io/pair'

/** 带错误码的异常，供 UI 区分网络错误 / 口令错 / 过期等 */
export class PairError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'PairError'
    this.code = code
  }
}

export interface PairInitResponse {
  session_id: string
  short_code: string
  expires_at: number
  ttl_ms: number
}

export interface PairJoinResponse {
  session_id: string
  initiator_pubkey: string
  expires_at: number
}

export interface PairExchangeResponse {
  ok: true
}

/** /pair/status 的多态响应：根据 session 阶段返回不同字段 */
export interface PairStatusResponse {
  status: string
  /** joiner 已加入时返回 */
  joiner_pubkey?: string
  /** initiator 已发送密文时返回 */
  iv?: string
  ciphertext?: string
  /** initiator 已取消 */
  cancelled?: boolean
  expires_at?: number
}

export interface PairCancelResponse {
  ok: true
  status: 'cancelled'
}

async function parseError(res: Response): Promise<PairError> {
  let code = 'NETWORK'
  let message = '网络错误'
  try {
    const body = await res.json()
    if (body?.error?.code) code = String(body.error.code)
    if (body?.error?.message) message = String(body.error.message)
  } catch {
    // 非 JSON 响应
  }
  return new PairError(code, message)
}

/** 发起配对：设备 A 提交自己的公钥，获得 session_id + 6 位配对码 */
export async function pairInit(initiatorPubkey: string): Promise<PairInitResponse> {
  const res = await fetch(`${PAIR_BASE}/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ initiator_pubkey: initiatorPubkey }),
  })
  if (!res.ok) throw await parseError(res)
  return (await res.json()) as PairInitResponse
}

/** 加入配对：设备 B 提交配对码和自己的公钥，获得 initiator 公钥 */
export async function pairJoin(shortCode: string, joinerPubkey: string): Promise<PairJoinResponse> {
  const res = await fetch(`${PAIR_BASE}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ short_code: shortCode, joiner_pubkey: joinerPubkey }),
  })
  if (!res.ok) throw await parseError(res)
  return (await res.json()) as PairJoinResponse
}

/** 提交密文：设备 A 把加密后的 bundle 推给服务端，等待设备 B 拉取 */
export async function pairExchange(
  sessionId: string,
  iv: string,
  ciphertext: string,
): Promise<PairExchangeResponse> {
  const res = await fetch(`${PAIR_BASE}/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId, iv, ciphertext }),
  })
  if (!res.ok) throw await parseError(res)
  return (await res.json()) as PairExchangeResponse
}

/** 查询配对状态：多态响应，轮询用 */
export async function pairStatus(sessionId: string): Promise<PairStatusResponse> {
  const res = await fetch(`${PAIR_BASE}/status?session_id=${encodeURIComponent(sessionId)}`, {
    method: 'GET',
  })
  if (!res.ok) throw await parseError(res)
  return (await res.json()) as PairStatusResponse
}

/** 取消配对：任一方主动终止 */
export async function pairCancel(sessionId: string): Promise<PairCancelResponse> {
  const res = await fetch(`${PAIR_BASE}/cancel`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_id: sessionId }),
  })
  if (!res.ok) throw await parseError(res)
  return (await res.json()) as PairCancelResponse
}
