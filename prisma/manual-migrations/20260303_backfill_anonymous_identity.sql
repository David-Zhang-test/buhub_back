WITH post_seed AS (
  SELECT
    id,
    (ARRAY['silent', 'moon', 'cloud', 'river', 'moss', 'ember', 'drift', 'comet', 'willow', 'echo', 'harbor', 'stone'])[1 + floor(random() * 12)::int] AS prefix,
    (ARRAY['cat', 'fox', 'whale', 'bird', 'star', 'pine', 'lamp', 'rain', 'leaf', 'wolf', 'shell', 'brook'])[1 + floor(random() * 12)::int] AS suffix,
    (ARRAY['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#F4A261', '#84A59D'])[1 + floor(random() * 8)::int] AS color
  FROM "Post"
  WHERE "isAnonymous" = TRUE
    AND ("anonymousName" IS NULL OR "anonymousAvatar" IS NULL)
)
UPDATE "Post" AS p
SET
  "anonymousName" = COALESCE(p."anonymousName", initcap(post_seed.prefix) || ' ' || initcap(post_seed.suffix)),
  "anonymousAvatar" = COALESCE(p."anonymousAvatar", post_seed.color)
FROM post_seed
WHERE p.id = post_seed.id;

WITH comment_seed AS (
  SELECT
    id,
    (ARRAY['silent', 'moon', 'cloud', 'river', 'moss', 'ember', 'drift', 'comet', 'willow', 'echo', 'harbor', 'stone'])[1 + floor(random() * 12)::int] AS prefix,
    (ARRAY['cat', 'fox', 'whale', 'bird', 'star', 'pine', 'lamp', 'rain', 'leaf', 'wolf', 'shell', 'brook'])[1 + floor(random() * 12)::int] AS suffix,
    (ARRAY['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#F4A261', '#84A59D'])[1 + floor(random() * 8)::int] AS color
  FROM "Comment"
  WHERE "isAnonymous" = TRUE
    AND ("anonymousName" IS NULL OR "anonymousAvatar" IS NULL)
)
UPDATE "Comment" AS c
SET
  "anonymousName" = COALESCE(c."anonymousName", initcap(comment_seed.prefix) || ' ' || initcap(comment_seed.suffix)),
  "anonymousAvatar" = COALESCE(c."anonymousAvatar", comment_seed.color)
FROM comment_seed
WHERE c.id = comment_seed.id;
