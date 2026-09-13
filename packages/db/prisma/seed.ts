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
    ];

    await prisma.availableTrigger.createMany({
      data: availableTriggers,
      skipDuplicates: true,
    });

    await prisma.availableAction.createMany({
      data: availableActions,
      skipDuplicates: true,
    });
  } catch (error) {
    console.error("Error seeding content:", error);
    throw error;
  }
}

seedDB().finally(() => prisma.$disconnect());
