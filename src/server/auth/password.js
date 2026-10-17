import 'server-only';
import { hash, verify } from '@node-rs/argon2';

// Argon2id with OWASP-recommended parameters (19 MiB memory, 2 iterations).
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 };

export function hashPassword(password) {
  return hash(password, OPTIONS);
}

export async function verifyPassword(passwordHash, password) {
  if (!passwordHash) return false;
  try {
    return await verify(passwordHash, password);
  } catch {
    return false;
  }
}

// A fixed hash used to equalise timing when the account does not exist.
let dummyHash;
export async function burnPasswordCheck(password) {
  dummyHash ??= await hash('docsy-timing-equaliser', OPTIONS);
  await verifyPassword(dummyHash, password);
}
