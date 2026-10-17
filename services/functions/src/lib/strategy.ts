import {
  companySettingsSchema,
  icpSchema,
  marketInsightSchema,
  productSchema,
} from "@daedalus/shared";
import { db } from "../admin.js";

/** Loads strategy inputs + active products + company profile for generation. */
export async function loadGenerationContext() {
  const [icpsSnap, insightsSnap, productsSnap, companySnap] = await Promise.all([
    db.collection("strategy").where("kind", "==", "icp").get(),
    db.collection("strategy").where("kind", "==", "insight").get(),
    db.collection("products").where("status", "==", "active").get(),
    db.collection("settings").doc("company").get(),
  ]);

  const company = companySettingsSchema.parse(companySnap.data() ?? {});
  return {
    company,
    icps: icpsSnap.docs.map((d) => icpSchema.parse(d.data())),
    insights: insightsSnap.docs.map((d) => marketInsightSchema.parse(d.data())),
    products: productsSnap.docs.map((d) => productSchema.parse(d.data())),
    locale: company.defaultLocale ?? "en",
    brandName: company.storefrontName || company.legalName || "Store",
  };
}
