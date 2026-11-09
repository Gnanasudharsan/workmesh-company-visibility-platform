import * as argon2 from "argon2";

/** OWASP-recommended Argon2id parameters (19 MiB, t=2, p=1). */
const OPTIONS: argon2.Options & { raw?: false } = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export const hashPassword = (password: string) => argon2.hash(password, OPTIONS);

// Pre-computed hash used to keep login timing uniform when the email does not exist.
let dummyHash: Promise<string> | null = null;

export async function verifyPassword(hash: string | null, password: string): Promise<boolean> {
  if (!hash) {
    dummyHash ??= argon2.hash("workmesh-timing-equalizer", OPTIONS);
    await argon2.verify(await dummyHash, password).catch(() => false);
    return false;
  }
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export const PASSWORD_RULES = "At least 10 characters.";
