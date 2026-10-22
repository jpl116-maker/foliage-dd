import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const IV_LEN = 12;
const TAG_LEN = 16;
/** Local preview only. Production must set FILE_ENCRYPTION_KEY. */
const PREVIEW_FILE_KEY = "foliage-preview-file-key";

function publishedRuntime() {
  return process.env.VERCEL === "1" || process.env.NODE_ENV === "production";
}

function digest(material: string) {
  return createHash("sha256").update(material).digest();
}

function fileKey() {
  return process.env.FILE_ENCRYPTION_KEY?.trim() ?? "";
}

function authSecret() {
  return process.env.BETTER_AUTH_SECRET?.trim() ?? "";
}

/**
 * Keys that may open an existing blob. New ciphertext uses FILE_ENCRYPTION_KEY.
 * BETTER_AUTH_SECRET stays only so files written before that key was set still open.
 * The preview string is never used on a published runtime.
 */
function decryptKeys(): Buffer[] {
  const values: string[] = [];
  const dedicated = fileKey();
  const auth = authSecret();
  if (dedicated) values.push(dedicated);
  if (auth && auth !== dedicated) values.push(auth);
  if (values.length === 0) {
    if (publishedRuntime()) {
      throw new Error("FILE_ENCRYPTION_KEY is not set");
    }
    values.push(PREVIEW_FILE_KEY);
  }
  return values.map(digest);
}

function encryptionKey(): Buffer {
  const dedicated = fileKey();
  if (dedicated) return digest(dedicated);
  if (publishedRuntime()) {
    throw new Error("FILE_ENCRYPTION_KEY is not set");
  }
  return decryptKeys()[0]!;
}

function seal(key: Buffer, plain: Uint8Array, aad: string): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, body]);
}

function open(key: Buffer, packed: Uint8Array, aad: string): Buffer {
  const buf = Buffer.from(packed);
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const body = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}

export function encryptBytes(plain: Uint8Array, aad = ""): Buffer {
  return seal(encryptionKey(), plain, aad);
}

export function decryptBytes(packed: Uint8Array, aad = ""): Buffer {
  if (packed.byteLength < IV_LEN + TAG_LEN) {
    throw new Error("Stored file is corrupt");
  }
  let last: unknown;
  for (const key of decryptKeys()) {
    try {
      return open(key, packed, aad);
    } catch (err) {
      last = err;
    }
  }
  throw last instanceof Error ? last : new Error("Stored file could not be decrypted");
}
