// Minimal dBase III/FoxPro .dbf reader/writer — enough for TGrp tables and its input file.

export type Field = { name: string; type: string; len: number; dec: number };
export type Row = Record<string, string>;

export function readDbf(buf: Buffer): { fields: Field[]; rows: Row[] } {
  const count = buf.readUInt32LE(4);
  const headLen = buf.readUInt16LE(8);
  const recLen = buf.readUInt16LE(10);
  const fields: Field[] = [];
  for (let o = 32; o < headLen && buf[o] !== 0x0d; o += 32) {
    fields.push({
      name: buf.toString("latin1", o, o + 11).replace(/\0.*$/, ""),
      type: String.fromCharCode(buf[o + 11]),
      len: buf[o + 16],
      dec: buf[o + 17],
    });
  }
  const rows: Row[] = [];
  for (let r = 0; r < count; r++) {
    let p = headLen + r * recLen;
    if (buf[p] === 0x2a) continue; // deleted record
    p++;
    const row: Row = {};
    for (const f of fields) {
      row[f.name] = buf.toString("latin1", p, p + f.len).trim();
      p += f.len;
    }
    rows.push(row);
  }
  return { fields, rows };
}

export function writeDbf(fields: Field[], rows: Row[]): Buffer {
  const recLen = 1 + fields.reduce((s, f) => s + f.len, 0);
  const headLen = 32 + fields.length * 32 + 1;
  const buf = Buffer.alloc(headLen + rows.length * recLen + 1, 0x20);
  buf.fill(0, 0, headLen);
  const now = new Date();
  buf[0] = 0x03;
  buf[1] = now.getFullYear() - 1900;
  buf[2] = now.getMonth() + 1;
  buf[3] = now.getDate();
  buf.writeUInt32LE(rows.length, 4);
  buf.writeUInt16LE(headLen, 8);
  buf.writeUInt16LE(recLen, 10);
  fields.forEach((f, i) => {
    const o = 32 + i * 32;
    buf.write(f.name, o, "latin1");
    buf[o + 11] = f.type.charCodeAt(0);
    buf[o + 16] = f.len;
    buf[o + 17] = f.dec;
  });
  buf[headLen - 1] = 0x0d;
  rows.forEach((r, i) => {
    let p = headLen + i * recLen + 1;
    for (const f of fields) {
      const v = (r[f.name] ?? "").slice(0, f.len);
      buf.write(f.type === "N" ? v.padStart(f.len) : v.padEnd(f.len), p, "latin1");
      p += f.len;
    }
  });
  buf[buf.length - 1] = 0x1a;
  return buf;
}
