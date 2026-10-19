import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// Tokens opacos são aleatórios; somente o digest chega às tabelas de sessão/convite.
export const opaqueToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
export const signValue = (value: string, secret: string) => createHmac('sha256', secret).update(value).digest('base64url');
export function safeEqual(a: string, b: string) {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

// GCM autentica o ciphertext; nonce novo a cada gravação impede reutilização do fluxo.
export function encryptToken(value: string, keyBase64: string) {
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) throw new Error('TOKEN_ENC_KEY deve conter 32 bytes em base64');
  const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString('base64url')).join('.');
}
export function decryptToken(value: string, keyBase64: string) {
  const parts = value.split('.');
  if (parts.length !== 3) throw new Error('Token criptografado inválido');
  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) throw new Error('Chave inválida');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parts[0]!, 'base64url'));
  decipher.setAuthTag(Buffer.from(parts[1]!, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(parts[2]!, 'base64url')), decipher.final()]).toString('utf8');
}
