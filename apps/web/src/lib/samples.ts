import type { OfferInput } from "@/types";

export interface Sample extends OfferInput {
  label: string;
}

/** Fictional suppliers modeled on the patterns in public import-fraud warnings: borrowed licences, borrowed photos, personal accounts. */
export const SAMPLES: Sample[] = [
  {
    label: "Factory with someone else's licence",
    channel: "Alibaba",
    sender: "sales@brightstar-textile.com",
    company: "Shenzhen Brightstar Textile Manufacturing Co., Ltd.",
    registration_no: "91440300MA5FXXXX1B",
    message: `PROFORMA INVOICE No. BT-2291

Seller: Shenzhen Brightstar Textile Manufacturing Co., Ltd.
Address: Room 1203, Building 5, Huaqiang North Road, Futian District, Shenzhen, China
Business licence: 91440300MA5FXXXX1B
Certification: ISO 9001, certificate QMS-2231

We are a factory with 200 workers and 12 production lines, making cotton garments for export. 5,000 pcs organic cotton hoodies, USD 18,750.

Payment: 100% T/T in advance. Because of our company's bank restrictions, please transfer to the personal account of our finance manager, Mr. Li Wei, at Bank of Communications. Price is valid for 48 hours only.

Contact: sales@brightstar-textile.com`,
  },
  {
    label: "Honest trading company",
    channel: "IndiaMART",
    sender: "exports@meridianhomeware.example",
    company: "Meridian Homeware Exports Pvt Ltd",
    message: `QUOTATION Q-1043

From: Meridian Homeware Exports Pvt Ltd, Plot 14, Sector 8, Moradabad, Uttar Pradesh, India
We are an export house sourcing brass and aluminium homeware from approved workshops in Moradabad. 2,000 sets brass serving trays, USD 9,400.

Terms: 30% advance by T/T to the company account in the name of Meridian Homeware Exports Pvt Ltd, balance against copy of bill of lading. Third-party pre-shipment inspection is welcome and can be arranged at your cost.`,
  },
];
