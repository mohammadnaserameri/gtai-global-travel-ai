/**
 * The contract fixture's identity, alone.
 *
 * Split into its own module so non-fixture code can *refuse* the fixture by id
 * without importing the fixture itself. `external-provider-configuration.ts`
 * needs to know the name in order to exclude it; importing the definition to
 * learn its own id would make the shipped configuration depend on the very
 * thing it exists to keep out, and a verification check asserts that it does
 * not.
 *
 * Types-only in spirit — one string constant, nothing to execute, so no
 * server-only guard is needed.
 */
export const CONTRACT_FIXTURE_PROVIDER_ID = "external-contract-fixture";
