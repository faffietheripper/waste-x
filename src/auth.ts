import NextAuth from "next-auth";
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
   LOCAL TYPES
========================================================= */

type DepartmentType = "generator" | "carrier" | "manager" | "compliance";

type ActiveDepartment = {
  id: string;
  organisationId: string;
  name: string;
  type: DepartmentType;
};

type WasteXToken = {
  id?: string;
  organisationId?: string | null;
  departmentId?: string | null;
  role?: string | null;
  profileCompleted?: boolean;
};

type WasteXSessionUser = {
  id: string;
  organisationId: string | null;
  departmentId: string | null;
  role: string;
  profileCompleted: boolean;
  activeDepartment: ActiveDepartment | null;
};

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
      const wasteXToken = token as typeof token & WasteXToken;

      if (user?.id) {
        wasteXToken.id = user.id;
      }

      if (wasteXToken.id) {
        const [dbUser] = await database
          .select({
            id: users.id,
            organisationId: users.organisationId,
            departmentId: users.departmentId,
            role: users.role,
          })
          .from(users)
          .where(eq(users.id, String(wasteXToken.id)));

        if (dbUser) {
          wasteXToken.organisationId = dbUser.organisationId;
          wasteXToken.departmentId = dbUser.departmentId;
          wasteXToken.role = dbUser.role ?? "employee";

          const [profile] = await database
            .select({
              id: userProfiles.id,
            })
            .from(userProfiles)
            .where(eq(userProfiles.userId, dbUser.id));

          wasteXToken.profileCompleted = Boolean(profile);
        }
      }

      return wasteXToken;
    },

    /* =========================================================
       SESSION CALLBACK
    ========================================================= */

    async session({ session, token }) {
      const wasteXToken = token as typeof token & WasteXToken;

      let activeDepartment: ActiveDepartment | null = null;

      if (wasteXToken.departmentId) {
        const [department] = await database
          .select({
            id: departments.id,
            organisationId: departments.organisationId,
            name: departments.name,
            type: departments.type,
          })
          .from(departments)
          .where(eq(departments.id, String(wasteXToken.departmentId)));

        if (department) {
          activeDepartment = {
            id: department.id,
            organisationId: department.organisationId,
            name: department.name,
            type: department.type as DepartmentType,
          };
        }
      }

      if (session.user) {
        const user = session.user as typeof session.user & WasteXSessionUser;

        user.id = String(wasteXToken.id ?? "");
        user.organisationId = wasteXToken.organisationId ?? null;
        user.departmentId = wasteXToken.departmentId ?? null;
        user.role = wasteXToken.role ?? "employee";
        user.profileCompleted = wasteXToken.profileCompleted ?? false;
        user.activeDepartment = activeDepartment;
      }

      return session;
    },
  },

  secret: process.env.AUTH_SECRET,
});