"use server";

import { completeInvite } from "../core/completeInvite";

export async function completeInviteAction(input: {
  token: string;
  password: string;
}) {
  return completeInvite(input);
}
