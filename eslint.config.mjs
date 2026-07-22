import next from "eslint-config-next";
const config = [
  ...next,
  { ignores: [".next/**", "node_modules/**", "scripts/enrichment/**"] },
  {
    rules: {
      "react-hooks/refs": "error",
      "react-hooks/set-state-in-effect": "error",
    },
  },
];
export default config;
