import type { ReitTest } from "@/lib/types";
import type { WorkspaceId } from "@/lib/workspace";

const BASE_TESTS: Omit<ReitTest, "status">[] = [
  {
    id: "t-income",
    name: "REIT Income Test",
    detail:
      "75% and 95% gross income tests under §856(c)(2)–(3). Confirm rents from real property, interest, dividends, and gain from real-property interests; isolate non-qualifying income.",
    codeSection: "IRC § 856(c)(2)–(3)",
  },
  {
    id: "t-asset",
    name: "REIT Asset Test",
    detail:
      "Quarter-end 75% real-estate asset test and the 5%/10%/25% securities and TRS tests under §856(c)(4). Tie the test to the tax-basis balance sheet.",
    codeSection: "IRC § 856(c)(4)",
  },
  {
    id: "t-itsi",
    name: "ITSI test",
    detail:
      "Impermissible tenant service income under §856(d)(7). Confirm services to tenants run through a TRS or an independent contractor, and that ITSI stays inside the 1% de minimis.",
    codeSection: "IRC § 856(d)(7)",
  },
];

export function defaultReitTests(workspace: WorkspaceId): ReitTest[] {
  if (workspace === "entity") {
    return [
      { ...BASE_TESTS[0], status: "pass" },
      { ...BASE_TESTS[1], status: "open" },
      { ...BASE_TESTS[2], status: "fail" },
    ];
  }
  return BASE_TESTS.map((test) => ({ ...test, status: "open" as const }));
}

export function ensureReitTests<T extends { tests?: ReitTest[] }>(
  state: T,
  workspace: WorkspaceId,
): T & { tests: ReitTest[] } {
  const seed = defaultReitTests(workspace);
  if (!Array.isArray(state.tests) || state.tests.length === 0) {
    return { ...state, tests: seed };
  }
  const have = new Set(state.tests.map((t) => t.id));
  const missing = seed.filter((t) => !have.has(t.id));
  return { ...state, tests: [...state.tests, ...missing] };
}
