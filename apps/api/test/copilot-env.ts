/** Imported first by copilot suites, before the app module reads its configuration. */
process.env.COPILOT_ENABLED = "true";
// CI never calls a real model: copilot suites use the scripted fake provider.
process.env.COPILOT_PROVIDER = "fake";
process.env.COPILOT_RATE_LIMIT_PER_MINUTE = process.env.COPILOT_RATE_LIMIT_PER_MINUTE ?? "100000";
