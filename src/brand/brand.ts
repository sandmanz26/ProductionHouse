/**
 * Product identity. Everything user-facing that names the product reads from here, so a rename
 * is a one-line change. The tenant's own company name lives in Settings, not here.
 */
export const BRAND = {
  name: "Serat",
  version: "4.1",
  /** The promise, used on the welcome screen and in metadata. */
  line: "Every offcut has a price.",
  descriptor: "The production ledger for furniture workshops",
  pitch:
    "Materials are issued by lot, offcuts go back to stock at their own price, and the job cost locks when the work order closes — from raw logs to the export container.",
} as const;
