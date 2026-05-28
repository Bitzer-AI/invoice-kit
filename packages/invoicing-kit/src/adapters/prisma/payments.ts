import type {
  ListPaymentsArgs,
  NewPayment,
  Page,
  PaymentRepository,
  PaymentUpdate,
} from "../types";
import type { BigintMinor, Payment } from "../../types";
import type { AnyPrismaClient, PrismaModelNames } from "./client-type";
import { paymentRowToDomain } from "./mappers";

export function createPrismaPaymentRepository(
  prisma: AnyPrismaClient,
  modelNames: PrismaModelNames,
): PaymentRepository {
  const db = (prisma as any)[modelNames.payment];
  return {
    async create(data: NewPayment): Promise<Payment> {
      const row = await db.create({
        data: {
          invoiceId: data.invoiceId,
          paymentMethodId: data.paymentMethodId ?? null,
          amount: data.amount,
          currency: data.currency,
          status: data.status,
          provider: data.provider,
          stripePaymentIntentId: data.stripePaymentIntentId ?? null,
          stripeCheckoutSessionId: data.stripeCheckoutSessionId ?? null,
          stripeChargeId: data.stripeChargeId ?? null,
          paidAt: data.paidAt ?? null,
          failedAt: data.failedAt ?? null,
          failureReason: data.failureReason ?? null,
          reference: data.reference ?? null,
          notes: data.notes ?? null,
          recordedBy: data.recordedBy ?? null,
          metadata: data.metadata ?? undefined,
        },
      });
      return paymentRowToDomain(row);
    },

    async findById(id: string, organizationId: string): Promise<Payment | null> {
      const row = await db.findFirst({
        where: { id, invoice: { document: { organizationId } } },
      });
      return row ? paymentRowToDomain(row) : null;
    },

    async list(args: ListPaymentsArgs): Promise<Page<Payment>> {
      const page = args.page ?? 1;
      const perPage = args.perPage ?? 20;
      const where: any = {
        invoice: { document: { organizationId: args.organizationId } },
      };
      if (args.invoiceId) where.invoiceId = args.invoiceId;
      if (args.status) where.status = args.status;
      const [rows, totalCount] = await Promise.all([
        db.findMany({
          where,
          skip: (page - 1) * perPage,
          take: perPage,
          orderBy: { createdAt: "desc" },
        }),
        db.count({ where }),
      ]);
      return {
        data: rows.map(paymentRowToDomain),
        pageInfo: {
          page,
          perPage,
          totalCount,
          pageCount: Math.max(1, Math.ceil(totalCount / perPage)),
        },
      };
    },

    async update(
      id: string,
      organizationId: string,
      patch: PaymentUpdate,
    ): Promise<Payment> {
      const { count } = await db.updateMany({
        where: { id, invoice: { document: { organizationId } } },
        data: {
          ...patch,
          metadata: patch.metadata ?? undefined,
        },
      });
      if (count === 0) throw new Error("payment not found");
      const row = await db.findUnique({ where: { id } });
      return paymentRowToDomain(row);
    },

    async delete(id: string, organizationId: string): Promise<void> {
      await db.deleteMany({
        where: { id, invoice: { document: { organizationId } } },
      });
    },

    async totalPaidForInvoice(
      invoiceId: string,
      organizationId: string,
    ): Promise<BigintMinor> {
      const result = await db.aggregate({
        where: {
          invoiceId,
          status: "succeeded",
          invoice: { document: { organizationId } },
        },
        _sum: { amount: true },
      });
      return (result._sum.amount as bigint | null) ?? 0n;
    },
  };
}
