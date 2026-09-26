import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function seedDB() {
  try {
    const availableTriggers = [
      {
        id: "webhook",
        name: "Webhook",
        image:
          "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTjWUr0rIHZc1vGIRVuGE-lNIDgNInEgStJpQ&s",
      },
    ];

    const availableActions = [
      {
        id: "email",
        name: "Email",
        image:
          "https://cdn4.iconfinder.com/data/icons/social-media-logos-6/512/112-gmail_email_mail-1024.png",
      },
      {
        id: "solana",
        name: "Solana",
        image:
          "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSH2rvI0FKxYk-l-MP9WiRkZUR4bY3qGkvz_w&s",
      },
      { id: "http", name: "HTTP Request", image: "http" },
      { id: "slack", name: "Slack", image: "slack" },
      { id: "google-sheets", name: "Google Sheets", image: "google-sheets" },
    ];

    await prisma.availableTrigger.createMany({
      data: availableTriggers,
      skipDuplicates: true,
    });

    await prisma.availableAction.createMany({
      data: availableActions,
      skipDuplicates: true,
    });

    const connectorDefinitions = [
      [
        "email",
        "Email",
        "Send email through a reusable SMTP connection.",
        "OPTIONAL_CONNECTION",
      ],
      [
        "solana",
        "Solana",
        "Transfer SOL from the encrypted devnet wallet.",
        "NONE",
      ],
      [
        "http",
        "HTTP Request",
        "Call an external HTTPS API.",
        "OPTIONAL_CONNECTION",
      ],
      ["slack", "Slack", "Post messages through Slack OAuth.", "OAUTH2"],
      [
        "google-sheets",
        "Google Sheets",
        "Append rows through Google OAuth.",
        "OAUTH2",
      ],
    ] as const;
    for (const [key, name, description, authType] of connectorDefinitions) {
      await prisma.connectorDefinition.upsert({
        where: { key_version: { key, version: 1 } },
        create: {
          id: `${key}-v1`,
          key,
          version: 1,
          name,
          description,
          image: key,
          authType,
          actionSchema: {},
        },
        update: { name, description, image: key, authType, active: true },
      });
    }
  } catch (error) {
    console.error("Error seeding content:", error);
    throw error;
  }
}

seedDB().finally(() => prisma.$disconnect());
