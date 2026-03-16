import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  // 关闭 experimental.workerThreads，避免在部分 Next.js 版本中
  // 构建阶段序列化配置/数据时出现 DataCloneError（`()=>null could not be cloned`）问题。
};

export default nextConfig;
