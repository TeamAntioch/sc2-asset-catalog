// Lets Node run this package's TypeScript source in a child process: a relative `.js` import that
// doesn't exist resolves to the `.ts` file beside it, as tsc's NodeNext output would.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, next) {
    try {
      return next(specifier, context);
    } catch (error) {
      if (!specifier.startsWith(".") || !specifier.endsWith(".js")) throw error;
      return next(`${specifier.slice(0, -3)}.ts`, context);
    }
  },
});
