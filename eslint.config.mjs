import next from "eslint-config-next";
const config = [
  ...next,
  { ignores: [".next/**", "node_modules/**", "scripts/enrichment/**"] },
  {
    // Scoped to the extensions eslint-config-next registers the react-hooks
    // plugin for. Unscoped, these rules applied to EVERY file, so the first
    // file of a type Next does not cover (`scripts/net-sentinel.cjs`) failed
    // the whole run with "could not find plugin react-hooks" — a config error,
    // not a lint finding. React hooks can only appear where React can.
    files: ["**/*.{js,jsx,mjs,ts,tsx}"],
    rules: {
      "react-hooks/refs": "error",
      "react-hooks/set-state-in-effect": "error",
    },
  },
];
export default config;
