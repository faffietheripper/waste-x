import { getSignedUrlForS3Object } from "@/lib/s3";

const MAX_FILES = 10;
const allowedFileTypes = ["image/jpeg", "image/png", "application/pdf"];

export async function createUploadUrls(keys: string[], types: string[]) {
  if (keys.length !== types.length) {
    throw new Error("INVALID_INPUT");
  }

  if (keys.length > MAX_FILES) {
    throw new Error("TOO_MANY_FILES");
  }

  types.forEach((type) => {
    if (!allowedFileTypes.includes(type)) {
      throw new Error("INVALID_FILE_TYPE");
    }
  });

  return Promise.all(
    keys.map((key, i) => getSignedUrlForS3Object(key, types[i])),
  );
}
