#!/usr/bin/env node
// One-time local setup: creates .env.local (with a random auth secret) and the SQLite schema.
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

if (existsSync(".env.local")) {
  console.log("• .env.local already exists — keeping it");
} else {
  const example = readFileSync(".env.example", "utf8");
  const secret = randomBytes(32).toString("base64url");
  writeFileSync(".env.local", example.replace(/^BETTER_AUTH_SECRET=.*$/m, `BETTER_AUTH_SECRET=${secret}`));
  console.log("• created .env.local with a fresh BETTER_AUTH_SECRET");
}

execSync("npx drizzle-kit push --force", { stdio: "inherit" });
console.log("✓ ready — run: npm run dev");
