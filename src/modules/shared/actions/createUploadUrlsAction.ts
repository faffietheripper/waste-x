"use server";

import { createUploadUrls } from "../storage/createUploadUrls";
import { requireOrgUser } from "@/lib/access/require-org-user";

export async function createUploadUrlAction(keys: string[], types: string[]) {
  // 🔐 optional but recommended (prevents abuse)
  await requireOrgUser();

  if (keys.length !== types.length) {
    throw new Error("INVALID_UPLOAD_REQUEST");
  }

  const urls = await createUploadUrls(keys, types);

  return urls.filter(Boolean); // remove nulls
}
