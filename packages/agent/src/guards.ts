import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { sanitizedEnv } from "./tools.js";

export type CheckResult = { name: string; pass: boolean; output: string };

const tail = (s: string, n = 6000) => (s.length > n ? `…${s.slice(-n)}` : s);

export function runStep(name: string, command: string, cwd: string, env: NodeJS.ProcessEnv): CheckResult {
  const res = spawnSync(command, { cwd, shell: true, encoding: "utf8", env: { ...sanitizedEnv(), ...env }, timeout: 900_000, maxBuffer: 50 * 1024 * 1024 });
  const output = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  return { name, pass: res.status === 0, output: tail(output) };
}

/** install, type check, lint, build. Stops at the first failure. */
export function buildChecks(appDir: string, env: NodeJS.ProcessEnv): CheckResult[] {
  const pkg = JSON.parse(readFileSync(path.join(appDir, "package.json"), "utf8")) as { scripts?: Record<string, string> };
  const scripts = pkg.scripts ?? {};
  const steps: [string, string][] = [
    ["install", "pnpm install --frozen-lockfile"],
    ["prisma generate", "pnpm exec prisma generate"],
    ["type check", scripts.typecheck ? "pnpm typecheck" : "pnpm exec tsc --noEmit"],
    ["lint", scripts.lint ? "pnpm lint" : "echo no lint script"],
    ["build", "pnpm build"],
  ];
  const results: CheckResult[] = [];
  for (const [name, cmd] of steps) {
    const r = runStep(name, cmd, appDir, env);
    results.push(r);
    if (!r.pass) break;
  }
  return results;
}

/**
 * Guard 1: every PayPal SDK method the new code calls exists in the installed types.
 * Uses the TypeScript checker: each call whose receiver's type is declared in
 * @paypal/paypal-server-sdk must resolve to a declared member, and SDK values must not be cast to `any`.
 */
export function sdkMethodGuard(appDir: string, files: string[]): CheckResult {
  const configPath = ts.findConfigFile(appDir, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) return { name: "SDK methods exist", pass: false, output: "No tsconfig.json found" };
  const parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, appDir);
  const targets = files.filter((f) => /\.(ts|tsx)$/.test(f)).map((f) => path.join(appDir, f)).filter(existsSync);
  const program = ts.createProgram({ rootNames: targets, options: { ...parsed.options, noEmit: true } });
  const checker = program.getTypeChecker();
  const verified = new Set<string>();
  const problems: string[] = [];
  const fromSdk = (decl: ts.Declaration | undefined) => Boolean(decl && decl.getSourceFile().fileName.replace(/\\/g, "/").includes("@paypal/paypal-server-sdk"));

  for (const file of targets) {
    const sf = program.getSourceFile(file);
    if (!sf) continue;
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const recvType = checker.getTypeAtLocation(node.expression.expression);
        const recvDecl = recvType.getSymbol()?.declarations?.[0];
        if (fromSdk(recvDecl)) {
          const member = checker.getSymbolAtLocation(node.expression.name);
          const where = `${path.relative(appDir, file).replace(/\\/g, "/")}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`;
          const name = `${recvType.getSymbol()?.getName()}.${node.expression.name.text}`;
          if (member && member.declarations?.some(fromSdk)) verified.add(name);
          else problems.push(`${where}: ${name} is not declared in @paypal/paypal-server-sdk`);
        }
      }
      if ((ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) && node.type.kind === ts.SyntaxKind.AnyKeyword) {
        const inner = checker.getTypeAtLocation(node.expression).getSymbol()?.declarations?.[0];
        if (fromSdk(inner)) problems.push(`${path.relative(appDir, file)}: a PayPal SDK value is cast to any, which hides unchecked calls`);
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  const pass = problems.length === 0 && verified.size > 0;
  const output = [
    `Verified against installed types: ${[...verified].sort().join(", ") || "(none found)"}`,
    ...problems,
    verified.size === 0 ? "No calls to @paypal/paypal-server-sdk were found in the changed files." : "",
  ]
    .filter(Boolean)
    .join("\n");
  return { name: "SDK methods exist", pass, output };
}

const ALWAYS_ALLOWED = new Set(["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "next-env.d.ts"]);

/** Guard 2: no files outside the plan changed. */
export function planScopeGuard(changed: string[], planPaths: string[]): CheckResult {
  const allowed = new Set(planPaths);
  const outside = changed.filter((f) => !allowed.has(f) && !ALWAYS_ALLOWED.has(f));
  return {
    name: "Only planned files changed",
    pass: outside.length === 0,
    output: outside.length ? `Changed outside the plan: ${outside.join(", ")}` : `${changed.length} changed files, all in the plan`,
  };
}

/** Guard 3: Stripe files untouched. */
export function stripeGuard(changed: string[], stripeFiles: string[]): CheckResult {
  const touched = changed.filter((f) => stripeFiles.includes(f));
  return {
    name: "Stripe files untouched",
    pass: touched.length === 0,
    output: touched.length ? `Modified Stripe files: ${touched.join(", ")}` : `${stripeFiles.length} Stripe files unchanged`,
  };
}

/** Guard 4: no secrets in the diff (known key formats, plus the exact values of configured secrets). */
export function secretsGuard(diff: string, knownSecrets: string[]): CheckResult {
  const added = diff
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .join("\n");
  const patterns: [string, RegExp][] = [
    ["Stripe secret key", /\b[sr]k_(test|live)_[A-Za-z0-9]{10,}/],
    ["Stripe webhook secret", /\bwhsec_[A-Za-z0-9]{10,}/],
    ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ["Anthropic key", /\bsk-ant-[A-Za-z0-9_-]{10,}/],
    ["bearer token", /Bearer\s+A21AA[A-Za-z0-9._-]{20,}/],
  ];
  const hits = patterns.filter(([, re]) => re.test(added)).map(([name]) => name);
  for (const secret of knownSecrets) if (secret.length >= 8 && added.includes(secret)) hits.push("a configured credential value");
  return { name: "No secrets in the diff", pass: hits.length === 0, output: hits.length ? `Found: ${[...new Set(hits)].join(", ")}` : "No secrets found" };
}
