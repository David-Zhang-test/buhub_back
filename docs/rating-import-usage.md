# Rating Import Usage Guide

This guide explains how to use the new rating import template workflow to import:

- rating items
- score dimensions
- historical ratings
- historical comments

The importer is designed for local development and data migration. It does not change runtime rating business logic.

## Scope

This importer supports the following categories:

- `COURSE`
- `TEACHER`
- `CANTEEN`
- `MAJOR`

It imports data into these existing tables:

- `RatingItem`
- `ScoreDimension`
- `Rating`
- `User` for imported seed users when needed

Comments are imported into `Rating.comment`.

## Files

Main files:

- [rating-import-template.xlsx](/Users/krabbypatty/Desktop/UHUB-Development/buhub_back/docs/rating-import-template.xlsx)
- [rating-import-template.md](/Users/krabbypatty/Desktop/UHUB-Development/buhub_back/docs/rating-import-template.md)
- [generate-rating-import-template.mjs](/Users/krabbypatty/Desktop/UHUB-Development/buhub_back/scripts/generate-rating-import-template.mjs)
- [import-rating-bundle.mjs](/Users/krabbypatty/Desktop/UHUB-Development/buhub_back/scripts/import-rating-bundle.mjs)

Package commands:

- `npm run rating:template`
- `npm run rating:import`

## Before You Start

1. Make sure your local backend dependencies are installed.

```bash
cd /Users/krabbypatty/Desktop/UHUB-Development/buhub_back
npm install
```

2. Make sure your local `.env` points to the correct local database.

Required:

- `DATABASE_URL`

Optional but recommended:

- `REDIS_URL`

3. Make sure the database schema has been applied.

```bash
cd /Users/krabbypatty/Desktop/UHUB-Development/buhub_back
npx prisma generate
npx prisma db push
```

## Generate a Fresh Template

If you want a clean workbook template:

```bash
cd /Users/krabbypatty/Desktop/UHUB-Development/buhub_back
npm run rating:template
```

This generates:

- [rating-import-template.xlsx](/Users/krabbypatty/Desktop/UHUB-Development/buhub_back/docs/rating-import-template.xlsx)

## Workbook Structure

The workbook contains 4 sheets:

### `RatingItems`

Used to import rating targets such as courses, teachers, and canteens.

Columns:

- `id`
- `category`
- `name`
- `department`
- `code`
- `email`
- `location`
- `avatar`

Required:

- `id`
- `category`
- `name`
- `department`

Notes:

- `COURSE` usually uses `code`
- `TEACHER` usually uses `email`
- `CANTEEN` usually uses `location`

### `ScoreDimensions`

Used to import scoring dimensions for each category.

Columns:

- `category`
- `name`
- `label_tc`
- `label_sc`
- `label_en`
- `left_tc`
- `left_sc`
- `left_en`
- `right_tc`
- `right_sc`
- `right_en`
- `order`

Required:

- `category`
- `name`
- `order`

Important:

- `category + name` must be unique
- dimension names must match the score keys used in the `Ratings` sheet

### `Users`

Used to map workbook users to either:

- existing real users
- imported seed users

Columns:

- `user_ref`
- `mode`
- `user_id`
- `nickname`
- `email`

Required:

- `user_ref`
- `mode`

Rules:

- `mode=existing`
  - `user_id` is required
  - the user must already exist in the database

- `mode=seed`
  - importer will create or reuse a seed user with id like `import-rater-...`
  - `nickname` is recommended

### `Ratings`

Used to import ratings and comments.

Columns:

- `item_id`
- `category`
- `user_ref`
- `semester`
- `score_1_key`
- `score_1_value`
- `score_2_key`
- `score_2_value`
- `score_3_key`
- `score_3_value`
- `tags`
- `comment`
- `created_at`
- `updated_at`

Required:

- `item_id`
- `category`
- `user_ref`
- at least one `score_x_key + score_x_value`

Rules:

- score values must be on backend scale `0-5`
- `tags` must be comma-separated
- tag count must not exceed 10
- `comment` can be empty
- `created_at` and `updated_at` should be ISO datetime strings if provided
- `(item_id, user_ref, semester)` should not repeat inside the same workbook

## Recommended Import Flow

Use this order:

1. fill `RatingItems`
2. fill `ScoreDimensions`
3. fill `Users`
4. fill `Ratings`
5. run dry-run
6. run execute import

## Dry Run

Always run dry-run first.

```bash
cd /Users/krabbypatty/Desktop/UHUB-Development/buhub_back
npm run rating:import -- --file docs/rating-import-template.xlsx --mode append
```

Dry-run will:

- read the workbook
- summarize row counts
- validate structure at file-read level
- not write anything into the database

Example output:

```json
{
  "filePath": ".../docs/rating-import-template.xlsx",
  "mode": "append",
  "execute": false,
  "summary": {
    "ratingItems": 3,
    "scoreDimensions": 3,
    "users": 2,
    "ratings": 2,
    "categories": ["COURSE", "TEACHER"]
  }
}
```

## Execute Import

After dry-run looks correct:

```bash
cd /Users/krabbypatty/Desktop/UHUB-Development/buhub_back
npm run rating:import -- --file docs/rating-import-template.xlsx --mode append --execute
```

## Import Modes

### `append`

Recommended default.

Behavior:

- upserts `RatingItem`
- upserts `ScoreDimension`
- resolves workbook users
- inserts or updates ratings by `(item_id, user_ref, semester)`
- does not wipe existing unrelated data

Use when:

- importing historical data gradually
- adding a new category dataset
- patching a subset of ratings

### `replace_by_category`

More aggressive.

Behavior:

- deletes existing imported seed-user ratings for workbook categories
- then imports workbook ratings

Use when:

- reloading imported historical ratings for one or more categories

Important:

- this mode only clears ratings created under importer seed users like `import-rater-*`
- it does not wipe normal real-user ratings

## Common Examples

### Import course history only

1. Fill only `COURSE` rows in all relevant sheets.
2. Use `append` first.

```bash
cd /Users/krabbypatty/Desktop/UHUB-Development/buhub_back
npm run rating:import -- --file docs/rating-import-template.xlsx --mode append --execute
```

### Rebuild imported teacher history

1. Fill only `TEACHER` rows.
2. Use `replace_by_category`.

```bash
cd /Users/krabbypatty/Desktop/UHUB-Development/buhub_back
npm run rating:import -- --file docs/rating-import-template.xlsx --mode replace_by_category --execute
```

## Validation Rules

The importer will fail if:

- `category` is invalid
- `item_id` does not exist in `RatingItems`
- `item_id` category does not match rating row category
- `user_ref` does not exist in `Users`
- `mode=existing` but `user_id` is missing or not found
- score key is not defined in `ScoreDimensions` for that category
- score value is outside `0-5`
- too many tags are provided
- datetime format is invalid
- duplicate `(item_id, user_ref, semester)` rows exist in the workbook

## Safety Notes

- Do not run `replace_by_category` unless you really want to replace imported seed-user data for that category.
- Keep a database backup before large imports.
- Run dry-run after every workbook edit.
- If you are importing into a shared environment, confirm the target database first.

## Relationship to Old Scripts

Older scripts are still useful for one-off legacy imports:

- [import-rating-data.ts](/Users/krabbypatty/Desktop/UHUB-Development/buhub_back/scripts/import-rating-data.ts)
- [import-course-ratings.ts](/Users/krabbypatty/Desktop/UHUB-Development/buhub_back/scripts/import-course-ratings.ts)
- [import-course-ratings-full.ts](/Users/krabbypatty/Desktop/UHUB-Development/buhub_back/scripts/import-course-ratings-full.ts)

Use the new importer when:

- you want one Excel-based workflow
- you want to import teacher, course, and canteen history in the same format
- you want structured control over users, ratings, and comments
