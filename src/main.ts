import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { prisma } from "./infrastructure/database/prisma/client";
import { redis } from "./infrastructure/cache/redis/client";
import { getRabbitChannel } from "./infrastructure/queue/rabbitmq/connection";
import { pingMongo } from "./infrastructure/database/mongo/client";
import { startOutboundMarkReadConsumer } from "./presentation/workers/outbound-mark-read-consumer";
import { startOutboundMessageConsumer } from "./presentation/workers/outbound-message-consumer";

async function main() {
  await prisma.$connect();
  const channel = await getRabbitChannel();

  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", async (_req, res) => {
    const [dbOk, redisOk, mongoOk] = await Promise.all([
      prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      redis.ping().then(() => true).catch(() => false),
      pingMongo(),
    ]);

    res.json({ status: "ok", service: "outbound-worker", db: dbOk, redis: redisOk, mongo: mongoOk });
  });

  app.listen(env.PORT, () => {
    console.log(`Outbound-Worker listening on port ${env.PORT}`);
  });

  await startOutboundMessageConsumer(channel);
  await startOutboundMarkReadConsumer(channel);
}

main().catch((error) => {
  console.error("Fatal error during Outbound-Worker bootstrap:", error);
  process.exit(1);
});
