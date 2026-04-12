import { getSignedUrlForS3Object } from "@/lib/s3";

export async function createUploadUrls(keys: string[], types: string[]) {
  if (!keys.length || !types.length) return [];

  return Promise.all(
    keys.map((key, i) => {
      const type = types[i];
      if (!key || !type) return null;
      return getSignedUrlForS3Object(key, type);
    }),
  );
}
