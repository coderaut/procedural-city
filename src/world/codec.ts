/** Base64 for typed arrays, without depending on btoa or Buffer. */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const LOOKUP = (() => {
  const table = new Uint8Array(256).fill(255);
  for (let i = 0; i < ALPHABET.length; i++) table[ALPHABET.charCodeAt(i)] = i;
  return table;
})();

export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += ALPHABET[(n >>> 18) & 63]! + ALPHABET[(n >>> 12) & 63]! + ALPHABET[(n >>> 6) & 63]! + ALPHABET[n & 63]!;
  }
  const left = bytes.length - i;
  if (left === 1) {
    const n = bytes[i]! << 16;
    out += ALPHABET[(n >>> 18) & 63]! + ALPHABET[(n >>> 12) & 63]! + '==';
  } else if (left === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += ALPHABET[(n >>> 18) & 63]! + ALPHABET[(n >>> 12) & 63]! + ALPHABET[(n >>> 6) & 63]! + '=';
  }
  return out;
}

export function base64ToBytes(text: string): Uint8Array {
  // `clean` has already dropped the '=' padding, so the character count alone
  // gives the byte count -- subtracting the padding again would lose a byte.
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = LOOKUP[clean.charCodeAt(i)]!;
    const b = LOOKUP[clean.charCodeAt(i + 1)]!;
    const c = LOOKUP[clean.charCodeAt(i + 2)]!;
    const d = LOOKUP[clean.charCodeAt(i + 3)]!;
    const n = (a << 18) | (b << 12) | ((c & 63) << 6) | (d & 63);
    if (o < out.length) out[o++] = (n >>> 16) & 255;
    if (o < out.length) out[o++] = (n >>> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

/**
 * Elevation is stored as decimetres in an Int16, not a float32: it halves the
 * file (and keeps a big map inside the localStorage quota for autosave) while
 * 0.1 m precision is far finer than a brush can place ground anyway.
 */
export const HEIGHT_SCALE = 10;

export function heightToBase64(data: Float32Array): string {
  const scaled = new Int16Array(data.length);
  for (let i = 0; i < data.length; i++) {
    scaled[i] = Math.max(-32768, Math.min(32767, Math.round(data[i]! * HEIGHT_SCALE)));
  }
  return bytesToBase64(new Uint8Array(scaled.buffer, scaled.byteOffset, scaled.byteLength));
}

export function base64ToHeight(text: string, expected: number): Float32Array {
  const bytes = base64ToBytes(text);
  const view = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
  const out = new Float32Array(expected);
  const count = Math.min(expected, view.length);
  for (let i = 0; i < count; i++) out[i] = view[i]! / HEIGHT_SCALE;
  return out;
}

export function uint8ToBase64(data: Uint8Array): string {
  return bytesToBase64(data);
}

export function base64ToUint8(text: string, expected: number): Uint8Array {
  const bytes = base64ToBytes(text);
  const out = new Uint8Array(expected);
  out.set(bytes.subarray(0, Math.min(expected, bytes.length)));
  return out;
}
