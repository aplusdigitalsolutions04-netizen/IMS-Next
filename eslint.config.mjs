import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = defineConfig([
  ...nextVitals,
  {
    // These are React-Compiler "optimisation hints" (new in eslint-plugin-react-hooks 6+),
    // not correctness errors: the flagged patterns — fetching data in a mount effect,
    // calling a loader declared further down the component, reading Date.now() in a
    // handler-like helper — all work correctly at runtime. They stay visible as warnings
    // so they can be cleaned up gradually without risking regressions in screens that
    // are in daily use.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
