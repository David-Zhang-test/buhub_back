# Rating Import Template

This workbook is designed for importing rating entities, dimensions, historical ratings, and comments without changing normal runtime business logic.

Recommended workflow:

1. Generate the template workbook.
2. Fill the workbook sheets.
3. Run the importer in dry-run mode first.
4. Run the importer in execute mode after validation passes.

## Workbook Sheets

### 1. `RatingItems`

Imports rating targets such as courses, teachers, and canteens.

Columns:

- `id`
- `category`
- `name`
- `department`
- `code`
- `email`
- `location`
- `avatar`

Notes:

- `category` must be one of `COURSE`, `TEACHER`, `CANTEEN`, `MAJOR`
- `id` should be stable
- `code` is mainly for courses
- `email` is mainly for teachers
- `location` is mainly for canteens

### 2. `ScoreDimensions`

Imports dimension definitions used by each category.

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

Notes:

- `category + name` must be unique
- `name` must match the score keys used in the `Ratings` sheet

### 3. `Users`

Maps import references to either existing users or generated seed users.

Columns:

- `user_ref`
- `mode`
- `user_id`
- `nickname`
- `email`

Notes:

- `mode` must be `existing` or `seed`
- `user_ref` is referenced by the `Ratings` sheet
- `existing` mode requires `user_id`
- `seed` mode creates or reuses a pseudo-user for imported historical ratings

### 4. `Ratings`

Imports ratings and comments. Comments are stored in the same record as ratings.

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

Notes:

- score values use backend scale `0-5`
- `tags` should be comma-separated
- `comment` may be empty
- `created_at` and `updated_at` should be ISO datetime strings when provided
- `(item_id, user_ref, semester)` should be unique within the file

## Import Modes

The importer supports:

- `append`
  Adds or updates records without deleting existing historical data.

- `replace_by_category`
  Clears imported ratings for the target categories before inserting workbook ratings.
  Use with caution.

## Recommended Commands

Generate template:

```bash
cd /Users/krabbypatty/Desktop/UHUB-Development/buhub_back
node scripts/generate-rating-import-template.mjs
```

Dry run import:

```bash
cd /Users/krabbypatty/Desktop/UHUB-Development/buhub_back
node scripts/import-rating-bundle.mjs --file docs/rating-import-template.xlsx --mode append
```

Execute import:

```bash
cd /Users/krabbypatty/Desktop/UHUB-Development/buhub_back
node scripts/import-rating-bundle.mjs --file docs/rating-import-template.xlsx --mode append --execute
```
