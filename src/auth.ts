import NextAuth, { DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";

import { database } from "@/db/database";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
  userProfiles,
} from "@/db/schema";

import { eq } from "drizzle-orm";
import { getUserFromDb } from "@/app/login/actions";

/* =========================================================
   EXTEND NEXTAUTH TYPES (SAFE)
========================================================= */

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      organisationId: string | null;
      role: string;
      profileCompleted: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    name: string;
    email: string;
    organisationId: string | null;
    role: string;
  }
}

/* =========================================================
   NEXTAUTH CONFIG
========================================================= */

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(database, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),

  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },

  providers: [
    Google,

    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      async authorize(credentials) {
        if (!credentials?.email || !credentials.password) {
          return null;
        }

        const userResponse = await getUserFromDb(
          credentials.email as string,
          credentials.password as string,
        );

        if (!userResponse.success || !userResponse.data) {
          return null;
        }

        const user = userResponse.data;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          organisationId: user.organisationId ?? null,
          role: user.role ?? "employee",
        };
      },
    }),
  ],

  callbacks: {
    /* =========================================================
       JWT CALLBACK (FIXED – ALWAYS SYNC WITH DB)
    ========================================================= */

    async jwt({ token, user }) {
      const t = token as typeof token & {
        id?: string;
        organisationId?: string | null;
        role?: string;
        profileCompleted?: boolean;
      };

      // Set ID on login
      if (user?.id) {
        t.id = user.id;
      }

      // Always fetch fresh user from DB
      if (t.id) {
        const dbUser = await database.query.users.findFirst({
          where: eq(users.id, t.id),
        });

        if (dbUser) {
          t.organisationId = dbUser.organisationId;
          t.role = dbUser.role;

          const profile = await database.query.userProfiles.findFirst({
            where: eq(userProfiles.userId, dbUser.id),
          });

          t.profileCompleted = !!profile;
        }
      }

      return t;
    },

    /* =========================================================
       SESSION CALLBACK
    ========================================================= */

    async session({ session, token }) {
      const t = token as {
        id?: string;
        organisationId?: string | null;
        role?: string;
        profileCompleted?: boolean;
      };

      if (session.user) {
        session.user.id = t.id!;
        session.user.organisationId = t.organisationId ?? null;
        session.user.role = t.role!;
        session.user.profileCompleted = t.profileCompleted ?? false;
      }

      return session;
    },
  },

  secret: process.env.AUTH_SECRET,
});
