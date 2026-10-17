import { setGlobalOptions } from "firebase-functions/v2";

// Must run before any function module evaluates — keep this as the FIRST
// import in index.ts (ESM evaluates dependencies in declaration order).
setGlobalOptions({ region: "europe-north1", maxInstances: 20 });
