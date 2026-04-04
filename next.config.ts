import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  serverExternalPackages: ["@aws-sdk/client-s3", "@aws-sdk/s3-request-presigner"],
  // 关闭 experimental.workerThreads，避免在部分 Next.js 版本中
  // 构建阶段序列化配置/数据时出现 DataCloneError（`()=>null could not be cloned`）问题。

  /** Dev: ignore upload/log/backup dirs so file writes do not trigger full route recompilation. */
  webpack: (config, { dev }) => {
    if (dev) {
      const extraIgnored = [
        "**/public/uploads/**",
        "**/logs/**",
        "**/backups/**",
        "**/*.log",
      ];
      const cur = config.watchOptions?.ignored;
      const mergedRaw =
        cur == null
          ? extraIgnored
          : Array.isArray(cur)
            ? [...cur, ...extraIgnored]
            : [cur, ...extraIgnored];
      const merged = Array.from(
        new Set(
          mergedRaw.filter(
            (value): value is string =>
              typeof value === "string" && value.trim().length > 0
          )
        )
      );
      config.watchOptions = {
        ...config.watchOptions,
        ignored: merged,
      };
    }
    return config;
  },
};

export default nextConfig;
