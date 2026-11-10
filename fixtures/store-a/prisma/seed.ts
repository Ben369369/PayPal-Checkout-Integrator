import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../lib/generated/prisma/client";
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

const db = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./prisma/dev.db" }),
});

// Non-round prices on purpose, so cent-level total mismatches show up in tests.
const products = [
  {
    slug: "canvas-tote",
    name: "Canvas Tote",
    description: "Heavy 16 oz cotton canvas with a reinforced base. Carries a week of groceries.",
    priceCents: 1999,
  },
  {
    slug: "enamel-pin",
    name: "Tidepool Enamel Pin",
    description: "Hard enamel pin with a rubber clutch. 1 inch across.",
    priceCents: 745,
  },
  {
    slug: "mug-set",
    name: "Stoneware Mug Set (2)",
    description: "Two 12 oz speckled stoneware mugs. Dishwasher safe.",
    priceCents: 3450,
  },
  {
    slug: "wool-throw",
    name: "Wool Throw Blanket",
    description: "Woven merino throw, 50 x 60 inches.",
    priceCents: 12900,
  },
];

async function main() {
  for (const p of products) {
    await db.product.upsert({ where: { slug: p.slug }, create: p, update: p });
  }
  console.log(`Seeded ${products.length} products`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
