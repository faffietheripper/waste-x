import NextAuth, { DefaultSession } from "next-auth";

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

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      organisationId?: string | null;
      departmentId?: string | null;
      activeDepartment?: {
        id: string;
        organisationId: string;
        name: string;
        type: "generator" | "carrier" | "compliance";
      } | null;
      role?: string;
    };
  }
}
