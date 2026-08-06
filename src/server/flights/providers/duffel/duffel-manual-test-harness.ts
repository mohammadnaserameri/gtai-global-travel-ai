import "../../../server-only";

import {
  composeDuffelRuntimeAdapterForEligibleManualTest,
  type DuffelEligibleManualTestRuntimeAdapter,
} from "./duffel-runtime-adapter";
import {
  resolveDuffelCredential,
  type DuffelCredentialEnvironment,
} from "./duffel-credential-resolver";
import {
  createDuffelInternalManualTestRequest,
  evaluateDuffelManualTestGate,
  type DuffelManualTestGateDecision,
} from "./duffel-manual-test-gate";
import {
  createDuffelRuntimeTransport,
  type DuffelFetchLike,
  type DuffelRuntimeOperation,
  type DuffelRuntimeTransportResult,
} from "./duffel-runtime-transport";

const DEFAULT_FAKE_FETCH: DuffelFetchLike = async () => ({
  ok: true,
  status: 200,
  headers: { get: () => null },
  text: async () => '{"data":[]}',
});

export interface DuffelPreviewManualTestHarness {
  readonly harnessId: "duffel-preview-manual-test-harness";
  readonly fetchMode: "fake" | "injected-manual";
  readonly gate: DuffelManualTestGateDecision;
  readonly adapter: DuffelEligibleManualTestRuntimeAdapter | null;
  execute(
    operation: DuffelRuntimeOperation,
    context: {
      readonly signal: AbortSignal;
      readonly requestId: string;
      readonly deadlineAt: number;
    },
  ): Promise<
    | DuffelRuntimeTransportResult
    | { readonly ok: false; readonly reason: "gateWithheld" }
  >;
}

/**
 * Future local/Preview manual seam. Verification omits `fetch`, so it is fake
 * by default. Supplying a real fetch remains a separately approved operator
 * action and never occurs through the public registry or search route.
 */
export function createDuffelPreviewManualTestHarness(options: {
  readonly environment: DuffelCredentialEnvironment;
  readonly runtimeAdapterAvailable?: boolean;
  readonly fetch?: DuffelFetchLike;
}): DuffelPreviewManualTestHarness {
  const credential = resolveDuffelCredential(options.environment);
  const gate = evaluateDuffelManualTestGate({
    environment: options.environment,
    credential,
    runtimeAdapterAvailable: options.runtimeAdapterAvailable ?? true,
    internalRequest: createDuffelInternalManualTestRequest(),
  });
  let transport: ReturnType<typeof createDuffelRuntimeTransport> | null = null;
  let adapter: DuffelEligibleManualTestRuntimeAdapter | null = null;
  if (gate.eligible && credential.state === "presentButInactive") {
    transport = createDuffelRuntimeTransport({
      credential: credential.credential,
      fetch: options.fetch ?? DEFAULT_FAKE_FETCH,
    });
    adapter = composeDuffelRuntimeAdapterForEligibleManualTest(
      transport,
      credential,
      gate,
    );
  }
  return Object.freeze({
    harnessId: "duffel-preview-manual-test-harness" as const,
    fetchMode:
      options.fetch === undefined
        ? ("fake" as const)
        : ("injected-manual" as const),
    gate,
    adapter,
    execute: async (
      operation: DuffelRuntimeOperation,
      context: {
        readonly signal: AbortSignal;
        readonly requestId: string;
        readonly deadlineAt: number;
      },
    ) =>
      transport === null
        ? ({ ok: false, reason: "gateWithheld" } as const)
        : transport.execute(operation, context),
  });
}
