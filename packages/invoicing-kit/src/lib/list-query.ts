export type SortDir = "asc" | "desc";

export type InvoiceSortField =
  | "issueDate"
  | "dueDate"
  | "total"
  | "documentNumber"
  | "status";

export type QuoteSortField =
  | "issueDate"
  | "validUntil"
  | "total"
  | "documentNumber"
  | "status";

interface SearchableDocument {
  documentNumberPrefix: string | null;
  documentNumber: number;
}

interface SearchableClient {
  name?: string | null;
  taxId?: string | null;
}

const ms = (d: Date | null | undefined): number => (d ? d.getTime() : 0);
const big = (v: bigint | null | undefined): bigint => v ?? 0n;
const dir = (d: SortDir | undefined): SortDir => d ?? "desc";

/**
 * Prisma `where` fragment for free-text search over a document and its client.
 * Matches the prefix, the raw number, the client name, the client taxId, and —
 * when the query parses to an integer — the exact documentNumber. Returns
 * `undefined` for an empty query so callers can spread it conditionally.
 */
export function documentSearchWhere(
  query: string | undefined,
): { OR: Array<Record<string, unknown>> } | undefined {
  const q = query?.trim();
  if (!q) return undefined;
  const OR: Array<Record<string, unknown>> = [
    { documentNumberPrefix: { contains: q, mode: "insensitive" } },
    { client: { name: { contains: q, mode: "insensitive" } } },
    { client: { taxId: { contains: q, mode: "insensitive" } } },
  ];
  const n = Number(q);
  if (Number.isInteger(n)) OR.push({ documentNumber: n });
  return { OR };
}

export function invoiceListOrderBy(
  sortBy: InvoiceSortField | undefined,
  sortDir: SortDir | undefined,
): Record<string, unknown> {
  const d = dir(sortDir);
  switch (sortBy) {
    case "issueDate":
      return { document: { issueDate: d } };
    case "dueDate":
      return { document: { dueDate: d } };
    case "total":
      return { document: { total: d } };
    case "documentNumber":
      return { document: { documentNumber: d } };
    case "status":
      return { status: d };
    default:
      return { document: { createdAt: "desc" } };
  }
}

export function quoteListOrderBy(
  sortBy: QuoteSortField | undefined,
  sortDir: SortDir | undefined,
): Record<string, unknown> {
  const d = dir(sortDir);
  switch (sortBy) {
    case "issueDate":
      return { document: { issueDate: d } };
    case "validUntil":
      return { validUntil: d };
    case "total":
      return { document: { total: d } };
    case "documentNumber":
      return { document: { documentNumber: d } };
    case "status":
      return { status: d };
    default:
      return { document: { createdAt: "desc" } };
  }
}

/** In-memory equivalent of `documentSearchWhere`, used by the memory adapters. */
export function matchesDocumentSearch(
  doc: SearchableDocument,
  client: SearchableClient | undefined,
  query: string | undefined,
): boolean {
  const q = query?.trim().toLowerCase();
  if (!q) return true;
  const prefix = (doc.documentNumberPrefix ?? "").toLowerCase();
  return (
    prefix.includes(q) ||
    String(doc.documentNumber).includes(q) ||
    `${prefix}${doc.documentNumber}`.includes(q) ||
    (client?.name ?? "").toLowerCase().includes(q) ||
    (client?.taxId ?? "").toLowerCase().includes(q)
  );
}

interface InvoiceSortRow {
  status: string;
  document: {
    issueDate: Date;
    dueDate: Date | null;
    total: bigint | null;
    documentNumber: number;
    createdAt: Date;
  };
}

interface QuoteSortRow {
  status: string;
  validUntil: Date | null;
  document: {
    issueDate: Date;
    total: bigint | null;
    documentNumber: number;
    createdAt: Date;
  };
}

const signed = (n: number | bigint, d: SortDir): number => {
  const v = typeof n === "bigint" ? (n > 0n ? 1 : n < 0n ? -1 : 0) : n;
  return d === "asc" ? v : -v;
};

export function sortInvoicesInMemory<T extends InvoiceSortRow>(
  rows: T[],
  sortBy: InvoiceSortField | undefined,
  sortDir: SortDir | undefined,
): T[] {
  const d = dir(sortDir);
  const sorted = [...rows];
  switch (sortBy) {
    case "issueDate":
      sorted.sort((a, b) => signed(ms(a.document.issueDate) - ms(b.document.issueDate), d));
      break;
    case "dueDate":
      sorted.sort((a, b) => signed(ms(a.document.dueDate) - ms(b.document.dueDate), d));
      break;
    case "total":
      sorted.sort((a, b) => signed(big(a.document.total) - big(b.document.total), d));
      break;
    case "documentNumber":
      sorted.sort((a, b) => signed(a.document.documentNumber - b.document.documentNumber, d));
      break;
    case "status":
      sorted.sort((a, b) => signed(a.status.localeCompare(b.status), d));
      break;
    default:
      sorted.sort((a, b) => ms(b.document.createdAt) - ms(a.document.createdAt));
  }
  return sorted;
}

export function sortQuotesInMemory<T extends QuoteSortRow>(
  rows: T[],
  sortBy: QuoteSortField | undefined,
  sortDir: SortDir | undefined,
): T[] {
  const d = dir(sortDir);
  const sorted = [...rows];
  switch (sortBy) {
    case "issueDate":
      sorted.sort((a, b) => signed(ms(a.document.issueDate) - ms(b.document.issueDate), d));
      break;
    case "validUntil":
      sorted.sort((a, b) => signed(ms(a.validUntil) - ms(b.validUntil), d));
      break;
    case "total":
      sorted.sort((a, b) => signed(big(a.document.total) - big(b.document.total), d));
      break;
    case "documentNumber":
      sorted.sort((a, b) => signed(a.document.documentNumber - b.document.documentNumber, d));
      break;
    case "status":
      sorted.sort((a, b) => signed(a.status.localeCompare(b.status), d));
      break;
    default:
      sorted.sort((a, b) => ms(b.document.createdAt) - ms(a.document.createdAt));
  }
  return sorted;
}
