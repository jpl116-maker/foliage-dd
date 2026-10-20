import type { DdDocument } from "@/lib/types";

const DETAIL_BY_ID: Record<string, string> = {
  "d-org-1":
    "Filed certificate of incorporation and every restatement and amendment, including the 2019 REIT-conversion restatement.",
  "d-org-2":
    "Current bylaws, including the ownership limit, excess-share mechanics, and any transfer restrictions.",
  "d-org-3":
    "Counsel REIT opinion, with a bring-down to signing, covering the 75/95 income tests, 75/25 asset tests, and the distribution requirement.",
  "d-org-4":
    "Legal-entity chart through the OP, each TRS, and material JVs, with ownership percentages and tax classification.",
  "d-org-5":
    "Board and committee minutes for 2023–2025 on dividends, asset sales, TRS activity, and REIT compliance.",
  "d-org-6":
    "Shareholder, investor-rights, and registration-rights agreements, including any side letters with 5%+ holders.",
  "d-org-7":
    "Formation documents and operating agreement for Oakridge Services LLC and each TRS, plus the filed Form 8875 elections.",
  "d-fed-1":
    "Filed 2025 Form 1120-REIT with all schedules and the 95% / 75% income-test and asset-test workpapers.",
  "d-fed-2":
    "Filed 2024 Form 1120-REIT with all schedules, statements, and any Form 8275 / 8275-R disclosures.",
  "d-fed-3":
    "Filed 2023 Form 1120-REIT with all schedules, statements, and the income- and asset-test support.",
  "d-fed-4":
    "Form 7004 filings and IRS acknowledgements for 2023–2025, showing the extended due dates actually used.",
  "d-fed-5":
    "2025 Schedule M-3 and the book-to-tax workpapers that tie to the 1120-REIT, including permanent vs. temporary items.",
  "d-fed-6":
    "2026 estimated-tax vouchers, payment confirmations, and the computation of required installments.",
  "d-fed-7":
    "Form 8875 TRS elections for every TRS, with the effective date and the securities-of-TRS asset-test support.",
  "d-salt-1":
    "California Form 100 combined returns for 2024–2025, including the member listing and any DRE inclusion analysis.",
  "d-salt-2":
    "New York CT-3 filings for 2024–2025, including nexus, apportionment, and any combined/group elections.",
  "d-salt-3":
    "Illinois combined return for 2024, including the unitary-group schedule and intercompany eliminations.",
  "d-salt-4":
    "Grant Thornton nexus study (2025) listing states, taxes treated as income taxes, and entities in each filing.",
  "d-salt-5":
    "Unclaimed-property filings for 2023–2025, or the Keane (or other vendor) export covering all operating entities.",
  "d-salt-6":
    "Texas margin-tax and Delaware franchise-tax filings for 2025, with the computations and payment confirmations.",
  "d-ptn-1":
    "2025 operating-partnership Schedules K-1, with capital-account rollforwards and the allocation footnotes.",
  "d-ptn-2":
    "Seventh amended and restated OP agreement, including related-party rent, distribution, and tax-allocation provisions.",
  "d-ptn-3":
    "Joint-venture agreements for the four JV properties, including tax elections, promote, and buy-sell mechanics.",
  "d-ptn-4":
    "Section 754 election statements at the OP and each JV that has an election in place, with the year of election.",
  "d-ptn-5":
    "TRS Schedules K-1 for 2023–2025, including parking, housekeeping, and any related-party rent reported to the REIT.",
  "d-ptn-6":
    "2024 DownREIT / UPREIT contribution agreements, 704(c) layers, and the tax-opinion or representation exhibits.",
  "d-att-1":
    "Federal NOL and capital-loss carryforward schedule, by year of origin, with §382 limitation computations.",
  "d-att-2":
    "Current and accumulated E&P study through 2025, tying to ordinary vs. capital / return-of-capital dividend characterization.",
  "d-att-3":
    "Tax-basis balance sheet as of 6/30/2026, with inside/outside basis and book-tax differences by account.",
  "d-att-4":
    "Section 382 ownership-change analysis covering the testing period, including the 2022 private placement.",
  "d-att-5":
    "Built-in gains inventory for C-corp conversion properties, with remaining recognition period and built-in gain by asset.",
  "d-att-6":
    "Tax-credit carryforward schedule for open years, or written confirmation that no credits were claimed.",
  "d-prp-1":
    "Tax depreciation schedules for all assets, including lives, methods, bonus, and QIP, tying to the fixed-asset register.",
  "d-prp-2":
    "Signed Parkview Plaza cost-segregation study (2022), with the engineer’s stamp and the allocation exhibit.",
  "d-prp-3":
    "Signed Harbor Court cost-segregation study (2021), with the allocation exhibit and remaining tax basis by class.",
  "d-prp-4":
    "2026 property-tax assessments, bills, and payment status for each parcel, including any exemptions.",
  "d-prp-5":
    "Transfer-tax exposure memo covering NYC RPTT, Maryland recordation, and the stock-deal vs. asset-deal fallback.",
  "d-prp-6":
    "2024 §1031 files: identification letters, QI statements, replacement-property closing statements, and basis carryover.",
  "d-prp-7":
    "Rent roll and lease abstracts as of 8/31/2026, including term, rent, recoveries, and any prepaid or deferred rent.",
  "d-cmp-1":
    "2016 Equity Incentive Plan, all amendments, and a summary of outstanding awards and change-of-control treatment.",
  "d-cmp-2":
    "2025 §409A valuation report and the grant calendar tying option / unit awards to that valuation.",
  "d-cmp-3":
    "CEO and CFO employment agreements, including severance, 280G/4999, and any tax-gross-up language.",
  "d-cmp-4":
    "SERP / deferred-compensation plan documents, or confirmation of termination and that no participants remain.",
  "d-cmp-5":
    "Most recent IRS determination letter for the qualified plan, plus any subsequent amendments.",
  "d-con-1":
    "IRS exam file for the 2024 Form 1120-REIT: information document requests, responses, and the agent’s open items.",
  "d-con-2":
    "IDR log for all open exams, with dates, status, and copies of responses still outstanding.",
  "d-con-3":
    "Statute-of-limitations tracker for federal and material state returns, including any Form 872 / comparable extensions.",
  "d-con-4":
    "California FTB information request on the 2023 combined report and all responses, including DRE inclusion.",
  "d-con-5":
    "Property-tax appeal notices and filings for 2025–2026, with hearing dates and amounts in controversy.",
  "d-con-6":
    "Draft or filed private-letter-ruling request on TRS rental, plus any IRS correspondence.",

  "d-apa-1": "Last year's income statements.",
  "d-apa-2": "Fixed Asset GL for last year.",
  "d-apa-3": "Property-level rent rolls or equivalent.",
  "d-apa-4":
    "Schedule of liabilities the buyer will assume, with tax characterization (capital vs. deductible vs. 197).",
  "d-ttl-1": "Completed property services questionnaire.",
  "d-ttl-2":
    "Description of parking situation and/or agreements with any parking contractors.",
  "d-ttl-3": "Copies of any contracts with service providers.",
  "d-fed-a1":
    "Seller Forms 1065 for 2023–2025, including K-1s, foreign-partner footnotes, and the USRPHC / FIRPTA statements.",
  "d-fed-a2":
    "Fixed-asset register as of 8/31/2026, tax vs. book lives, bonus, and QIP, tying to the depreciation schedules.",
  "d-fed-a3":
    "Unrecaptured §1250 gain workpaper by asset, including depreciation allowed or allowable in the seller’s hands.",
  "d-rec-1":
    "Signed Richmond DC cost-segregation study (2022), with the engineer’s stamp and remaining tax basis by class.",
  "d-rec-2":
    "Signed Sparrows Point cost-segregation study (2020), with the allocation exhibit and remaining tax basis by class.",
  "d-rec-3":
    "Capex-vs-repair memo for 2024–2026, including the Fredericksburg roof and any other items booked as repairs.",
  "d-xfr-1":
    "Virginia and Maryland recordation-tax calculation on the asset deal, with rates, base, and any entity-deal comparison.",
  "d-xfr-2":
    "2026 property-tax assessments and bills for each Harbor parcel, including exemptions and amounts due at closing.",
  "d-xfr-3":
    "Local-counsel transfer-tax opinion covering recordation / RPTT on the asset purchase, needed before allocating closing costs.",
  "d-lse-1":
    "Rent roll as of 8/31/2026, with tenant, square footage, rent, recoveries, term, and any prepaid or deferred rent.",
  "d-lse-2":
    "Lease abstracts for the top ten tenants, including rent, term, options, TI, and assignment / recapture provisions.",
  "d-lse-3":
    "Section 467 prepaid-rent schedule identifying each prepaying tenant, the amount, the period, and the method the buyer inherits.",
  "d-fir-1":
    "FIRPTA affidavits of non-foreign status for the partnership and each transferor, covering every foreign partner.",
  "d-fir-2":
    "Withholding calculation under §1445 and §1446(f), by partner, with any certificate or reduced-rate agreement relied on.",
  "d-fir-3":
    "Non-foreign certificates for the remaining U.S. members, executed and in form acceptable to the withholding agent.",
  "d-con-a1": "Seller's transfer tax opinion.",
  "d-con-a2":
    "Seller statute-of-limitations tracker for federal, state, and local returns on the entities that hold the assets.",
};

export function fallbackRequestDetail(name: string, period?: string): string {
  const when = period ? ` for ${period}` : "";
  return `Complete copy of ${name}${when}, including all schedules, exhibits, and amendments.`;
}

export function requestDetailFor(
  doc: Pick<DdDocument, "id" | "name" | "period">,
): string {
  return DETAIL_BY_ID[doc.id] ?? fallbackRequestDetail(doc.name, doc.period);
}
