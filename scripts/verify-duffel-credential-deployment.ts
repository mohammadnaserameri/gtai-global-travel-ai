/** Deterministic verification for GTAI V2.8-D credential deployment planning. */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  DUFFEL_SHIPPED_ACTIVATION_DIRECTIVE,
  guardDuffelActivation,
} from "../src/server/flights/providers/duffel/duffel-activation-guard";
import {
  DUFFEL_TOKEN_REDACTION_LABEL,
  redactDuffelHeaders,
  redactDuffelText,
} from "../src/server/flights/providers/duffel/duffel-credential-redaction";
import {
  credentialResolutionActivationState,
  DUFFEL_FORBIDDEN_PUBLIC_TOKEN_NAME,
  DUFFEL_SERVER_TOKEN_NAME,
  isConservativeDuffelTokenShape,
  resolveDuffelCredential,
  summarizeDuffelCredential,
} from "../src/server/flights/providers/duffel/duffel-credential-resolver";
import { DUFFEL_ACTIVATION_STATE } from "../src/server/flights/providers/duffel/duffel-contract";
import { runtimeProviderRegistry } from "../src/server/flights/providers/provider-registry";

let passed = 0;
const failures: string[] = [];

function check(name: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) === JSON.stringify(expected)) passed += 1;
  else {
    failures.push(
      `${name}\n    expected ${JSON.stringify(expected)}\n    actual   ${JSON.stringify(actual)}`,
    );
  }
}

function ok(name: string, condition: boolean): void {
  check(name, condition, true);
}

const root = process.cwd();
const absolute = (path: string): string => join(root, path);
const read = (path: string): string => readFileSync(absolute(path), "utf8");
const exists = (path: string): boolean => existsSync(absolute(path));
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1 ");

function filesUnder(
  relativeDirectory: string,
  extensions = /\.(ts|tsx|json|md)$/,
): string[] {
  const directory = absolute(relativeDirectory);
  if (!existsSync(directory)) return [];
  const files: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (extensions.test(entry)) files.push(full);
    }
  };
  walk(directory);
  return files;
}

function sourceOf(files: readonly string[], comments = false): string {
  return files
    .map((file) => {
      const source = readFileSync(file, "utf8");
      return comments ? source : stripComments(source);
    })
    .join("\n");
}

function countMatches(source: string, pattern: RegExp): number {
  return [...source.matchAll(pattern)].length;
}

async function main(): Promise<void> {
  const resolverPath =
    "src/server/flights/providers/duffel/duffel-credential-resolver.ts";
  const redactionPath =
    "src/server/flights/providers/duffel/duffel-credential-redaction.ts";
  const guardPath =
    "src/server/flights/providers/duffel/duffel-activation-guard.ts";
  const transportPath = "src/server/flights/providers/duffel/duffel-transport.ts";
  const implementationDoc =
    "docs/implementation/V2_8_D_DUFFEL_TEST_CREDENTIAL_DEPLOYMENT_PLAN.md";

  const resolverSource = read(resolverPath);
  const resolverCode = stripComments(resolverSource);
  const redactionSource = read(redactionPath);
  const guardSource = read(guardPath);
  const transportCode = stripComments(read(transportPath));
  const registryCode = stripComments(
    read("src/server/flights/providers/provider-registry.ts"),
  );
  const envExample = read(".env.example");
  const gitignore = read(".gitignore");
  const doc = read(implementationDoc);
  const duffelFiles = filesUnder("src/server/flights/providers/duffel");
  const duffelCode = sourceOf(
    duffelFiles.filter(
      (file) => !/duffel-runtime-(?:adapter|transport)\.ts$/.test(file),
    ),
  );
  const publicFiles = [
    ...filesUnder("src/app"),
    ...filesUnder("src/components"),
    ...filesUnder("src/features"),
    ...filesUnder("src/i18n"),
    ...filesUnder("src/lib"),
  ];
  const publicCode = sourceOf(publicFiles);
  const dictionarySource = sourceOf(filesUnder("src/i18n"), true);
  const publicPageSource = sourceOf(
    filesUnder("src/app").filter(
      (file) => !file.includes(join("src", "app", "api")),
    ),
    true,
  );

  const validToken = ["duffel", "test", "A".repeat(36)].join("_");
  const invalidToken = "invalid-credential-shape";
  const missing = resolveDuffelCredential({});
  const empty = resolveDuffelCredential({ [DUFFEL_SERVER_TOKEN_NAME]: "  " });
  const present = resolveDuffelCredential({
    [DUFFEL_SERVER_TOKEN_NAME]: validToken,
  });
  const invalid = resolveDuffelCredential({
    [DUFFEL_SERVER_TOKEN_NAME]: invalidToken,
  });
  const forbidden = resolveDuffelCredential({
    [DUFFEL_SERVER_TOKEN_NAME]: validToken,
    [DUFFEL_FORBIDDEN_PUBLIC_TOKEN_NAME]: validToken,
  });

  /* Architecture. */
  ok("architecture: credential resolver exists", exists(resolverPath));
  ok("architecture: redactor exists", exists(redactionPath));
  ok("architecture: activation guard exists", exists(guardPath));
  ok(
    "architecture: resolver has server-only guard",
    /^import "\.\.\/\.\.\/\.\.\/server-only";/m.test(resolverSource),
  );
  ok(
    "architecture: redactor has server-only guard",
    /^import "\.\.\/\.\.\/\.\.\/server-only";/m.test(redactionSource),
  );
  ok(
    "architecture: guard has server-only guard",
    /^import "\.\.\/\.\.\/\.\.\/server-only";/m.test(guardSource),
  );
  ok(
    "architecture: resolver exported",
    /export function resolveDuffelCredential/.test(resolverCode),
  );
  ok(
    "architecture: summary exported",
    /export function summarizeDuffelCredential/.test(resolverCode),
  );
  ok(
    "architecture: raw accessor exported",
    /export function revealDuffelCredentialForFutureTransport/.test(resolverCode),
  );
  ok(
    "architecture: resolver default is process env",
    /environment[^=]*= process\.env/.test(resolverCode),
  );
  ok(
    "architecture: runtime registry excludes Duffel",
    !/duffel/i.test(registryCode),
  );
  check(
    "architecture: runtime registry count",
    runtimeProviderRegistry.allProviders().length,
    1,
  );
  check(
    "architecture: enabled provider count",
    runtimeProviderRegistry.enabledProviders().length,
    1,
  );
  check(
    "architecture: local provider active",
    runtimeProviderRegistry.enabledProviders()[0]?.providerId,
    "gtai-local-demo",
  );

  /* Environment policy. */
  check(
    "environment: sole server token name",
    DUFFEL_SERVER_TOKEN_NAME,
    "DUFFEL_ACCESS_TOKEN",
  );
  check(
    "environment: forbidden public token name",
    DUFFEL_FORBIDDEN_PUBLIC_TOKEN_NAME,
    "NEXT_PUBLIC_DUFFEL_ACCESS_TOKEN",
  );
  ok(
    "environment: resolver consumes server name",
    /environment\[DUFFEL_SERVER_TOKEN_NAME\]/.test(resolverCode),
  );
  ok(
    "environment: resolver checks forbidden name",
    /environment\[DUFFEL_FORBIDDEN_PUBLIC_TOKEN_NAME\]/.test(resolverCode),
  );
  ok(
    "environment: placeholder commented",
    /^# DUFFEL_ACCESS_TOKEN=$/m.test(envExample),
  );
  ok(
    "environment: placeholder empty",
    !/^# DUFFEL_ACCESS_TOKEN=\S+/m.test(envExample),
  );
  ok(
    "environment: no active token assignment",
    !/^DUFFEL_ACCESS_TOKEN=/m.test(envExample),
  );
  ok(
    "environment: V2.8-D token not required",
    /Not required in V2\.8-D/.test(envExample),
  );
  ok("environment: env local ignore rule", /^\.env\*/m.test(gitignore));
  ok(
    "environment: env local ignored and untracked",
    /^\.env\*/m.test(read(".gitignore")) &&
      !execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
        .split(/\r?\n/)
        .includes(".env.local"),
  );
  ok(
    "environment: package lock unchanged by feature",
    !/duffel/i.test(read("package-lock.json")),
  );
  for (const alias of [
    "DUFFEL_SECRET",
    "DUFFEL_API_KEY",
    "DUFFEL_TOKEN",
    "DUFFEL_LIVE_TOKEN",
    "DUFFEL_TEST_TOKEN",
  ]) {
    ok(
      `environment: forbidden alias absent ${alias}`,
      !new RegExp(`\\b${alias}\\b`).test(`${duffelCode}\n${envExample}\n${doc}`),
    );
  }
  ok(
    "environment: no literal token-looking value in implementation",
    !/duffel_(?:test|live)_[A-Za-z0-9_-]{24,}/.test(
      `${duffelCode}\n${envExample}\n${doc}`,
    ),
  );
  ok(
    "environment: build has no token prerequisite",
    !/DUFFEL_ACCESS_TOKEN/.test(read("package.json").split('"scripts"')[0] ?? ""),
  );

  /* Resolution behavior. */
  check("resolution: missing state", missing.state, "missing");
  check("resolution: empty state", empty.state, "missing");
  check("resolution: present state", present.state, "presentButInactive");
  check("resolution: invalid state", invalid.state, "invalidShape");
  check("resolution: forbidden state", forbidden.state, "forbiddenPublicName");
  ok(
    "resolution: valid shape accepted",
    isConservativeDuffelTokenShape(validToken),
  );
  ok(
    "resolution: invalid shape rejected",
    !isConservativeDuffelTokenShape(invalidToken),
  );
  ok(
    "resolution: public name shadows server name safely",
    forbidden.state === "forbiddenPublicName",
  );
  for (const [name, resolution] of [
    ["missing", missing],
    ["empty", empty],
    ["present", present],
    ["invalid", invalid],
    ["forbidden", forbidden],
  ] as const) {
    check(
      `resolution: ${name} unavailable`,
      resolution.activationState,
      "unavailable",
    );
    check(
      `resolution: ${name} does not activate`,
      resolution.activatesProvider,
      false,
    );
    check(
      `resolution: ${name} activation helper`,
      credentialResolutionActivationState(resolution),
      "unavailable",
    );
  }
  ok("resolution: missing has no capsule", missing.credential === null);
  ok("resolution: invalid has no capsule", invalid.credential === null);
  ok("resolution: forbidden has no capsule", forbidden.credential === null);
  ok(
    "resolution: present has opaque capsule",
    present.state === "presentButInactive" && present.credential !== null,
  );
  if (present.state !== "presentButInactive")
    throw new Error("fixture credential did not resolve");
  check(
    "resolution: capsule interpolation redacted",
    `${present.credential}`,
    DUFFEL_TOKEN_REDACTION_LABEL,
  );
  check(
    "resolution: capsule JSON redacted",
    JSON.stringify(present.credential),
    JSON.stringify(DUFFEL_TOKEN_REDACTION_LABEL),
  );
  ok(
    "resolution: capsule object keys omit raw token",
    !Object.keys(present.credential).some((key) =>
      key.toLowerCase().includes("value"),
    ),
  );
  ok(
    "resolution: capsule JSON omits raw token",
    !JSON.stringify(present).includes(validToken),
  );
  ok(
    "resolution: interpolation omits raw token",
    !`${present.credential}`.includes(validToken),
  );
  ok(
    "resolution: raw accessor has definition only",
    countMatches(resolverCode, /revealDuffelCredentialForFutureTransport\s*\(/g) ===
      1,
  );
  ok(
    "resolution: inactive transport does not import resolver",
    !/credential-resolver|revealDuffelCredential/.test(transportCode),
  );

  /* Redaction. */
  const summary = summarizeDuffelCredential(present);
  const summaryJson = JSON.stringify(summary);
  const redactedHeaders = redactDuffelHeaders({
    Authorization: `Bearer ${validToken}`,
    "X-Access-Token": validToken,
    Accept: "application/json",
  });
  const redactedBearer = redactDuffelText(`Authorization: Bearer ${validToken}`);
  const redactedUrl = redactDuffelText(
    `https://example.test/path?token=${validToken}`,
  );
  check(
    "redaction: stable marker",
    DUFFEL_TOKEN_REDACTION_LABEL,
    "[redacted:duffel-token]",
  );
  check(
    "redaction: authorization header",
    redactedHeaders.authorization,
    DUFFEL_TOKEN_REDACTION_LABEL,
  );
  check(
    "redaction: access-token header",
    redactedHeaders["x-access-token"],
    DUFFEL_TOKEN_REDACTION_LABEL,
  );
  check(
    "redaction: bearer text",
    redactedBearer,
    `Authorization: ${DUFFEL_TOKEN_REDACTION_LABEL}`,
  );
  check("redaction: URL text", redactedUrl, DUFFEL_TOKEN_REDACTION_LABEL);
  check(
    "redaction: summary marker",
    summary.credential,
    DUFFEL_TOKEN_REDACTION_LABEL,
  );
  check("redaction: summary configured", summary.configured, true);
  check("redaction: summary source", summary.source, "server-env");
  check("redaction: summary reason", summary.reason, "present-but-inactive");
  ok(
    "redaction: header output omits raw token",
    !JSON.stringify(redactedHeaders).includes(validToken),
  );
  ok(
    "redaction: bearer output omits raw token",
    !redactedBearer?.includes(validToken),
  );
  ok("redaction: URL output omits raw token", !redactedUrl?.includes(validToken));
  ok(
    "redaction: summary output omits raw token",
    !summaryJson.includes(validToken),
  );
  ok(
    "redaction: marker omits token prefix",
    !DUFFEL_TOKEN_REDACTION_LABEL.includes("duffel_test"),
  );
  ok(
    "redaction: marker omits token suffix",
    !DUFFEL_TOKEN_REDACTION_LABEL.includes("AAAA"),
  );
  ok(
    "redaction: no console logging in credential modules",
    !/console\.(?:log|info|warn|error)\s*\(/.test(
      `${resolverCode}\n${stripComments(redactionSource)}\n${stripComments(guardSource)}`,
    ),
  );
  ok(
    "redaction: no token-bearing Error construction",
    !/new Error\([^)]*(?:token|credential)/i.test(resolverCode),
  );

  /* Activation guard. */
  check(
    "activation: shipped directive withheld",
    DUFFEL_SHIPPED_ACTIVATION_DIRECTIVE,
    "withheld",
  );
  check("activation: contract unavailable", DUFFEL_ACTIVATION_STATE, "unavailable");
  for (const [name, resolution] of [
    ["missing", missing],
    ["present", present],
    ["invalid", invalid],
    ["forbidden", forbidden],
  ] as const) {
    const decision = guardDuffelActivation(resolution);
    check(`activation: ${name} state`, decision.state, "unavailable");
    check(`activation: ${name} directive`, decision.directive, "withheld");
    check(`activation: ${name} not runnable`, decision.runnable, false);
  }
  check(
    "activation: present reason",
    guardDuffelActivation(present).reason,
    "activationDirectiveWithheld",
  );
  ok(
    "activation: no active future flag",
    !/DUFFEL_(?:ENABLED|ACTIVATE|ACTIVATION)\s*=/.test(
      `${duffelCode}\n${envExample}`,
    ),
  );
  ok(
    "activation: client cannot name provider",
    !/providerId|providerName|providerStrategy/.test(
      read("src/features/flights/flight-search-api-contract.ts")
        .split("ALLOWED_REQUEST_KEYS")[1]
        ?.split("]")[0] ?? "",
    ),
  );

  /* API, audit and client safety. */
  const apiBoundary = sourceOf([
    absolute("src/app/api/flights/search/route.ts"),
    absolute("src/server/flights/flight-search-response.ts"),
    absolute("src/features/flights/flight-search-api-contract.ts"),
  ]);
  ok(
    "boundary: API source omits server token name",
    !/DUFFEL_ACCESS_TOKEN/.test(apiBoundary),
  );
  ok(
    "boundary: API source omits forbidden public name",
    !/NEXT_PUBLIC_DUFFEL_ACCESS_TOKEN/.test(apiBoundary),
  );
  ok(
    "boundary: API source omits Authorization",
    !/Authorization\s*:/.test(apiBoundary),
  );
  ok(
    "boundary: public code omits token name",
    !/DUFFEL_ACCESS_TOKEN/.test(publicCode),
  );
  ok(
    "boundary: public code omits token-like value",
    !/duffel_(?:test|live)_[A-Za-z0-9_-]{24,}/.test(publicCode),
  );
  ok(
    "boundary: mapped offer fields omit token",
    !/token|credential|authorization/i.test(
      read("src/server/flights/providers/duffel/duffel-contract.ts").split(
        "DUFFEL_MAPPED_OFFER_FIELDS",
      )[1] ?? "",
    ),
  );
  ok(
    "boundary: failure module omits token",
    !/DUFFEL_ACCESS_TOKEN|revealDuffelCredential/.test(
      read("src/server/flights/providers/duffel/duffel-failures.ts"),
    ),
  );
  ok(
    "boundary: external audit omits token",
    !/DUFFEL_ACCESS_TOKEN|revealDuffelCredential/.test(
      read("src/server/flights/providers/external/external-provider-audit.ts"),
    ),
  );
  ok(
    "boundary: no persistent audit added",
    !/writeFile|appendFile|database|localStorage/.test(
      stripComments(
        read("src/server/flights/providers/external/external-provider-audit.ts"),
      ),
    ),
  );
  ok(
    "boundary: no raw Authorization log",
    !/console\.[a-z]+\([^)]*Authorization/i.test(duffelCode),
  );
  ok(
    "boundary: no raw URL log",
    !/console\.[a-z]+\([^)]*(?:url|origin)/i.test(duffelCode),
  );
  ok("client: no resolver import", !/duffel-credential-resolver/.test(publicCode));
  ok("client: no credential module import", !/duffel-credential/.test(publicCode));
  ok(
    "client: no transport import",
    !/providers\/duffel\/duffel-transport/.test(publicCode),
  );
  ok(
    "client: no fixtures import",
    !/providers\/duffel\/duffel-fixtures/.test(publicCode),
  );
  ok(
    "client: no server external import",
    !/server\/flights\/providers\/external/.test(publicCode),
  );
  ok(
    "client: dictionaries omit token",
    !/DUFFEL_ACCESS_TOKEN|NEXT_PUBLIC_DUFFEL_ACCESS_TOKEN/.test(dictionarySource),
  );
  ok(
    "client: public pages omit token",
    !/DUFFEL_ACCESS_TOKEN|NEXT_PUBLIC_DUFFEL_ACCESS_TOKEN/.test(publicPageSource),
  );

  const staticDirectory = absolute(".next/static");
  const staticSource = existsSync(staticDirectory)
    ? sourceOf(filesUnder(".next/static", /\.(?:js|css|json|map)$/), true)
    : "";
  ok("bundle: server token absent", !/DUFFEL_ACCESS_TOKEN/.test(staticSource));
  ok(
    "bundle: public token absent",
    !/NEXT_PUBLIC_DUFFEL_ACCESS_TOKEN/.test(staticSource),
  );
  ok(
    "bundle: bearer token absent",
    !/Bearer\s+[A-Za-z0-9._-]{20,}/.test(staticSource),
  );
  ok(
    "bundle: placeholder absent",
    !/<paste test token locally only>/.test(staticSource),
  );

  /* Network and regression. */
  ok(
    "network: inactive transport has no fetch",
    !/\bfetch\s*\(/.test(transportCode),
  );
  ok("network: Duffel modules have no fetch", !/\bfetch\s*\(/.test(duffelCode));
  ok("network: no axios", !/\baxios\b|node-fetch|undici/.test(duffelCode));
  check(
    "network: one allowlisted Duffel origin literal",
    countMatches(duffelCode, /https:\/\/api\.duffel\.com/g),
    1,
  );
  ok("network: no Skyscanner origin", !/skyscanner/i.test(duffelCode));
  ok("network: no Amadeus origin", !/amadeus/i.test(duffelCode));
  ok("network: no invalid call", !/fetch\s*\([^)]*\.invalid/.test(duffelCode));
  ok("commerce: no Orders endpoint", !/\/air\/orders|createOrder/.test(duffelCode));
  ok(
    "commerce: no Payments endpoint",
    !/\/air\/payments|createPayment/.test(duffelCode),
  );
  ok("commerce: no booking link", !/booking(?:Url|Link)\s*:/.test(duffelCode));
  ok(
    "commerce: no affiliate redirect",
    !/affiliate(?:Url|Redirect)\s*:/.test(duffelCode),
  );
  ok("privacy: no passenger given name", !/given_name\s*:/.test(duffelCode));
  ok("privacy: no passenger family name", !/family_name\s*:/.test(duffelCode));
  ok("privacy: no passport field", !/passport\s*:/.test(duffelCode));
  ok(
    "privacy: no loyalty field",
    !/loyalty_programme_accounts\s*:/.test(duffelCode),
  );
  const sitemapSource = read("src/app/sitemap.ts");
  const robotsSource = read("src/app/robots.ts");
  const localeSource = read("src/config/locales.ts");
  const profileSource = read("src/config/public-company-profile.ts");
  const authoredLocaleCount = countMatches(localeSource, /hasDictionary:\s*true/g);
  const publicKeyBlock =
    profileSource.match(
      /export const PUBLIC_PAGE_KEYS[^=]*=\s*\[([\s\S]*?)\];/,
    )?.[1] ?? "";
  const publicPageCount = countMatches(publicKeyBlock, /"[A-Za-z]+"/g);
  check(
    "regression: sitemap route count",
    authoredLocaleCount * (1 + publicPageCount),
    24,
  );
  ok(
    "regression: sitemap uses authored locales and public pages",
    /for \(const locale of dictionaryLocales\)/.test(sitemapSource) &&
      /for \(const key of PUBLIC_PAGE_KEYS\)/.test(sitemapSource),
  );
  ok(
    "regression: robots API exclusion",
    /allow:\s*"\/"/.test(robotsSource) &&
      /disallow:\s*\["\/api\/"\]/.test(robotsSource),
  );
  ok(
    "regression: results noindex source",
    /buildNonIndexableMetadata/.test(
      read("src/app/[locale]/flights/results/page.tsx"),
    ),
  );
  ok(
    "regression: details noindex source",
    /buildNonIndexableMetadata/.test(
      read("src/app/[locale]/flights/results/[offerId]/page.tsx"),
    ),
  );
  ok(
    "regression: shared noindex helper remains strict",
    /export function buildNonIndexableMetadata[\s\S]*?robots:\s*\{[\s\S]*?index:\s*false/.test(
      read("src/lib/seo/public-metadata.ts"),
    ),
  );
  ok("regression: public copy unchanged", !/duffel/i.test(publicCode));

  /* Documentation. */
  ok("documentation: implementation doc exists", exists(implementationDoc));
  ok("documentation: purpose documented", /Purpose and scope/.test(doc));
  ok(
    "documentation: local setup documented",
    /Future local setup/.test(doc) && /\.env\.local/.test(doc),
  );
  ok(
    "documentation: Vercel Preview documented",
    /Vercel setup/.test(doc) && /Preview first/.test(doc),
  );
  ok(
    "documentation: Production conditions documented",
    /Production only after/.test(doc),
  );
  ok("documentation: rotation guidance documented", /Rotation guidance/.test(doc));
  ok("documentation: screenshot warning documented", /screenshot/i.test(doc));
  ok("documentation: logging warning documented", /logs?/i.test(doc));
  ok("documentation: redaction documented", /\[redacted:duffel-token\]/.test(doc));
  ok("documentation: activation guard documented", /Activation guard/.test(doc));
  ok(
    "documentation: V2.8-E checklist documented",
    /Future V2\.8-E prerequisites/.test(doc),
  );
  ok(
    "documentation: no real token-looking value",
    !/duffel_(?:test|live)_[A-Za-z0-9_-]{24,}/.test(doc),
  );
  ok(
    "documentation: no public token setup instruction",
    !/NEXT_PUBLIC_DUFFEL_ACCESS_TOKEN\s*=/.test(doc),
  );
  ok(
    "documentation: no Vercel write command",
    !/vercel\s+env\s+(?:add|rm)|vercel\s+(?:deploy|--prod)/i.test(doc),
  );
  ok(
    "documentation: V2.8-C doc links forward",
    /V2_8_D_DUFFEL_TEST_CREDENTIAL_DEPLOYMENT_PLAN/.test(
      read("docs/implementation/V2_8_C_DUFFEL_TEST_ADAPTER_CONTRACT.md"),
    ),
  );
  ok(
    "documentation: runtime reference updated",
    /V2\.8-D credential deployment plan/.test(
      read("docs/reference/09_PROVIDER_RUNTIME.md"),
    ),
  );

  /* Non-vacuity: in-memory defects must flip the exact policy guards. */
  const envGuard = (source: string): boolean =>
    !/^DUFFEL_ACCESS_TOKEN=\S+/m.test(source) &&
    !/NEXT_PUBLIC_DUFFEL_ACCESS_TOKEN=/.test(source);
  const activationGuard = (source: string): boolean =>
    !/runnable:\s*true|state:\s*["']active/.test(source);
  const redactionGuard = (source: string): boolean =>
    !/credential:\s*validToken|rawToken/.test(source);
  const responseGuard = (source: string): boolean =>
    !/Authorization:\s*Bearer/.test(source);
  const clientGuard = (source: string): boolean =>
    !/duffel-credential-resolver/.test(source);
  const networkGuard = (source: string): boolean =>
    !/fetch\s*\([^)]*api\.duffel\.com/.test(source);
  const ordersGuard = (source: string): boolean => !/\/air\/orders/.test(source);
  const bookingGuard = (source: string): boolean => !/bookingUrl/.test(source);
  const dictionaryGuard = (source: string): boolean =>
    !/DUFFEL_ACCESS_TOKEN/.test(source);
  const defects: readonly [string, string, (source: string) => boolean, string][] =
    [
      [
        "public token name",
        envExample,
        envGuard,
        "NEXT_PUBLIC_DUFFEL_ACCESS_TOKEN=value",
      ],
      ["active env value", envExample, envGuard, "DUFFEL_ACCESS_TOKEN=value"],
      [
        "credential activates",
        guardSource,
        activationGuard,
        'state: "active", runnable: true',
      ],
      ["summary leaks", redactionSource, redactionGuard, "credential: validToken"],
      ["public bearer", apiBoundary, responseGuard, "Authorization: Bearer value"],
      [
        "client resolver import",
        publicCode,
        clientGuard,
        'from "duffel-credential-resolver"',
      ],
      [
        "Duffel fetch",
        transportCode,
        networkGuard,
        'fetch("https://api.duffel.com")',
      ],
      ["Orders endpoint", duffelCode, ordersGuard, '"/air/orders"'],
      ["booking link", duffelCode, bookingGuard, "bookingUrl: disabled"],
      [
        "dictionary token",
        dictionarySource,
        dictionaryGuard,
        "DUFFEL_ACCESS_TOKEN",
      ],
    ];
  for (const [name, baseline, guard, mutation] of defects) {
    ok(`non-vacuity baseline: ${name}`, guard(baseline));
    ok(`non-vacuity defect rejected: ${name}`, !guard(`${baseline}\n${mutation}`));
  }

  const total = passed + failures.length;
  if (total <= 96) failures.push(`verification count ${total} must exceed 96`);
  if (failures.length > 0) {
    console.error(
      `\nDuffel credential-deployment verification FAILED — ${failures.length} of ${passed + failures.length}\n`,
    );
    for (const failure of failures) console.error(`  ✗ ${failure}\n`);
    process.exit(1);
  }
  console.log(
    `Duffel credential-deployment verification passed — ${passed}/${total} checks`,
  );
  console.log("Non-vacuity proof passed — 10/10 representative defects rejected");
}

void main();
