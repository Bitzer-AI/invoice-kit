import type { BigintMinor, VendorBillPayment } from "../../types";
import { VendorBillPaymentStatus } from "../../types";
import type {
  ListVendorBillPaymentsArgs,
  NewVendorBillPayment,
  Page,
  VendorBillPaymentRepository,
  VendorBillPaymentUpdate,
} from "../types";
import type { AnyPrismaClient, PrismaModelNames } from "./client-type";
import { vendorBillPaymentRowToDomain } from "./mappers";

export function createPrismaVendorBillPaymentRepository(
  prisma: AnyPrismaClient,
  modelNames: PrismaModelNames,
): VendorBillPaymentRepository {
  const db = (prisma as any)[modelNames.vendorBillPayment];
  return {
    async create(data: NewVendorBillPayment): Promise<VendorBillPayment> {
      const row = await db.create({
        data: {
          organizationId: data.organizationId,
          vendorBillId: data.vendorBillId,
          paymentMethodId: data.paymentMethodId ?? null,
          amount: data.amount,
          currency: data.currency,
          status: data.status,
          provider: data.provider,
          paidAt: data.paidAt ?? null,
          reference: data.reference ?? null,
          notes: data.notes ?? null,
          recordedBy: data.recordedBy ?? null,
        },
      });
      return vendorBillPaymentRowToDomain(row);
    },

    async findById(id, organizationId): Promise<VendorBillPayment | null> {
      const row = await db.findFirst({ where: { id, organizationId } });
      return row ? vendorBillPaymentRowToDomain(row) : null;
    },

    async list(args: ListVendorBillPaymentsArgs): Promise<Page<VendorBillPayment>> {
      const page = args.page ?? 1;
      const perPage = args.perPage ?? 20;
      const where: any = { organizationId: args.organizationId };
      if (args.vendorBillId) where.vendorBillId = args.vendorBillId;
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
        data: rows.map(vendorBillPaymentRowToDomain),
        pageInfo: {
          page,
          perPage,
          totalCount,
          pageCount: Math.max(1, Math.ceil(totalCount / perPage)),
        },
      };
    },

    async update(id, organizationId, patch: VendorBillPaymentUpdate): Promise<VendorBillPayment> {
      const { count } = await db.updateMany({ where: { id, organizationId }, data: patch });
      if (count === 0) throw new Error("vendor bill payment not found");
      const row = await db.findUnique({ where: { id } });
      return vendorBillPaymentRowToDomain(row);
    },

    async delete(id, organizationId): Promise<void> {
      await db.deleteMany({ where: { id, organizationId } });
    },

    async totalPaidForBill(vendorBillId, organizationId): Promise<BigintMinor> {
      const result = await db.aggregate({
        where: { vendorBillId, organizationId, status: VendorBillPaymentStatus.Succeeded },
        _sum: { amount: true },
      });
      return (result._sum.amount as bigint | null) ?? 0n;
    },
  };
}
