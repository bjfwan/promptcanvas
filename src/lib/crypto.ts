const SUBTLE: SubtleCrypto | undefined =
  typeof globalThis !== 'undefined' && globalThis.crypto && 'subtle' in globalThis.crypto
    ? globalThis.crypto.subtle
    : undefined

const TEXT_ENCODER = new TextEncoder()
const TEXT_DECODER = new TextDecoder()
const DERIVATION_PASSPHRASE = 'promptcanvas:provider-v1::derivation-passphrase'
const PBKDF2_ITERATIONS = 100_000
const KEY_LENGTH_BITS = 256
const IV_LENGTH_BYTES = 12

let cachedKey: CryptoKey | null = null

async function getKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey
  if (!SUBTLE) {
    throw new Error('Web Crypto SubtleCrypto 不可用，无法加密 localStorage 凭据')
  }

  const baseKey = await SUBTLE.importKey(
    'raw',
    TEXT_ENCODER.encode(DERIVATION_PASSPHRASE),
    'PBKDF2',
    false,
    ['deriveKey'],
  )

  const salt = TEXT_ENCODER.encode(
    typeof location !== 'undefined' && location.origin
      ? `promptcanvas-salt:${location.origin}`
      : 'promptcanvas-salt:default',
  )

  cachedKey = await SUBTLE.deriveKey(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: PBKDF2_ITERATIONS,
    },
    baseKey,
    { name: 'AES-GCM', length: KEY_LENGTH_BITS },
    false,
    ['encrypt', 'decrypt'],
  )

  return cachedKey
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(b64)
  const buffer = new ArrayBuffer(binary.length)
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

export async function encryptString(plaintext: string): Promise<string> {
  if (!plaintext) return ''
  if (!SUBTLE) throw new Error('Web Crypto SubtleCrypto 不可用')

  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES))
  const cipher = await SUBTLE.encrypt(
    { name: 'AES-GCM', iv },
    key,
    TEXT_ENCODER.encode(plaintext),
  )

  return `v1:${bytesToBase64(iv)}:${bytesToBase64(new Uint8Array(cipher))}`
}

export async function decryptString(payload: string): Promise<string> {
  if (!payload) return ''
  if (!payload.startsWith('v1:')) {
    return payload
  }
  if (!SUBTLE) throw new Error('Web Crypto SubtleCrypto 不可用')

  const parts = payload.split(':')
  if (parts.length !== 3) {
    throw new Error('密文格式无效')
  }
  const [, ivB64, cipherB64] = parts
  const iv = base64ToBytes(ivB64)
  const cipher = base64ToBytes(cipherB64)
  const key = await getKey()

  const plain = await SUBTLE.decrypt({ name: 'AES-GCM', iv }, key, cipher)
  return TEXT_DECODER.decode(plain)
}

export function isEncrypted(payload: string): boolean {
  return typeof payload === 'string' && payload.startsWith('v1:')
}
