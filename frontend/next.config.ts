import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["10.0.0.67"],
  outputFileTracingIncludes: {
    "/api/communications/telnyx-bridge-proof": [
      "./node_modules/@ffmpeg-installer/**/*",
    ],
    "/api/communications/telnyx-messaging": [
      "./node_modules/@ffmpeg-installer/**/*",
    ],
  },
};

export default nextConfig;
