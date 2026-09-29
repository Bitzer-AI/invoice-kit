import type { Repositories } from "./adapters/types";
import type { InvoicingKitHooks } from "./config";
import { buildMoneySettings, type MoneySettings } from "./lib/money/settings";
import type { InvoiceIssueGuard } from "./config";
import { ClientService } from "./domains/clients/service";
import { VendorService } from "./domains/vendors/service";
import { ProductService } from "./domains/products/service";
import { TaxService } from "./domains/taxes/service";
import { PaymentMethodService } from "./domains/payment-methods/service";
import { QuoteService } from "./domains/quotes/service";
import { InvoiceService } from "./domains/invoices/service";
import { VendorBillService } from "./domains/vendor-bills/service";
import { PaymentService } from "./domains/payments/service";
import { VendorBillPaymentService } from "./domains/vendor-bill-payments/service";
import { NoteService } from "./domains/notes/service";
import { NumberingService } from "./domains/numbering/service";
import { DocumentCalculationService } from "./domains/documents/service";

export interface Services {
  clients: ClientService;
  vendors: VendorService;
  products: ProductService;
  taxes: TaxService;
  paymentMethods: PaymentMethodService;
  quotes: QuoteService;
  invoices: InvoiceService;
  vendorBills: VendorBillService;
  payments: PaymentService;
  vendorBillPayments: VendorBillPaymentService;
  notes: NoteService;
  numbering: NumberingService;
  documents: DocumentCalculationService;
}

export function buildServices(
  repos: Repositories,
  hooks?: InvoicingKitHooks,
  money?: MoneySettings,
  invoicing?: { creditNotePrefix: string | null; issueGuard?: InvoiceIssueGuard },
): Services {
  const settings = money ?? buildMoneySettings();
  return {
    clients: new ClientService(repos),
    vendors: new VendorService(repos),
    products: new ProductService(repos),
    taxes: new TaxService(repos),
    paymentMethods: new PaymentMethodService(repos),
    quotes: new QuoteService(repos, { money: settings }),
    invoices: new InvoiceService(repos, {
      hooks,
      money: settings,
      creditNotePrefix: invoicing?.creditNotePrefix ?? null,
      issueGuard: invoicing?.issueGuard,
    }),
    vendorBills: new VendorBillService(repos, { hooks, money: settings }),
    payments: new PaymentService(repos, { hooks, money: settings }),
    vendorBillPayments: new VendorBillPaymentService(repos, { hooks, money: settings }),
    notes: new NoteService(repos, { hooks, money: settings }),
    numbering: new NumberingService(repos),
    documents: new DocumentCalculationService(repos, settings),
  };
}
