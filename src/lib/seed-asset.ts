import type {
  Category,
  DdDocument,
  DdState,
  Issue,
  Matter,
} from "@/lib/types";
import { requestsFromDocuments } from "@/lib/requests";
import { defaultReitTests } from "@/lib/reit-tests";

const matter: Matter = {
  id: "harbor",
  code: "PRJ-HBR",
  name: "Project Harbor",
  client: "Northbridge Capital Partners",
  target: "Harbor Logistics portfolio",
  ticker: "HBR",
  dealType: "Asset purchase",
  openedOn: "2026-08-25",
  dueOn: "2026-10-02",
};

const categories: Category[] = [
  {
    id: "apa",
    name: "Financials",
    blurb: "APA, 1060, residual method, assumed liabilities.",
  },
  {
    id: "title",
    name: "Property-Level Info",
    blurb: "Deeds, surveys, title commitments, prorations.",
  },
  {
    id: "controversy",
    name: "SALT Items",
    blurb: "Open exams, SOL, local appeals.",
  },
];

const documents: DdDocument[] = [
  {
    id: "d-apa-1",
    categoryId: "apa",
    name: "Financial Statements",
    kind: "pdf",
    status: "reviewed",
    reviewer: "A. Chen",
    receivedOn: "2026-09-08",
    notes: "",
  },
  {
    id: "d-apa-2",
    categoryId: "apa",
    name: "General Ledger",
    kind: "pdf",
    status: "reviewed",
    reviewer: "A. Chen",
    receivedOn: "2026-09-08",
    notes: "",
  },
  {
    id: "d-apa-3",
    categoryId: "apa",
    name: "Rent Rolls",
    kind: "xlsx",
    status: "reviewed",
    reviewer: "A. Chen",
    receivedOn: "2026-09-06",
    notes: "",
  },
  {
    id: "d-ttl-1",
    categoryId: "title",
    name: "PSQ",
    kind: "pdf",
    status: "received",
    reviewer: null,
    receivedOn: "2026-09-04",
    notes: "",
  },
  {
    id: "d-ttl-2",
    categoryId: "title",
    name: "Parking Information/Agreements",
    kind: "pdf",
    status: "received",
    reviewer: null,
    receivedOn: "2026-09-04",
    notes: "",
  },
  {
    id: "d-ttl-3",
    categoryId: "title",
    name: "Services Contracts",
    kind: "pdf",
    status: "received",
    reviewer: null,
    receivedOn: "2026-09-04",
    notes: "",
  },
  {
    id: "d-con-a1",
    categoryId: "controversy",
    name: "Transfer tax opinion",
    kind: "pdf",
    status: "reviewed",
    reviewer: "A. Chen",
    receivedOn: "2026-08-30",
    notes: "",
  },
];

const issues: Issue[] = [];

export const ASSET_SEED: DdState = {
  matter,
  categories,
  documents,
  issues,
  requests: requestsFromDocuments(documents),
  tests: defaultReitTests("asset"),
};
