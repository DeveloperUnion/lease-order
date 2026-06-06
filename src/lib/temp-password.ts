import "server-only";
import { randomBytes } from "node:crypto";

// 紛らわしい文字（0/O, 1/l/I 等）を除いた英数字。初回発行/リセット用の
// 一時パスワードを生成する。customers 側の生成ロジックと同じ方針。
const ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateTempPassword(length = 12): string {
  const buf = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ALPHABET[buf[i] % ALPHABET.length];
  }
  return out;
}
