import type { DefaultSession } from "next-auth";
import type { DefaultJWT } from "next-auth/jwt";

type DepartmentType = "generator" | "carrier" | "manager" | "compliance";

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
        type: DepartmentType;
      } | null;
    } & DefaultSession["user"];
  }

  interface User {
    organisationId?: string | null;
    departmentId?: string | null;
    role?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id?: string;
    organisationId?: string | null;
    departmentId?: string | null;
    role?: string | null;
    profileCompleted?: boolean;
  }
}

export {};