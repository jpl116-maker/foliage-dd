import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const IV_LEN = 12;
const TAG_LEN = 16;

function keyBytes() {
  const material =
    process.env.FILE_ENCRYPTION_KEY?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim() ||
    "foliage-preview-file-key";
  return createHash("sha256").update(material).digest();
}

export function encryptBytes(plain: Uint8Array, aad = ""): Buffer {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(), iv);
  if (aad) cipher.setAAD(Buffer.from(aad, "utf8"));
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, body]);
}

export function decryptBytes(packed: Uint8Array, aad = ""): Buffer {
  if (packed.byteLength < IV_LEN + TAG_LEN) {
    throw new Error("Stored file is corrupt");
  }
  const buf = Buffer.from(packed);
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const body = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", keyBytes(), iv);
  if (aad) decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]);
}
