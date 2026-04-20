type Capability = "generator" | "carrier" | "manager";
type MarketMode = "internal" | "controlled" | "open";

export function canCreateListing(capabilities: Capability[]) {
  return capabilities.includes("generator") || capabilities.includes("manager");
}

export function canBid(capabilities: Capability[], marketMode: MarketMode) {
  if (marketMode === "internal") return false;

  if (marketMode === "controlled") {
    return capabilities.includes("manager");
  }

  if (marketMode === "open") {
    return capabilities.includes("carrier") || capabilities.includes("manager");
  }

  return false;
}

export function canAssignCarrier(capabilities: Capability[]) {
  return capabilities.includes("manager");
}

export function canAcceptAssignment(capabilities: Capability[]) {
  return capabilities.includes("carrier");
}

export function canCompleteJob(capabilities: Capability[]) {
  return capabilities.includes("manager");
}

export function canRaiseIncident(capabilities: Capability[]) {
  return capabilities.includes("carrier") || capabilities.includes("manager");
}

export function canResolveIncident(capabilities: Capability[]) {
  return capabilities.includes("manager");
}
