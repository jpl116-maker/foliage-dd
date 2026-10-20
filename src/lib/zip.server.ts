import { crc32, deflateRawSync } from "node:zlib";

export type ZipEntry = { name: string; data: Buffer };

function sanitizeSegment(value: string) {
  const cleaned = value
    .replace(/[<>:"|?*\u0000-\u001f]/g, "_")
    .replace(/[/\\]+/g, "-")
    .replace(/^\.+/, "")
    .trim();
  return cleaned || "item";
}

export function zipPath(parts: string[]) {
  return parts.map(sanitizeSegment).filter(Boolean).join("/");
}

function uniqueName(name: string, used: Set<string>) {
  if (!used.has(name.toLowerCase())) {
    used.add(name.toLowerCase());
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let n = 2;
  let next = `${stem} (${n})${ext}`;
  while (used.has(next.toLowerCase())) {
    n += 1;
    next = `${stem} (${n})${ext}`;
  }
  used.add(next.toLowerCase());
  return next;
}

function u16(n: number) {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n, 0);
  return b;
}

function u32(n: number) {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(n >>> 0, 0);
  return b;
}

export function zipBuffers(entries: ZipEntry[]): Buffer {
  const used = new Set<string>();
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = uniqueName(entry.name.replace(/^\/+/, ""), used);
    const nameBuf = Buffer.from(name, "utf8");
    const raw = entry.data;
    const compressed = deflateRawSync(raw);
    const crc = crc32(raw) >>> 0;
    const flags = 0x0800;
    const method = 8;
    const local = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      u16(20),
      u16(flags),
      u16(method),
      u16(0),
      u16(0),
      u32(crc),
      u32(compressed.length),
      u32(raw.length),
      u16(nameBuf.length),
      u16(0),
      nameBuf,
      compressed,
    ]);
    locals.push(local);
    const central = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x01, 0x02]),
      u16(20),
      u16(20),
      u16(flags),
      u16(method),
      u16(0),
      u16(0),
      u32(crc),
      u32(compressed.length),
      u32(raw.length),
      u16(nameBuf.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      nameBuf,
    ]);
    centrals.push(central);
    offset += local.length;
  }

  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x05, 0x06]),
    u16(0),
    u16(0),
    u16(entries.length),
    u16(entries.length),
    u32(centralDir.length),
    u32(offset),
    u16(0),
  ]);
  return Buffer.concat([...locals, centralDir, eocd]);
}
