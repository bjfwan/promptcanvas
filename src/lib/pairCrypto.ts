// PairCode 跨设备传输的加密原语
// 方案：ECDH P-256 协商共享密钥 + 口令作 HKDF salt 派生 AES-GCM-256 密钥
// 独立于 crypto.ts（后者用固定 passphrase 做 PBKDF2，本模块不复用其派生逻辑）

import type { PairTransferPayload } from './pairTransferBundle'

/** PairCode 载荷：新版传全部中转站预设；旧版单 ProviderConfig 仍可解密导入。 */
export type PairPayload = PairTransferPayload

const SUBTLE: SubtleCrypto | undefined =
  typeof globalThis !== 'undefined' && globalThis.crypto && 'subtle' in globalThis.crypto
    ? globalThis.crypto.subtle
    : undefined

const TEXT_ENCODER = new TextEncoder()
const TEXT_DECODER = new TextDecoder()
const HKDF_INFO = TEXT_ENCODER.encode('promptcanvas-pair-v1')
const IV_LENGTH_BYTES = 12
// 密文封装魔数：worker.mjs 的 validateCiphertext 要求密文以该前缀开头，
// 作为版本/格式标识，便于将来平滑升级 envelope 格式。
const CIPHERTEXT_PREFIX = 'pcpair:v1:'

/** Uint8Array → base64 字符串 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/** base64 字符串 → Uint8Array */
export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/** 生成 ECDH P-256 密钥对，私钥不可导出（防 XSS 提取） */
export async function generateEcdhKeyPair(): Promise<CryptoKeyPair> {
  if (!SUBTLE) throw new Error('Web Crypto SubtleCrypto 不可用，无法生成配对密钥')
  return SUBTLE.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveKey', 'deriveBits'],
  )
}

/** 导出公钥为 base64（P-256 raw = 65 字节：0x04 || X(32) || Y(32)） */
export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  if (!SUBTLE) throw new Error('Web Crypto SubtleCrypto 不可用')
  const raw = await SUBTLE.exportKey('raw', publicKey)
  return bytesToBase64(new Uint8Array(raw))
}

/** 把 base64 公钥导入为 ECDH CryptoKey（用于协商共享密钥） */
export async function importPublicKey(pubB64: string): Promise<CryptoKey> {
  if (!SUBTLE) throw new Error('Web Crypto SubtleCrypto 不可用')
  const raw = base64ToBytes(pubB64)
  return SUBTLE.importKey('raw', raw, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
}

/**
 * 协商共享密钥并派生为 AES-GCM-256 密钥
 * shared = ECDH(myPriv, peerPub); key = HKDF-SHA256(shared, salt=UTF8(passphrase), info="promptcanvas-pair-v1", 32)
 */
export async function deriveSharedKey(
  myPrivateKey: CryptoKey,
  peerPublicKey: CryptoKey,
  passphrase: string,
): Promise<CryptoKey> {
  if (!SUBTLE) throw new Error('Web Crypto SubtleCrypto 不可用')
  // 先 deriveBits 得到原始共享密钥（32 字节）
  const sharedBits = await SUBTLE.deriveBits(
    { name: 'ECDH', public: peerPublicKey },
    myPrivateKey,
    256,
  )
  // HKDF 的 baseKey 必须先用 importKey 导入，不能直接用 deriveBits 结果
  const hkdfBaseKey = await SUBTLE.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey'])
  const salt = TEXT_ENCODER.encode(passphrase)
  return SUBTLE.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt, info: HKDF_INFO },
    hkdfBaseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/** 用派生密钥加密 bundle，返回 base64 的 iv 和 ciphertext */
export async function encryptBundle(
  key: CryptoKey,
  bundle: PairPayload,
): Promise<{ iv: string; ciphertext: string }> {
  if (!SUBTLE) throw new Error('Web Crypto SubtleCrypto 不可用')
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES))
  const plaintext = TEXT_ENCODER.encode(JSON.stringify(bundle))
  const cipher = await SUBTLE.encrypt({ name: 'AES-GCM', iv }, key, plaintext)
  return { iv: bytesToBase64(iv), ciphertext: `${CIPHERTEXT_PREFIX}${bytesToBase64(new Uint8Array(cipher))}` }
}

/** 用派生密钥解密，返回 ProviderConfig。GCM tag 校验失败会抛异常 */
export async function decryptBundle(
  key: CryptoKey,
  ivB64: string,
  ciphertextB64: string,
): Promise<PairPayload> {
  if (!SUBTLE) throw new Error('Web Crypto SubtleCrypto 不可用')
  const iv = base64ToBytes(ivB64)
  // 容错剥离前缀：兼容带 / 不带 pcpair:v1: 前缀的密文
  const rawCipher = ciphertextB64.startsWith(CIPHERTEXT_PREFIX)
    ? ciphertextB64.slice(CIPHERTEXT_PREFIX.length)
    : ciphertextB64
  const cipher = base64ToBytes(rawCipher)
  const plain = await SUBTLE.decrypt({ name: 'AES-GCM', iv }, key, cipher)
  return JSON.parse(TEXT_DECODER.decode(plain)) as PairPayload
}
