// Must run before the app module is imported: throttle limits are read at startup.
process.env.COPILOT_RATE_LIMIT_PER_MINUTE = "3";
import "./copilot-env";
import type { INestApplication } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { bootstrap, EMAIL, login } from "./helpers";

describe("copilot rate limiting", () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    ({ app, prisma } = await bootstrap());
  });
  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  it("limits POST /api/copilot/ask per client to COPILOT_RATE_LIMIT_PER_MINUTE", async () => {
    const maya = await login(app, EMAIL.maya);
    for (let i = 0; i < 3; i++) await maya.post("/api/copilot/ask", { question: `Question ${i}` }).expect(200);
    const res = await maya.post("/api/copilot/ask", { question: "One too many" }).expect(429);
    expect(res.body.code).toBe("RATE_LIMITED");
    // Other endpoints keep their own, higher limit.
    await maya.get("/api/auth/me").expect(200);
  });
});
