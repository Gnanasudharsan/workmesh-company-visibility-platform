/** @type {import('jest').Config} */
const tsJest = ["ts-jest", { isolatedModules: true, diagnostics: false }];

module.exports = {
  testTimeout: 30000,
  projects: [
    {
      displayName: "unit",
      testEnvironment: "node",
      roots: ["<rootDir>/src"],
      testMatch: ["**/*.spec.ts"],
      transform: { "^.+\\.ts$": tsJest },
    },
    {
      displayName: "integration",
      testEnvironment: "node",
      roots: ["<rootDir>/test"],
      testMatch: ["**/*.int.spec.ts"],
      transform: { "^.+\\.ts$": tsJest },
      setupFiles: ["<rootDir>/test/env.ts"],
      globalSetup: "<rootDir>/test/global-setup.ts",
    },
  ],
};
