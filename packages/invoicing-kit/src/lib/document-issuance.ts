import type { InvoicingKitHooks } from "../config";
import type { DocumentNumberingService } from "./numbering";
import type { MoneySettings } from "./money/settings";
import type { DecimalString, Document, DocumentSide, MoneyPolicy } from "../types";
import { ExchangeRateSource } from "../types";
import type { AmountTotals } from "./money/calculate";
import { LEGACY_MONEY_POLICY } from "./money/policy";
import {
  ExchangeRateFrozenException,
  exchangeOf,
  manualRateBaseCurrency,
  resolveIssueExchange,
  type DocumentExchange,
} from "./exchange";
import type { DocumentUpdate, DocumentWithRelations, NewDocumentLineItem, Repositories } from "../adapters/types";
import { buildDocumentLines, lineInputsOf, type DocumentLineInput } from "./document-lines";

export interface DocumentServiceOptions {
  hooks?: InvoicingKitHooks;
  money?: MoneySettings;
  numbering?: DocumentNumberingService;
}

export interface DocumentWritePlan {
  /** Policy the amounts are computed under. */
  policy: MoneyPolicy;
  /** This write is the document's first issue: policy and rate get frozen. */
  issuing: boolean;
  /** Policy and rate were frozen before this write (issued under 0.17+, or issued before 0.17). */
  frozen: boolean;
  /** Rate the base amounts are computed with; null when none applies. */
  exchange: DocumentExchange | null;
  /** A draft's manual rate: stored, not yet converted with. */
  draftRate: { baseCurrency: string; rate: DecimalString } | null;
}

export interface PlanDocumentWriteArgs {
  money: MoneySettings;
  organizationId: string;
  /** Stored document on update; null on create. */
  existing: Document | null;
  /** Whether the stored sidecar status is draft (true on create). */
  existingIsDraft: boolean;
  /** Whether the document is a draft after this write. */
  willBeDraft: boolean;
  currency: string;
  issueDate: Date;
  /** Request body `exchangeRate`: undefined = not sent, null = clear. */
  requestedRate: DecimalString | null | undefined;
  /** Notes: the referenced document's frozen rate and policy. */
  referenced?: { exchange: DocumentExchange | null; policy: MoneyPolicy | null };
}

function storedManualRate(document: Document | null): DecimalString | null {
  return document?.exchangeRateSource === ExchangeRateSource.Manual ? document.exchangeRate : null;
}

/** A document is frozen once it's been issued: either it carries a recorded policy (issued under 0.17+), or its sidecar status is no longer draft (issued before 0.17, or the caller's own status field). */
export function isFrozen(document: Document, isDraft: boolean): boolean {
  return document.moneyPolicy !== null || !isDraft;
}

/** Decides the policy and rate for one document write. Call before opening the write transaction. */
export async function planDocumentWrite(args: PlanDocumentWriteArgs): Promise<DocumentWritePlan> {
  const existing = args.existing;
  if (existing !== null && isFrozen(existing, args.existingIsDraft)) {
    if (args.requestedRate !== undefined) throw ExchangeRateFrozenException();
    return {
      policy: existing.moneyPolicy ?? LEGACY_MONEY_POLICY,
      issuing: false,
      frozen: true,
      exchange: exchangeOf(existing),
      draftRate: null,
    };
  }

  // A note issues at its reference's frozen rate (spec §6): any manual rate, stored
  // or requested, is ignored once the reference carries one.
  const referencedExchange = args.referenced?.exchange ?? null;
  const manualRate =
    referencedExchange !== null
      ? null
      : args.requestedRate !== undefined
        ? args.requestedRate
        : storedManualRate(existing);
  const draftRate =
    manualRate === null
      ? null
      : { baseCurrency: await manualRateBaseCurrency(args.money, args.organizationId, args.currency), rate: manualRate };
  const policy = args.referenced?.policy ?? (await args.money.policyFor(args.organizationId));
  if (args.willBeDraft) return { policy, issuing: false, frozen: false, exchange: null, draftRate };

  const exchange = await resolveIssueExchange({
    money: args.money,
    organizationId: args.organizationId,
    currency: args.currency,
    issueDate: args.issueDate,
    manualRate: draftRate?.rate ?? null,
    referenced: referencedExchange,
  });
  return { policy, issuing: true, frozen: false, exchange, draftRate: null };
}

export interface DocumentMoneyFields {
  /** Set once, at issue. A draft never writes this key (its policy is already null). */
  moneyPolicy?: MoneyPolicy;
  baseCurrency?: string | null;
  exchangeRate?: DecimalString | null;
  exchangeRateDate?: Date | null;
  exchangeRateSource?: ExchangeRateSource | null;
  baseSubtotal?: bigint | null;
  baseTax?: bigint | null;
  baseTotal?: bigint | null;
}

/** The money fields a write stores. `base` is the recomputed calculation's base totals. */
export function documentMoneyFields(plan: DocumentWritePlan, base: AmountTotals | null): DocumentMoneyFields {
  const baseAmounts = { baseSubtotal: base?.subtotal ?? null, baseTax: base?.tax ?? null, baseTotal: base?.total ?? null };
  if (plan.frozen) return baseAmounts;
  if (plan.issuing) {
    return {
      moneyPolicy: plan.policy,
      baseCurrency: plan.exchange?.baseCurrency ?? null,
      exchangeRate: plan.exchange?.rate ?? null,
      exchangeRateDate: plan.exchange?.rateDate ?? null,
      exchangeRateSource: plan.exchange?.source ?? null,
      ...baseAmounts,
    };
  }
  return {
    baseCurrency: plan.draftRate?.baseCurrency ?? null,
    exchangeRate: plan.draftRate?.rate ?? null,
    exchangeRateDate: null,
    exchangeRateSource: plan.draftRate ? ExchangeRateSource.Manual : null,
    baseSubtotal: null,
    baseTax: null,
    baseTotal: null,
  };
}

export interface ApplyDocumentPlanArgs {
  document: DocumentWithRelations;
  organizationId: string;
  side: DocumentSide;
  plan: DocumentWritePlan;
  /** Request lines (their products get resolved); defaults to the document's stored lines, which keep their products (a recompute with no line change, e.g. at issue). */
  lineItems?: readonly DocumentLineInput[];
}

export interface DocumentPlanBuild {
  lineItems: NewDocumentLineItem[];
  /** Totals + money fields the caller writes with `tx.documents.update`. */
  patch: DocumentUpdate;
}

/**
 * Recomputes a document's lines under `plan`. Pure: reads via `tx` (line items,
 * products, taxes) but writes nothing, so a caller can inspect the recomputed
 * total (e.g. to decide whether a write should happen at all) before committing
 * to it. Pair with `writeDocumentPlan` to actually store the result.
 */
export async function buildDocumentPlan(tx: Repositories, args: ApplyDocumentPlanArgs): Promise<DocumentPlanBuild> {
  const built = await buildDocumentLines({
    repos: tx,
    organizationId: args.organizationId,
    currency: args.document.currency,
    side: args.side,
    lineItems: args.lineItems ?? lineInputsOf(args.document),
    policy: args.plan.policy,
    exchangeRate: args.plan.exchange?.rate ?? null,
  });
  return { lineItems: built.lineItems, patch: { ...built.totals, ...documentMoneyFields(args.plan, built.base) } };
}

/** Writes a `buildDocumentPlan` result: replaces the line items and patches the document. */
export async function writeDocumentPlan(
  tx: Repositories,
  documentId: string,
  organizationId: string,
  build: DocumentPlanBuild,
): Promise<void> {
  await tx.documents.replaceLineItems(documentId, organizationId, build.lineItems);
  await tx.documents.update(documentId, organizationId, build.patch);
}

/**
 * Recomputes a document's lines under `plan`, replaces the stored line items, and
 * returns the patch (totals + money fields) the caller writes with `tx.documents.update`.
 * Used identically by invoice update, issue-freezing and any write that always wants
 * both the recompute and the line-item write to happen together.
 */
export async function applyDocumentPlan(tx: Repositories, args: ApplyDocumentPlanArgs): Promise<DocumentUpdate> {
  const build = await buildDocumentPlan(tx, args);
  await tx.documents.replaceLineItems(args.document.id, args.organizationId, build.lineItems);
  return build.patch;
}
