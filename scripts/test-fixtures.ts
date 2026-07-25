import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { env } from "../src/config/env";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const org = await prisma.organization.create({
    data: {
      id: "test-org-outbound-1",
      name: "Outbound Test Org",
      slug: "outbound-test-org",
      cnpj: "00000000000191",
      createdAt: new Date(),
    },
  });
  const agent = await prisma.agent.create({
    data: {
      id: "test-agent-outbound-1",
      organizationId: org.id,
      name: "Agente Teste",
      welcomeMessage: "oi",
      processingMessage: "proc",
      transferMessage: "transf",
      unsupportedFormatMessage: "unsup",
      outOfHoursMessage: "fora",
      closingMessage: "fim",
      errorMessage: "erro",
    },
  });
  const wc = await prisma.whatsappChannel.create({
    data: {
      id: "test-wc-outbound-1",
      organizationId: org.id,
      agentId: agent.id,
      phoneNumberId: "903493939520850",
      displayNumber: "+1 555-147-8580",
      wabaId: "1419043729557569",
    },
  });
  const target = await prisma.target.create({
    data: {
      id: "test-target-outbound-1",
      organizationId: org.id,
      whatsappChannelId: wc.id,
      waId: "5511999999999",
      name: "Cliente Teste",
    },
  });
  const session = await prisma.messagingSession.create({
    data: { id: "test-session-outbound-1", targetId: target.id, whatsappChannelId: wc.id },
  });

  console.log(
    JSON.stringify(
      {
        orgId: org.id,
        agentId: agent.id,
        wcId: wc.id,
        targetId: target.id,
        sessionId: session.id,
        phoneNumberId: wc.phoneNumberId,
        waId: target.waId,
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
