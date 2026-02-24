// Error messages mapping - supports multiple languages
// The key is the error code, the value is an object with language codes as keys

export const errorMessages: Record<string, Record<string, string>> = {
  // Auth errors
  UNAUTHORIZED: {
    en: "Please login to continue",
    sc: "请先登录",
    tc: "請先登錄",
  },
  SESSION_EXPIRED: {
    en: "Session expired, please login again",
    sc: "会话已过期，请重新登录",
    tc: "會話已過期，請重新登錄",
  },
  USER_NOT_FOUND: {
    en: "User not found",
    sc: "用户不存在",
    tc: "用戶不存在",
  },
  ACCOUNT_DEACTIVATED: {
    en: "Account has been deactivated",
    sc: "账号已被停用",
    tc: "賬號已被停用",
  },
  ACCOUNT_BANNED: {
    en: "Account has been banned",
    sc: "账号已被封禁",
    tc: "賬號已被封禁",
  },
  FORBIDDEN: {
    en: "You do not have permission to perform this action",
    sc: "您没有权限执行此操作",
    tc: "您沒有權限執行此操作",
  },

  // Validation errors
  VALIDATION_ERROR: {
    en: "Invalid request data",
    sc: "请求数据无效",
    tc: "請求數據無效",
  },
  INVALID_EMAIL: {
    en: "Invalid email format",
    sc: "邮箱格式无效",
    tc: "郵箱格式無效",
  },
  INVALID_PASSWORD: {
    en: "Invalid password",
    sc: "密码无效",
    tc: "密碼無效",
  },

  // Upload errors
  UPLOAD_FAILED: {
    en: "Failed to upload file",
    sc: "文件上传失败",
    tc: "文件上傳失敗",
  },
  INVALID_FILE_TYPE: {
    en: "Invalid file type",
    sc: "无效的文件类型",
    tc: "無效的文件類型",
  },
  FILE_TOO_LARGE: {
    en: "File size exceeds limit",
    sc: "文件大小超过限制",
    tc: "文件大小超過限制",
  },

  // Not found errors
  NOT_FOUND: {
    en: "Resource not found",
    sc: "未找到资源",
    tc: "未找到資源",
  },
  POST_NOT_FOUND: {
    en: "Post not found",
    sc: "帖子不存在",
    tc: "帖子不存在",
  },
  COMMENT_NOT_FOUND: {
    en: "Comment not found",
    sc: "评论不存在",
    tc: "評論不存在",
  },

  // Operation errors
  ALREADY_EXISTS: {
    en: "Already exists",
    sc: "已存在",
    tc: "已存在",
  },
  ALREADY_LIKED: {
    en: "Already liked",
    sc: "已点赞",
    tc: "已點贊",
  },
  ALREADY_BOOKMARKED: {
    en: "Already bookmarked",
    sc: "已收藏",
    tc: "已收藏",
  },
  ALREADY_FOLLOWING: {
    en: "Already following",
    sc: "已关注",
    tc: "已關注",
  },
  CANNOT_BLOCK_SELF: {
    en: "Cannot block yourself",
    sc: "无法拉黑自己",
    tc: "無法拉黑自己",
  },
  CANNOT_FOLLOW_SELF: {
    en: "Cannot follow yourself",
    sc: "无法关注自己",
    tc: "無法關注自己",
  },

  // Poll errors
  INVALID_POLL: {
    en: "Poll requires 2-10 options",
    sc: "投票需要2-10个选项",
    tc: "投票需要2-10個選項",
  },
  ALREADY_VOTED: {
    en: "Already voted",
    sc: "已投票",
    tc: "已投票",
  },

  // Generic errors
  INTERNAL_ERROR: {
    en: "Internal server error",
    sc: "服务器内部错误",
    tc: "服務器內部錯誤",
  },
  UNKNOWN_ERROR: {
    en: "An unexpected error occurred",
    sc: "发生未知错误",
    tc: "發生未知錯誤",
  },
  MISSING_TOKEN: {
    en: "Missing authorization token",
    sc: "缺少授权令牌",
    tc: "缺少授權令牌",
  },
  INVALID_TOKEN: {
    en: "Invalid token",
    sc: "无效的令牌",
    tc: "無效的令牌",
  },
};

// Get error message by code and language
export function getErrorMessage(code: string, lang: string = "en"): string {
  // Normalize language code
  const normalizedLang = lang.toLowerCase().replace("-", "_");

  // Try exact match first
  if (errorMessages[code]?.[normalizedLang]) {
    return errorMessages[code][normalizedLang];
  }

  // Try language family (e.g., "zh_cn" -> "zh")
  const langFamily = normalizedLang.split("_")[0];
  if (langFamily === "zh") {
    return errorMessages[code]?.sc || errorMessages[code]?.en || code;
  }
  if (langFamily === "en") {
    return errorMessages[code]?.en || code;
  }

  // Fallback to English
  return errorMessages[code]?.en || code;
}
