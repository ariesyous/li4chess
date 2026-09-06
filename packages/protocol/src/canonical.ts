/** li4chess-canonical-json-v1: sorted object keys, finite ECMAScript JSON,
 * UTF-8, no whitespace. Arrays retain order; undefined object optionals vanish. */
export function canonicalJson(value: unknown): string {
  const parents = new Set<object>();
  function encode(item: unknown): string {
    if (item === null) return "null";
    if (typeof item === "string" || typeof item === "boolean") return JSON.stringify(item);
    if (typeof item === "number" && Number.isFinite(item)) return JSON.stringify(item);
    if (typeof item !== "object" || !item) throw new Error("Unsupported canonical JSON value");
    if (parents.has(item)) throw new Error("Cyclic canonical JSON value");
    if (Object.getOwnPropertySymbols(item).length) throw new Error("Symbol canonical JSON key");
    parents.add(item);
    let result: string;
    if (Array.isArray(item)) {
      const entries: string[] = [];
      for (let i = 0; i < item.length; i++) {
        if (!Object.hasOwn(item, i)) throw new Error("Sparse canonical JSON array");
        entries.push(encode(item[i]));
      }
      if (Object.keys(item).length !== item.length) throw new Error("Extra canonical JSON array property");
      result = `[${entries.join(",")}]`;
    } else {
      if (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) {
        throw new Error("Non-plain canonical JSON object");
      }
      const record = item as Record<string, unknown>;
      result = `{${Object.keys(record).sort().filter(key => record[key] !== undefined)
        .map(key => `${JSON.stringify(key)}:${encode(record[key])}`).join(",")}}`;
    }
    parents.delete(item);
    return result;
  }
  return encode(value);
}

export async function sha256(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return `sha256:${Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function equalCanonical(a: unknown, b: unknown): boolean { return canonicalJson(a) === canonicalJson(b); }
