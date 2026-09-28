import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db/client";
import * as schema from "@/db/schema";

export const auth = betterAuth({
  appName: "reynovation",
  // Preview deployments get their own URL; accept it alongside BETTER_AUTH_URL.
  trustedOrigins: [
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
    process.env.DEPLOY_PRIME_URL, // Netlify branch/preview deploys
    process.env.URL, // Netlify primary site URL
  ].filter((origin): origin is string => Boolean(origin)),
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  advanced: {
    // Rate limiting needs the real client IP. Each host sets its own header that
    // clients cannot forge; only trust the one belonging to where we run.
    ipAddress: { ipAddressHeaders: process.env.VERCEL ? ["x-real-ip"] : ["x-nf-client-connection-ip"] },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  // Must stay last: lets server actions set the session cookie.
  plugins: [nextCookies()],
});
