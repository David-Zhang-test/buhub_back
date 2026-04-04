/**
 * Debug which S3 object key matches an API path like:
 *   /api/uploads/USER_ID/filename.jpg  →  pass: USER_ID/filename.jpg
 *
 * Run from buhub_back with the same env as the server (.env loaded if you use `dotenv` or export vars):
 *   npx tsx scripts/s3-probe-upload-key.ts "0e21dd7c-2259-4681-a9d3-5b6f9f1f5ee3/1775184264691-xgudklno6p.jpg"
 */

import { HeadObjectCommand } from "@aws-sdk/client-s3";
import { getS3Bucket, getS3Client, s3ReadKeyCandidates } from "../src/lib/s3";

async function main() {
  const apiKey = process.argv[2]?.trim();
  if (!apiKey) {
    console.error(
      'Usage: npx tsx scripts/s3-probe-upload-key.ts "userId/filename.ext"\n' +
        "Use the path after /api/uploads/ (no leading slash)."
    );
    process.exit(1);
  }

  let bucket: string;
  try {
    bucket = getS3Bucket();
  } catch {
    console.error("Set S3_UPLOADS_BUCKET in the environment (same as backend).");
    process.exit(1);
  }

  const client = getS3Client();
  console.log("Bucket:", bucket);
  console.log("AWS_REGION:", process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "(sdk default)");
  console.log("S3_UPLOADS_KEY_PREFIX:", JSON.stringify(process.env.S3_UPLOADS_KEY_PREFIX ?? ""));
  console.log("API relative key:", apiKey);
  console.log("Trying candidates:\n");

  for (const Key of s3ReadKeyCandidates(apiKey)) {
    try {
      const out = await client.send(
        new HeadObjectCommand({ Bucket: bucket, Key })
      );
      console.log("  OK   ", Key);
      console.log("        ContentLength:", out.ContentLength, "ContentType:", out.ContentType);
    } catch (e: unknown) {
      const err = e as {
        name?: string;
        $metadata?: { httpStatusCode?: number };
        Code?: string;
        message?: string;
      };
      const code = err.name || err.Code || "Error";
      const http = err.$metadata?.httpStatusCode ?? "?";
      console.log("  FAIL ", Key);
      console.log("        ", code, "http=", http, err.message ? `- ${err.message}` : "");
    }
  }

  console.log(
    "\nIf every line is NotFound: open S3 console → your bucket → search prefix with the userId folder name and compare the full “Object key”."
  );
  console.log(
    "If you see AccessDenied: IAM user/role needs s3:GetObject and s3:ListBucket (optional) on this bucket."
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
