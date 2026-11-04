import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const derive = promisify(scrypt) as (pin: string, salt: string, length: number) => Promise<Buffer>;

export const isValidPin = (pin: string) => /^\d{4}$/.test(pin);

export async function hashPin(pin: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await derive(pin, salt, 32)).toString("hex")}`;
}

export async function verifyPin(pin: string, stored: string) {
  const [salt, hash] = stored.split(":");
  return timingSafeEqual(await derive(pin, salt, 32), Buffer.from(hash, "hex"));
}
