// Lets the test runner load the app's TypeScript sources as they are written.
//
// `node --test` strips types but requires fully specified import specifiers,
// while the app omits extensions (`./manual-transactions`). Resolving those to
// `.ts` here keeps the source idiomatic instead of appending `.ts` at every
// import purely to satisfy the runner — which the Next build, not the tests,
// is the authority on.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const EXTENSIONED = /\.(?:ts|tsx|js|jsx|mjs|cjs|json)$/;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !EXTENSIONED.test(specifier)) {
      try {
        const candidate = new URL(`${specifier}.ts`, context.parentURL);
        if (existsSync(fileURLToPath(candidate))) {
          return nextResolve(`${specifier}.ts`, context);
        }
      } catch {
        // Fall through to the default resolution and let it report the miss.
      }
    }
    return nextResolve(specifier, context);
  },
});
