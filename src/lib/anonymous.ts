// Anonymous identity utilities
// Generates consistent anonymous identity for each user based on their ID

const ANONYMOUS_PREFIXES = [
  '星星', '月光', '阳光', '云朵', '微风',
  '樱花', '枫叶', '雪花', '彩虹', '海浪',
  '小鹿', '小猫', '小狗', '兔子', '狐狸',
  '星星', '月亮', '太阳', '天空', '大地',
];

const ANONYMOUS_SUFFIXES = [
  '同学', '小伙伴', '朋友', '学子', '行者',
  '旅人', '追光者', '梦想家', '旅行者', '倾听者',
];

/**
 * Generate consistent anonymous identity based on user ID
 * Same user will always get the same anonymous nickname
 */
export function generateAnonymousIdentity(userId: string): {
  name: string;
  avatar: string;
} {
  // Use user ID to generate a consistent index
  const hash = userId.split('').reduce((acc, char) => {
    return char.charCodeAt(0) + ((acc << 5) - acc);
  }, 0);

  const prefixIndex = Math.abs(hash) % ANONYMOUS_PREFIXES.length;
  const suffixIndex = Math.abs(hash >> 8) % ANONYMOUS_SUFFIXES.length;

  const name = `匿${ANONYMOUS_PREFIXES[prefixIndex]}${ANONYMOUS_SUFFIXES[suffixIndex]}`;

  // Generate a consistent color based on user ID
  const colorIndex = Math.abs(hash >> 16) % 6;
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD'];

  return {
    name,
    avatar: colors[colorIndex],
  };
}
