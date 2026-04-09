export function formatActionText(event: any) {
  switch (event.action) {
    case "LISTING_CREATED":
      return `Listing created (ID: ${event.entityId})`;

    case "BID_PLACED":
      return `Bid placed on listing ${event.entityId}`;

    case "ASSIGNED":
      return `Assignment created for listing ${event.entityId}`;

    case "COLLECTED":
      return `Waste collected for listing ${event.entityId}`;

    case "COMPLETED":
      return `Listing ${event.entityId} completed`;

    case "INCIDENT_REPORTED":
      return `Incident reported on listing ${event.entityId}`;

    default:
      return `${event.action} (${event.entityType})`;
  }
}
