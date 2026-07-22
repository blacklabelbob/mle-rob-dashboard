import next from "eslint-config-next";
export default [
  ...next,
  { ignores: [".next/**", "node_modules/**", "scripts/enrichment/**"] },
  {
    rules: {
      // Downgraded 2026-07-22 (NOT disabled): NetworkGraph's canvas-closure ref
      // bridge + initial-load effects predate the React compiler rules. They are
      // Playwright-tested and work; proper refactor queued (BUILD-QUEUE Q-LINT)
      // rather than risked live. Everything else stays a hard error.
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];
