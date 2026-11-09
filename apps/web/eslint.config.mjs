import next from "eslint-config-next";

export default [
  { ignores: [".next/**", "playwright-report/**", "test-results/**", "next-env.d.ts"] },
  ...next,
  {
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
];
