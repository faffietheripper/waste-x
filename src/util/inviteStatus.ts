export function getInviteStatus(user: any) {
  if (user.status === "ACTIVE") return "ACTIVE";

  if (!user.inviteExpiry) return "INVITED";

  if (new Date(user.inviteExpiry) < new Date()) {
    return "EXPIRED";
  }

  return "INVITED";
}
