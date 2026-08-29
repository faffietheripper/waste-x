export class InvalidWeightError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidWeightError";
  }
}

export function calculateNetWeight(grossWeight: number, tareWeight: number) {
  if (!Number.isFinite(grossWeight) || !Number.isFinite(tareWeight)) {
    throw new InvalidWeightError("Weights must be finite numbers.");
  }

  if (grossWeight < 0 || tareWeight < 0) {
    throw new InvalidWeightError("Weights cannot be negative.");
  }

  if (tareWeight > grossWeight) {
    throw new InvalidWeightError(
      "Tare weight cannot be greater than gross weight.",
    );
  }

  return Number((grossWeight - tareWeight).toFixed(3));
}
