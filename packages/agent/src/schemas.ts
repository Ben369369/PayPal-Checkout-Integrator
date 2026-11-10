import { z } from "zod";

export const RepoMapSchema = z.object({
  framework: z.string().describe("e.g. 'Next.js 16 App Router, TypeScript'"),
  packageManager: z.string(),
  orm: z.string().describe("e.g. 'Prisma 7 with SQLite'"),
  checkoutEntry: z.object({
    files: z.array(z.string()),
    description: z.string().describe("Where the buyer starts checkout and which UI shows the Stripe button"),
  }),
  cart: z.object({
    files: z.array(z.string()),
    description: z.string().describe("How the cart is stored and how the server computes totals"),
  }),
  orderModel: z.object({
    prismaModel: z.string(),
    files: z.array(z.string()),
    statusValues: z.array(z.string()),
    description: z.string().describe("Order lifecycle and the functions that create/pay/refund/cancel orders"),
  }),
  stripeFiles: z.array(z.string()).describe("Every file that contains Stripe-specific code. These must never be modified."),
  successPage: z.object({ route: z.string(), file: z.string(), description: z.string() }),
  adminRefund: z.object({ files: z.array(z.string()), description: z.string() }),
  webhookIdempotency: z.string().describe("How processed webhook events are recorded, if at all"),
  migrations: z.string().describe("Where migrations live and how they are applied"),
  envExampleFile: z.string().nullable(),
  notes: z.array(z.string()),
});
export type RepoMap = z.infer<typeof RepoMapSchema>;

export const PlanFileSchema = z.object({
  path: z.string().describe("Path relative to the project root"),
  action: z.enum(["create", "edit"]),
  stage: z.enum(["dependencies", "database", "server", "client", "config"]),
  purpose: z.string(),
});

export const FilePlanSchema = z.object({
  summary: z.string(),
  files: z.array(PlanFileSchema).min(1),
  dependencies: z.array(z.string()).describe("npm packages to add, e.g. '@paypal/paypal-server-sdk'"),
  envVars: z.array(z.string()),
  risks: z.array(z.string()),
});
export type FilePlan = z.infer<typeof FilePlanSchema>;

export const FinishSchema = z.object({
  summary: z.string().describe("What you implemented or changed"),
  couldNotVerify: z.array(z.string()).describe("Anything you could not verify yourself"),
});
export type FinishReport = z.infer<typeof FinishSchema>;
