import * as Crypto from "expo-crypto";

export function isUuidV7(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function createUuidV7() {
  const timestamp = BigInt(Date.now());
  const random = await Crypto.getRandomBytesAsync(10);
  const bytes = new Uint8Array(16);

  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = Number(
      (timestamp >> BigInt((5 - index) * 8)) & BigInt(255),
    );
  }

  bytes[6] = 0x70 | (random[0]! & 0x0f);
  bytes[7] = random[1]!;
  bytes[8] = 0x80 | (random[2]! & 0x3f);

  for (let index = 9; index < 16; index += 1) {
    bytes[index] = random[index - 6]!;
  }

  const hex = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0"),
  );

  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}
