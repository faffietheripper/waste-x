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
   EXTEND NEXTAUTH TYPES
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

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    organisationId: string | null;
    role: string;
    profileCompleted: boolean;
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

      async authorize(credentials, _request) {
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
       JWT CALLBACK
       Runs at login and session refresh
    ========================================================= */

    async jwt({ token, user }) {
      // Always ensure we have the user id
      if (user?.id) {
        token.id = user.id;
      }

      // 🔥 ALWAYS fetch fresh user from DB
      if (token.id) {
        const dbUser = await database.query.users.findFirst({
          where: eq(users.id, token.id),
        });

        if (dbUser) {
          token.organisationId = dbUser.organisationId;
          token.role = dbUser.role;

          const profile = await database.query.userProfiles.findFirst({
            where: eq(userProfiles.userId, dbUser.id),
          });

          token.profileCompleted = !!profile;
        }
      }

      return token;
    },
    /* =========================================================
       SESSION CALLBACK
       Controls data sent to client
    ========================================================= */

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id;
        session.user.organisationId = token.organisationId;
        session.user.role = token.role;
        session.user.profileCompleted = token.profileCompleted;
      }

      return session;
    },
  },

  secret: process.env.AUTH_SECRET,
});
