WITH prefix_map AS (
  SELECT *
  FROM (
    VALUES
      ('silent', '靜夜', '静夜', 'Silent'),
      ('moon', '月影', '月影', 'Moon'),
      ('cloud', '流雲', '流云', 'Cloud'),
      ('river', '長河', '长河', 'River'),
      ('moss', '青苔', '青苔', 'Moss'),
      ('ember', '餘燼', '余烬', 'Ember'),
      ('drift', '浮光', '浮光', 'Drift'),
      ('comet', '星尾', '星尾', 'Comet'),
      ('willow', '柳影', '柳影', 'Willow'),
      ('echo', '回聲', '回声', 'Echo'),
      ('harbor', '霧港', '雾港', 'Harbor'),
      ('stone', '山石', '山石', 'Stone')
  ) AS t(en, tc, sc, en_display)
),
suffix_map AS (
  SELECT *
  FROM (
    VALUES
      ('cat', '小貓', '小猫', 'Cat'),
      ('fox', '狐狸', '狐狸', 'Fox'),
      ('whale', '鯨魚', '鲸鱼', 'Whale'),
      ('bird', '飛鳥', '飞鸟', 'Bird'),
      ('star', '星子', '星子', 'Star'),
      ('pine', '松針', '松针', 'Pine'),
      ('lamp', '提燈', '提灯', 'Lamp'),
      ('rain', '細雨', '细雨', 'Rain'),
      ('leaf', '秋葉', '秋叶', 'Leaf'),
      ('wolf', '旅狼', '旅狼', 'Wolf'),
      ('shell', '貝殼', '贝壳', 'Shell'),
      ('brook', '溪流', '溪流', 'Brook')
  ) AS t(en, tc, sc, en_display)
),
post_seed AS (
  SELECT
    p.id,
    trim(p."anonymousName") AS raw_name,
    lower(split_part(trim(p."anonymousName"), ' ', 1)) AS prefix_key,
    lower(split_part(trim(p."anonymousName"), ' ', 2)) AS suffix_key
  FROM "Post" AS p
  WHERE p."isAnonymous" = TRUE
    AND p."anonymousName" IS NOT NULL
    AND left(trim(p."anonymousName"), 1) <> '{'
),
post_mapped AS (
  SELECT
    post_seed.id,
    post_seed.raw_name,
    prefix_map.tc AS prefix_tc,
    prefix_map.sc AS prefix_sc,
    prefix_map.en_display AS prefix_en,
    suffix_map.tc AS suffix_tc,
    suffix_map.sc AS suffix_sc,
    suffix_map.en_display AS suffix_en
  FROM post_seed
  LEFT JOIN prefix_map ON prefix_map.en = post_seed.prefix_key
  LEFT JOIN suffix_map ON suffix_map.en = post_seed.suffix_key
)
UPDATE "Post" AS p
SET "anonymousName" = json_build_object(
  'tc',
  CASE
    WHEN post_mapped.prefix_tc IS NOT NULL AND post_mapped.suffix_tc IS NOT NULL
      THEN post_mapped.prefix_tc || post_mapped.suffix_tc
    ELSE post_mapped.raw_name
  END,
  'sc',
  CASE
    WHEN post_mapped.prefix_sc IS NOT NULL AND post_mapped.suffix_sc IS NOT NULL
      THEN post_mapped.prefix_sc || post_mapped.suffix_sc
    ELSE post_mapped.raw_name
  END,
  'en',
  CASE
    WHEN post_mapped.prefix_en IS NOT NULL AND post_mapped.suffix_en IS NOT NULL
      THEN post_mapped.prefix_en || ' ' || post_mapped.suffix_en
    ELSE post_mapped.raw_name
  END
)::text
FROM post_mapped
WHERE p.id = post_mapped.id;

WITH prefix_map AS (
  SELECT *
  FROM (
    VALUES
      ('silent', '靜夜', '静夜', 'Silent'),
      ('moon', '月影', '月影', 'Moon'),
      ('cloud', '流雲', '流云', 'Cloud'),
      ('river', '長河', '长河', 'River'),
      ('moss', '青苔', '青苔', 'Moss'),
      ('ember', '餘燼', '余烬', 'Ember'),
      ('drift', '浮光', '浮光', 'Drift'),
      ('comet', '星尾', '星尾', 'Comet'),
      ('willow', '柳影', '柳影', 'Willow'),
      ('echo', '回聲', '回声', 'Echo'),
      ('harbor', '霧港', '雾港', 'Harbor'),
      ('stone', '山石', '山石', 'Stone')
  ) AS t(en, tc, sc, en_display)
),
suffix_map AS (
  SELECT *
  FROM (
    VALUES
      ('cat', '小貓', '小猫', 'Cat'),
      ('fox', '狐狸', '狐狸', 'Fox'),
      ('whale', '鯨魚', '鲸鱼', 'Whale'),
      ('bird', '飛鳥', '飞鸟', 'Bird'),
      ('star', '星子', '星子', 'Star'),
      ('pine', '松針', '松针', 'Pine'),
      ('lamp', '提燈', '提灯', 'Lamp'),
      ('rain', '細雨', '细雨', 'Rain'),
      ('leaf', '秋葉', '秋叶', 'Leaf'),
      ('wolf', '旅狼', '旅狼', 'Wolf'),
      ('shell', '貝殼', '贝壳', 'Shell'),
      ('brook', '溪流', '溪流', 'Brook')
  ) AS t(en, tc, sc, en_display)
),
comment_seed AS (
  SELECT
    c.id,
    trim(c."anonymousName") AS raw_name,
    lower(split_part(trim(c."anonymousName"), ' ', 1)) AS prefix_key,
    lower(split_part(trim(c."anonymousName"), ' ', 2)) AS suffix_key
  FROM "Comment" AS c
  WHERE c."isAnonymous" = TRUE
    AND c."anonymousName" IS NOT NULL
    AND left(trim(c."anonymousName"), 1) <> '{'
),
comment_mapped AS (
  SELECT
    comment_seed.id,
    comment_seed.raw_name,
    prefix_map.tc AS prefix_tc,
    prefix_map.sc AS prefix_sc,
    prefix_map.en_display AS prefix_en,
    suffix_map.tc AS suffix_tc,
    suffix_map.sc AS suffix_sc,
    suffix_map.en_display AS suffix_en
  FROM comment_seed
  LEFT JOIN prefix_map ON prefix_map.en = comment_seed.prefix_key
  LEFT JOIN suffix_map ON suffix_map.en = comment_seed.suffix_key
)
UPDATE "Comment" AS c
SET "anonymousName" = json_build_object(
  'tc',
  CASE
    WHEN comment_mapped.prefix_tc IS NOT NULL AND comment_mapped.suffix_tc IS NOT NULL
      THEN comment_mapped.prefix_tc || comment_mapped.suffix_tc
    ELSE comment_mapped.raw_name
  END,
  'sc',
  CASE
    WHEN comment_mapped.prefix_sc IS NOT NULL AND comment_mapped.suffix_sc IS NOT NULL
      THEN comment_mapped.prefix_sc || comment_mapped.suffix_sc
    ELSE comment_mapped.raw_name
  END,
  'en',
  CASE
    WHEN comment_mapped.prefix_en IS NOT NULL AND comment_mapped.suffix_en IS NOT NULL
      THEN comment_mapped.prefix_en || ' ' || comment_mapped.suffix_en
    ELSE comment_mapped.raw_name
  END
)::text
FROM comment_mapped
WHERE c.id = comment_mapped.id;
