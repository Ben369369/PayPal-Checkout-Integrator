import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

config({ path: [path.join(REPO_ROOT, ".env.local"), path.join(REPO_ROOT, ".env")], quiet: true });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set (put it in ${path.join(REPO_ROOT, ".env.local")})`);
  return value;
}

export type HarnessEnv = {
  paypalClientId: string;
  paypalClientSecret: string;
  buyerEmail: string;
  buyerPassword: string;
  stripeSecretKey: string;
};

export function loadEnv(overrides: Partial<HarnessEnv> = {}): HarnessEnv {
  if ((process.env.PAYPAL_ENV ?? "sandbox") !== "sandbox") throw new Error("The harness only runs against the PayPal sandbox");
  const pick = (key: keyof HarnessEnv, envName: string) => overrides[key] || required(envName);
  const stripeSecretKey = pick("stripeSecretKey", "STRIPE_SECRET_KEY");
  if (!stripeSecretKey.startsWith("sk_test_")) throw new Error("The Stripe key must be a test-mode key");
  return {
    paypalClientId: pick("paypalClientId", "PAYPAL_CLIENT_ID"),
    paypalClientSecret: pick("paypalClientSecret", "PAYPAL_CLIENT_SECRET"),
    buyerEmail: pick("buyerEmail", "PAYPAL_SANDBOX_BUYER_EMAIL"),
    buyerPassword: pick("buyerPassword", "PAYPAL_SANDBOX_BUYER_PASSWORD"),
    stripeSecretKey,
  };
}
