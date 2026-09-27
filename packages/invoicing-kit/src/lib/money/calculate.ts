import type { BigintMinor, DecimalString, MoneyPolicy } from "../../types";
import { BaseTaxMethod, RoundingMode, TaxLevel, TaxType } from "../../types";
import { allocate } from "./allocate";
import { EXCHANGE_RATE_SCALE, QUANTITY_SCALE, TAX_RATE_SCALE, parseScaled, pow10 } from "./decimal";
import { roundDiv } from "./rounding";

export interface TaxDefinition {
  id: string;
  type: TaxType;
  rate: DecimalString;
}
export interface CalculationLineInput {
  quantity: DecimalString;
  price: BigintMinor;
  taxes: readonly TaxDefinition[];
}
export interface CalculateDocumentInput {
  lines: readonly CalculationLineInput[];
  policy: MoneyPolicy;
  /** Base-currency units per 1 document unit. Omit or null for no base amounts. */
  exchangeRate?: DecimalString | null;
}
export interface LineTaxCalculation {
  taxId: string;
  taxAmount: BigintMinor;
  baseTaxAmount: BigintMinor | null;
}
export interface LineCalculation {
  subtotal: BigintMinor;
  taxAmount: BigintMinor;
  total: BigintMinor;
  baseSubtotal: BigintMinor | null;
  taxes: LineTaxCalculation[];
}
export interface TaxTotal {
  taxId: string;
  amount: BigintMinor;
  baseAmount: BigintMinor | null;
}
export interface AmountTotals {
  subtotal: BigintMinor;
  tax: BigintMinor;
  total: BigintMinor;
}
export interface DocumentCalculation extends AmountTotals {
  base: AmountTotals | null;
  lines: LineCalculation[];
  taxTotals: TaxTotal[];
}

const QUANTITY_FACTOR = pow10(QUANTITY_SCALE);
const TAX_RATE_FACTOR = pow10(TAX_RATE_SCALE);
const EXCHANGE_RATE_FACTOR = pow10(EXCHANGE_RATE_SCALE);

interface TaxGroup {
  tax: TaxDefinition;
  occurrences: Array<{ line: number; position: number }>;
}
/** Tax amounts indexed [line][position in that line's taxes]. */
type TaxMatrix = bigint[][];

const sum = (values: readonly bigint[]) => values.reduce((total, value) => total + value, 0n);

function groupTaxes(lines: readonly CalculationLineInput[]): TaxGroup[] {
  const groups = new Map<string, TaxGroup>();
  lines.forEach((line, lineIndex) =>
    line.taxes.forEach((tax, position) => {
      const group = groups.get(tax.id) ?? { tax, occurrences: [] };
      group.occurrences.push({ line: lineIndex, position });
      groups.set(tax.id, group);
    }),
  );
  return [...groups.values()];
}

function emptyMatrix(lines: readonly CalculationLineInput[]): TaxMatrix {
  return lines.map((line) => line.taxes.map(() => 0n));
}

function readGroup(matrix: TaxMatrix, group: TaxGroup): bigint[] {
  return group.occurrences.map(({ line, position }) => matrix[line]![position]!);
}

function writeGroup(matrix: TaxMatrix, group: TaxGroup, amounts: readonly bigint[]): void {
  group.occurrences.forEach(({ line, position }, index) => {
    matrix[line]![position] = amounts[index]!;
  });
}

/** Percentage taxes on `bases` under the policy; fixed taxes are an amount per unit of quantity. */
function computeTaxes(
  lines: readonly CalculationLineInput[],
  groups: readonly TaxGroup[],
  bases: readonly bigint[],
  policy: MoneyPolicy,
): TaxMatrix {
  const matrix = emptyMatrix(lines);
  for (const group of groups) {
    const rate = parseScaled(group.tax.rate, TAX_RATE_SCALE);
    if (group.tax.type === TaxType.Fixed) {
      writeGroup(
        matrix,
        group,
        group.occurrences.map(({ line }) =>
          roundDiv(
            rate * parseScaled(lines[line]!.quantity, QUANTITY_SCALE),
            TAX_RATE_FACTOR * QUANTITY_FACTOR,
            policy.rounding,
          ),
        ),
      );
      continue;
    }
    const taxable = group.occurrences.map(({ line }) => bases[line]!);
    switch (policy.taxLevel) {
      case TaxLevel.Line:
        writeGroup(matrix, group, taxable.map((base) => roundDiv(base * rate, TAX_RATE_FACTOR, policy.rounding)));
        break;
      case TaxLevel.Document:
        writeGroup(matrix, group, allocate(roundDiv(sum(taxable) * rate, TAX_RATE_FACTOR, policy.rounding), taxable));
        break;
      default: {
        const unknown: never = policy.taxLevel;
        throw new RangeError(`Unknown tax level: ${JSON.stringify(unknown)}`);
      }
    }
  }
  return matrix;
}

/** Currency conversion always rounds half-up, whatever the policy. */
function convert(amount: bigint, rate: bigint): bigint {
  return roundDiv(amount * rate, EXCHANGE_RATE_FACTOR, RoundingMode.HalfUp);
}

/** Converts each group's total once and allocates it back over the group's lines. */
function convertGroups(target: TaxMatrix, source: TaxMatrix, groups: readonly TaxGroup[], rate: bigint): void {
  for (const group of groups) {
    const amounts = readGroup(source, group);
    writeGroup(target, group, allocate(convert(sum(amounts), rate), amounts));
  }
}

/**
 * Calculates line subtotals, taxes, and totals under a money policy with exact allocation.
 * All line subtotals must share the same sign (all non-negative or all non-positive).
 */
export function calculateDocument(input: CalculateDocumentInput): DocumentCalculation {
  const { lines, policy } = input;
  const groups = groupTaxes(lines);
  const subtotals = lines.map((line) =>
    roundDiv(parseScaled(line.quantity, QUANTITY_SCALE) * line.price, QUANTITY_FACTOR, policy.rounding),
  );
  const hasPositive = subtotals.some((s) => s > 0n);
  const hasNegative = subtotals.some((s) => s < 0n);
  if (hasPositive && hasNegative) {
    throw new RangeError("line subtotals must all have the same sign");
  }
  const taxes = computeTaxes(lines, groups, subtotals, policy);

  let baseSubtotals: bigint[] | null = null;
  let baseTaxes: TaxMatrix | null = null;
  if (input.exchangeRate != null) {
    const rate = parseScaled(input.exchangeRate, EXCHANGE_RATE_SCALE);
    if (rate <= 0n) throw new RangeError("exchange rate must be greater than 0");
    baseSubtotals = allocate(convert(sum(subtotals), rate), subtotals);
    const fixedGroups = groups.filter((group) => group.tax.type === TaxType.Fixed);
    switch (policy.baseTaxMethod) {
      case BaseTaxMethod.Recompute: {
        const percentageGroups = groups.filter((group) => group.tax.type !== TaxType.Fixed);
        baseTaxes = computeTaxes(lines, percentageGroups, baseSubtotals, policy);
        convertGroups(baseTaxes, taxes, fixedGroups, rate);
        break;
      }
      case BaseTaxMethod.Convert:
        baseTaxes = emptyMatrix(lines);
        convertGroups(baseTaxes, taxes, groups, rate);
        break;
      default: {
        const unknown: never = policy.baseTaxMethod;
        throw new RangeError(`Unknown base tax method: ${JSON.stringify(unknown)}`);
      }
    }
  }

  const lineResults: LineCalculation[] = lines.map((line, index) => {
    const subtotal = subtotals[index]!;
    const taxAmount = sum(taxes[index]!);
    return {
      subtotal,
      taxAmount,
      total: subtotal + taxAmount,
      baseSubtotal: baseSubtotals ? baseSubtotals[index]! : null,
      taxes: line.taxes.map((tax, position) => ({
        taxId: tax.id,
        taxAmount: taxes[index]![position]!,
        baseTaxAmount: baseTaxes ? baseTaxes[index]![position]! : null,
      })),
    };
  });

  const subtotal = sum(subtotals);
  const tax = sum(lineResults.map((line) => line.taxAmount));
  let base: AmountTotals | null = null;
  if (baseSubtotals && baseTaxes) {
    const baseSubtotal = sum(baseSubtotals);
    const baseTax = sum(baseTaxes.flat());
    base = { subtotal: baseSubtotal, tax: baseTax, total: baseSubtotal + baseTax };
  }

  return {
    subtotal,
    tax,
    total: subtotal + tax,
    base,
    lines: lineResults,
    taxTotals: groups.map((group) => ({
      taxId: group.tax.id,
      amount: sum(readGroup(taxes, group)),
      baseAmount: baseTaxes ? sum(readGroup(baseTaxes, group)) : null,
    })),
  };
}
