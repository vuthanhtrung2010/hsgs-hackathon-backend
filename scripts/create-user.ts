#!/usr/bin/env bun

import { PrismaClient } from "generated/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { auth } from "auth.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function createUser() {
  console.log("🔧 User Creation Script");
  console.log("======================\n");

  // Get user input from command line arguments
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log("Usage: bun scripts/create-user.ts <name> <email> <password>");
    console.log(
      'Example: bun scripts/create-user.ts "John Doe" "john@example.com" "password123"',
    );
    process.exit(1);
  }

  const [name, email, password] = args as [string, string, string];

  try {
    console.log(`Creating user: ${name} (${email})`);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      console.error(`❌ User with email ${email} already exists`);
      process.exit(1);
    }

    // Create user using Better Auth
    const result = await auth.api.signUpEmail({
      body: {
        name,
        email,
        password,
      },
    });

    if (result) {
      console.log("✅ User created successfully!");
      console.log(`   Name: ${name}`);
      console.log(`   Email: ${email}`);
      console.log(`   User ID: ${result.user.id}`);
      console.log(
        "\n💡 The user can now log in using the frontend login page.",
      );
    } else {
      console.error("❌ Failed to create user");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Error creating user:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
createUser().catch((error) => {
  console.error("❌ Script failed:", error);
  process.exit(1);
});
