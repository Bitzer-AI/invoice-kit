import type { Repositories } from "./adapters/types";
import type { InvoicingKitHooks } from "./config";
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
import { NumberingService } from "./domains/numbering/service";

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
  numbering: NumberingService;
}

export function buildServices(repos: Repositories, hooks?: InvoicingKitHooks): Services {
  return {
    clients: new ClientService(repos),
    vendors: new VendorService(repos),
    products: new ProductService(repos),
    taxes: new TaxService(repos),
    paymentMethods: new PaymentMethodService(repos),
    quotes: new QuoteService(repos),
    invoices: new InvoiceService(repos, undefined, undefined, undefined, hooks),
    vendorBills: new VendorBillService(repos, undefined, undefined, undefined, hooks),
    payments: new PaymentService(repos, hooks),
    vendorBillPayments: new VendorBillPaymentService(repos, hooks),
    numbering: new NumberingService(repos),
  };
}
