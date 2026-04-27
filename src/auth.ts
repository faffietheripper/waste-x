import NextAuth, { DefaultSession, type Session } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";

import { database } from "@/db/database";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
  userProfiles,
  departments,
} from "@/db/schema";

import { getUserFromDb } from "@/app/login/actions";

/* =========================================================
   EXTEND NEXTAUTH TYPES
========================================================= */

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      organisationId: string | null;
      departmentId: string | null;
      role: string;
      profileCompleted: boolean;
      activeDepartment: {
        id: string;
        organisationId: string;
        name: string;
        type: "generator" | "carrier" | "compliance";
      } | null;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    name: string;
    email: string;
    organisationId: string | null;
    departmentId?: string | null;
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
          departmentId: user.departmentId ?? null,
          role: user.role ?? "employee",
        };
      },
    }),
  ],

  callbacks: {
    /* =========================================================
       JWT CALLBACK
    ========================================================= */

    async jwt({ token, user }) {
      const t = token as typeof token & {
        id?: string;
        organisationId?: string | null;
        departmentId?: string | null;
        role?: string;
        profileCompleted?: boolean;
      };

      if (user?.id) {
        t.id = user.id;
      }

      if (t.id) {
        const [dbUser] = await database
          .select({
            id: users.id,
            organisationId: users.organisationId,
            departmentId: users.departmentId,
            role: users.role,
          })
          .from(users)
          .where(eq(users.id, t.id));

        if (dbUser) {
          t.organisationId = dbUser.organisationId;
          t.departmentId = dbUser.departmentId;
          t.role = dbUser.role;

          const [profile] = await database
            .select({
              id: userProfiles.id,
            })
            .from(userProfiles)
            .where(eq(userProfiles.userId, dbUser.id));

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
        departmentId?: string | null;
        role?: string;
        profileCompleted?: boolean;
      };

      let activeDepartment: Session["user"]["activeDepartment"] = null;

      if (t.departmentId) {
        const [department] = await database
          .select({
            id: departments.id,
            organisationId: departments.organisationId,
            name: departments.name,
            type: departments.type,
          })
          .from(departments)
          .where(eq(departments.id, t.departmentId));

        activeDepartment = department ?? null;
      }

      if (session.user) {
        session.user.id = t.id!;
        session.user.organisationId = t.organisationId ?? null;
        session.user.departmentId = t.departmentId ?? null;
        session.user.role = t.role ?? "employee";
        session.user.profileCompleted = t.profileCompleted ?? false;
        session.user.activeDepartment = activeDepartment;
      }

      return session;
    },
  },

  secret: process.env.AUTH_SECRET,
});
