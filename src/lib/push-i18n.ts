import type { AppLanguage } from "./language";
import { prisma } from "./db";

type PushStrings = Record<string, string>;

const translations: Record<AppLanguage, PushStrings> = {
  tc: {
    "like.post": "{actor} 讚了你的帖子",
    "like.comment": "{actor} 讚了你的評論",
    "bookmark.post": "{actor} 收藏了你的帖子",
    "bookmark.comment": "{actor} 收藏了你的評論",
    "comment.post": "{actor} 評論了你的帖子",
    "reply.comment": "{actor} 回覆了你的評論",
    "mention.comment": "{actor} 在評論中提到了你",
    "follow": "{actor} 關注了你",
    "repost": "{actor} 轉發了你的帖子",
    "message.new": "{actor} 給你發了一條私信",
    "fallback.post": "打開 ULink 查看帖子",
    "fallback.comment": "打開 ULink 查看評論",
    "fallback.reply": "打開 ULink 查看回覆",
    "fallback.mention": "打開 ULink 查看提及",
    "fallback.profile": "打開 ULink 查看他的主頁",
    "fallback.message": "打開 ULink 查看新消息",
    "msg.photo": "圖片",
    "msg.photos": "{count} 張圖片",
    "msg.reaction": "回應了 {emoji}",
    "msg.voice": "語音消息",
    "msg.card": "分享了一張卡片",
    "msg.card.title": "分享：{title}",
    "task.expiring.partner": "你的搭子帖子即將到期",
    "task.expiring.errand": "你的跑腿帖子即將到期",
    "task.expiring.secondhand": "你的二手物品即將到期",
    "task.expired.partner": "你的搭子帖子已過期",
    "task.expired.errand": "你的跑腿帖子已過期",
    "task.expired.secondhand": "你的二手物品已過期",
    "task.expiring.body": "「{title}」將在{remaining}後到期",
    "task.expired.body": "「{title}」已標記為過期",
    "remaining.1hour": "1小時內",
    "remaining.hours": "{hours}小時",
    "remaining.1day": "24小時內",
    "remaining.days": "{days}天",
    "new_post.title": "ULink",
    "new_post.body": "{actor} 發佈了：{preview}",
    "new_post.anon_body": "有人發佈了新帖子",
    "locker.broadcast.title": "ULinks 寄存",
    "locker.broadcast.body": "寄存資訊有更新，請查看",
    "locker.status.title": "ULinks 寄存",
    "locker.status.dropOffProcessing": "你的寄存申請正在處理中",
    "locker.status.dropOffComplete": "你的寄存物品已收妥",
    "locker.status.pickUpProcessing": "你的物品準備好取件了",
    "locker.status.pickUpComplete": "已確認你已取件，感謝使用",
    "actor.anonymous": "匿名用戶",
  },
  sc: {
    "like.post": "{actor} 赞了你的帖子",
    "like.comment": "{actor} 赞了你的评论",
    "bookmark.post": "{actor} 收藏了你的帖子",
    "bookmark.comment": "{actor} 收藏了你的评论",
    "comment.post": "{actor} 评论了你的帖子",
    "reply.comment": "{actor} 回复了你的评论",
    "mention.comment": "{actor} 在评论中提到了你",
    "follow": "{actor} 关注了你",
    "repost": "{actor} 转发了你的帖子",
    "message.new": "{actor} 给你发了一条私信",
    "fallback.post": "打开 ULink 查看帖子",
    "fallback.comment": "打开 ULink 查看评论",
    "fallback.reply": "打开 ULink 查看回复",
    "fallback.mention": "打开 ULink 查看提及",
    "fallback.profile": "打开 ULink 查看他的主页",
    "fallback.message": "打开 ULink 查看新消息",
    "msg.photo": "图片",
    "msg.photos": "{count} 张图片",
    "msg.reaction": "回应了 {emoji}",
    "msg.voice": "语音消息",
    "msg.card": "分享了一张卡片",
    "msg.card.title": "分享：{title}",
    "task.expiring.partner": "你的搭子帖子即将到期",
    "task.expiring.errand": "你的跑腿帖子即将到期",
    "task.expiring.secondhand": "你的二手物品即将到期",
    "task.expired.partner": "你的搭子帖子已过期",
    "task.expired.errand": "你的跑腿帖子已过期",
    "task.expired.secondhand": "你的二手物品已过期",
    "task.expiring.body": "「{title}」将在{remaining}后到期",
    "task.expired.body": "「{title}」已标记为过期",
    "remaining.1hour": "1小时内",
    "remaining.hours": "{hours}小时",
    "remaining.1day": "24小时内",
    "remaining.days": "{days}天",
    "new_post.title": "ULink",
    "new_post.body": "{actor} 发布了：{preview}",
    "new_post.anon_body": "有人发布了新帖子",
    "locker.broadcast.title": "ULinks 寄存",
    "locker.broadcast.body": "寄存信息有更新，请查看",
    "locker.status.title": "ULinks 寄存",
    "locker.status.dropOffProcessing": "你的寄存申请正在处理中",
    "locker.status.dropOffComplete": "你的寄存物品已收妥",
    "locker.status.pickUpProcessing": "你的物品准备好取件了",
    "locker.status.pickUpComplete": "已确认你已取件，感谢使用",
    "actor.anonymous": "匿名用户",
  },
  en: {
    "like.post": "{actor} liked your post",
    "like.comment": "{actor} liked your comment",
    "bookmark.post": "{actor} bookmarked your post",
    "bookmark.comment": "{actor} bookmarked your comment",
    "comment.post": "{actor} commented on your post",
    "reply.comment": "{actor} replied to your comment",
    "mention.comment": "{actor} mentioned you in a comment",
    "follow": "{actor} followed you",
    "repost": "{actor} reposted your post",
    "message.new": "New message from {actor}",
    "fallback.post": "Open ULink to view the post.",
    "fallback.comment": "Open ULink to view the comment.",
    "fallback.reply": "Open ULink to view the reply.",
    "fallback.mention": "Open ULink to view the mention.",
    "fallback.profile": "Open ULink to view their profile.",
    "fallback.message": "Open ULink to view the new message.",
    "msg.photo": "Picture",
    "msg.photos": "{count} Pictures",
    "msg.reaction": "Reacted {emoji}",
    "msg.voice": "Voice message",
    "msg.card": "Shared a card",
    "msg.card.title": "Shared: {title}",
    "task.expiring.partner": "Your buddy-up post expires soon",
    "task.expiring.errand": "Your errand post expires soon",
    "task.expiring.secondhand": "Your secondhand listing expires soon",
    "task.expired.partner": "Your buddy-up post has expired",
    "task.expired.errand": "Your errand post has expired",
    "task.expired.secondhand": "Your secondhand listing has expired",
    "task.expiring.body": "\"{title}\" expires {remaining}.",
    "task.expired.body": "\"{title}\" is now marked as expired.",
    "remaining.1hour": "within 1 hour",
    "remaining.hours": "in {hours} hours",
    "remaining.1day": "within 24 hours",
    "remaining.days": "in {days} days",
    "new_post.title": "ULink",
    "new_post.body": "{actor} posted: {preview}",
    "new_post.anon_body": "Someone published a new post",
    "locker.broadcast.title": "ULinks Locker",
    "locker.broadcast.body": "Locker info has been updated. Tap to view.",
    "locker.status.title": "ULinks Locker",
    "locker.status.dropOffProcessing": "Your drop-off request is being processed",
    "locker.status.dropOffComplete": "Your item has been received",
    "locker.status.pickUpProcessing": "Your item is ready for pickup",
    "locker.status.pickUpComplete": "Pickup confirmed — thanks for using ULinks",
    "actor.anonymous": "Anonymous user",
  },
};

export function pushT(
  lang: AppLanguage,
  key: string,
  params?: Record<string, string | number>,
): string {
  const str = translations[lang]?.[key] ?? translations.en[key] ?? key;
  if (!params) return str;
  return Object.entries(params).reduce<string>(
    (result, [k, v]) => result.replaceAll(`{${k}}`, String(v)),
    str,
  );
}

export async function getUserLanguage(userId: string): Promise<AppLanguage> {
  try {
    const row = await prisma.user.findUnique({
      where: { id: userId },
      select: { language: true },
    });
    const lang = row?.language;
    if (lang === "tc" || lang === "sc" || lang === "en") return lang;
    return "tc";
  } catch {
    return "tc";
  }
}

export function buildRemainingLabelLocalized(
  expiresAt: Date,
  now: Date,
  lang: AppLanguage,
): string {
  const diffMs = expiresAt.getTime() - now.getTime();
  const hours = Math.max(1, Math.ceil(diffMs / (60 * 60 * 1000)));
  if (hours <= 1) return pushT(lang, "remaining.1hour");
  if (hours < 24) return pushT(lang, "remaining.hours", { hours });
  const days = Math.ceil(hours / 24);
  if (days <= 1) return pushT(lang, "remaining.1day");
  return pushT(lang, "remaining.days", { days });
}
