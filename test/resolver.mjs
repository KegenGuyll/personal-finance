// Lets the test runner load the app's TypeScript sources as they are written.
//
// `node --test` strips types but requires fully specified import specifiers,
// while the app omits extensions (`./manual-transactions`) and uses the `@/*`
// path alias from tsconfig. Resolving both here keeps the source idiomatic
// instead of appending `.ts` at every import, or replacing aliases with long
// relative paths, purely to satisfy the runner — the Next build, not the tests,
// is the authority on how the app resolves modules.
import { registerHooks } from "node:module";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../", import.meta.url);
const EXTENSIONED = /\.(?:ts|tsx|js|jsx|mjs|cjs|json)$/;

/** Resolves the first candidate path that exists on disk. */
function firstExisting(base, specifier) {
  for (const suffix of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidate = new URL(specifier + suffix, base);
    if (existsSync(fileURLToPath(candidate))) return specifier + suffix;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    // `@/src/lib/x` -> `<repo>/src/lib/x`, matching tsconfig's `@/*` -> `./*`.
    // The result must stay a relative specifier: a bare `src/lib/x` would be
    // resolved as the package `src`, which is the error that points here.
    if (specifier.startsWith("@/")) {
      const rootContext = { ...context, parentURL: ROOT.href };
      const resolved = firstExisting(ROOT, specifier.slice(2));
      return nextResolve(resolved ? `./${resolved}` : `./${specifier.slice(2)}`, rootContext);
    }

    if (specifier.startsWith(".") && !EXTENSIONED.test(specifier)) {
      const resolved = firstExisting(context.parentURL, specifier);
      if (resolved) return nextResolve(resolved, context);
    }

    return nextResolve(specifier, context);
  },
});
