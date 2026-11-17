const UTF8_BOM = [0xef, 0xbb, 0xbf];

const hasUtf8Bom = (b: Uint8Array) => UTF8_BOM.every((byte, i) => b[i] === byte);

/** Picks the body's encoding: BOM, then the XML declaration, then the HTTP charset, then UTF-8. */
export function detectCharset(body: Uint8Array, contentType: string | null): string {
  if (hasUtf8Bom(body)) return "utf-8";
  // The XML declaration is ASCII-compatible in every encoding we can decode.
  const head = new TextDecoder("latin1").decode(body.subarray(0, 200));
  const declared = head.match(/^\s*<\?xml[^>]*\bencoding\s*=\s*["']([\w.:-]+)["']/i)?.[1];
  if (declared) return declared.toLowerCase();
  const fromHeader = contentType?.match(/charset\s*=\s*"?([\w.:-]+)"?/i)?.[1];
  return fromHeader ? fromHeader.toLowerCase() : "utf-8";
}

export function decodeBody(body: Uint8Array, contentType: string | null): string {
  const charset = detectCharset(body, contentType);
  let decoder: TextDecoder;
  try {
    decoder = new TextDecoder(charset);
  } catch {
    decoder = new TextDecoder("utf-8");
  }
  // TextDecoder strips a BOM that matches its encoding by default.
  return decoder.decode(body);
}
