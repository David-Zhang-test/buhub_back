---
status: awaiting_human_verify
trigger: "961位教师中有98个邮箱被多人共用、148位教师的邮箱明显属于别人。导入脚本把同一课程的多个instructor都绑了同一个邮箱，或邮箱列和老师列顺序对不上。"
created: 2026-03-31T00:00:00Z
updated: 2026-03-31T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED -- The positional pairing of Instructor(s) and Email(s) columns is fundamentally broken. The Email(s) column often has fewer entries than Instructor(s) (e.g., one email for a multi-instructor course). The first instructor in the list gets the email regardless of whether it belongs to them.
test: Queried DB for mismatched teachers -- found 79 clear mismatches and 117 shared-email groups affecting 252 teachers.
expecting: N/A -- root cause confirmed
next_action: Implement fix: remove positional pairing from courseEmailLookup, only assign emails from the separate instructor-emails file or when instructor count == email count in a row.

## Symptoms

expected: 每个教师有自己独立的邮箱，邮箱中包含教师姓名信息（如 jsmith@hkbu.edu.hk 对应 John Smith）
actual: 98个邮箱被多人共用（如 whchoiso@hkbu.edu.hk 同时分配给了4个不同的老师），148位教师的邮箱明显属于别人（如 Dr FENG, Jian 的邮箱是 mandel@hkbu.edu.hk）
errors: 无运行时错误，是数据质量问题
reproduction: 运行 import-courses-teachers.ts 导入脚本后查看数据库中 RatingItem 表的 TEACHER 类别记录
started: 数据导入时就已经存在问题

## Eliminated

- hypothesis: normalizeName causes collisions (two different people hash to same key)
  evidence: While duplicate teacher records exist (e.g., "Mandel W M CHAN" and "Mr Chan, Mandel W M"), these are actually the SAME person with different name formats. normalizeName("FENG, Jian") = "feng jian" which is different from "chan mandel w m" -- no false collisions found causing the email bug.
  timestamp: 2026-03-31T00:05:00Z

## Evidence

- timestamp: 2026-03-31T00:01:00Z
  checked: import-courses-teachers.ts parsing logic (lines 133-143)
  found: courseEmailLookup splits both Instructor(s) and Email(s) by semicolons and pairs them positionally using index i
  implication: If a row has 3 instructors but only 1 email, emails array after split will be ["email@...", ""] or ["email@.."] (length 1), so emails[1] and emails[2] will be undefined -> no incorrect assignment here for sharing, but teachers 2+ get no email from course file

- timestamp: 2026-03-31T00:02:00Z
  checked: import-courses-teachers.ts teacher map building (lines 149-165)
  found: teacherMap lookup priority is emailLookup.get(key) || courseEmailLookup.get(key). The emailLookup is built from a separate instructor emails file with "Instructor Name" and "Email" columns.
  implication: The email file is a separate data source. If normalizeName creates collisions (two different people normalize to the same key), they would share the same email entry.

- timestamp: 2026-03-31T00:03:00Z
  checked: normalizeName function
  found: Strips title prefix (Dr/Prof/etc), replaces commas with spaces, lowercases. "FENG, Jian" -> "feng jian". "FENG Jian" -> "feng jian". These would match -- which is correct. But name format is "Last, First" in one file and could be "First Last" in another.
  implication: normalizeName converts "FENG, Jian" to "feng jian" but "Jian FENG" would also become "jian feng" -- these are DIFFERENT keys for the same person. The lookup would fail to match.

## Resolution

root_cause: Both import scripts (import-courses-teachers.ts and import-teachers-from-xls.ts) do positional pairing of the Instructor(s) and Email(s) columns from the courses Excel file. When a course row has multiple instructors (semicolon-separated) but fewer emails (often just one), the code assigns the first email to the first instructor by index, regardless of who the email actually belongs to. This causes: (1) wrong email assignment (e.g., "Dr FENG, Jian" gets "mandel@hkbu.edu.hk" because FENG was listed first in a row where Mandel Chan's email was the only email), and (2) email sharing across unrelated teachers who happened to co-teach with the email owner. Additionally, duplicate teacher records exist from different name formats (e.g., "Mr Chan, Mandel W M" vs "Mandel W M CHAN") which are the same person but not deduplicated.
fix: |
  1. Fixed import-courses-teachers.ts: Replaced blind positional pairing of Instructor(s)/Email(s) columns with safe logic -- only positional pair when counts match; otherwise use email-username-to-name heuristic matching.
  2. Fixed import-teachers-from-xls.ts: Same fix applied.
  3. Created fix-teacher-emails.ts cleanup script that: (Phase 1) nullified 148 wrong email assignments, (Phase 2) merged 74 duplicate teacher records, (Phase 3) resolved 11 remaining shared-email groups by comparing match quality scores.
  4. Strengthened emailMatchesName heuristic to require 3+ character tokens, preventing false positives on short surnames like "ho", "li", "ng".
verification: |
  - Before: 961 teachers, 98 shared emails, 148+ mismatched emails
  - After: 887 teachers, 0 shared emails, 380 with correctly matched email
  - Spot-checked previously problematic cases (Dr FENG Jian, Mr Tam J M, Prof Pitsiladis) -- all now have null email (correctly cleared)
  - Spot-checked correct assignments (adamcheung, acschwartz, candyho) -- all preserved
files_changed:
  - scripts/import-courses-teachers.ts
  - scripts/import-teachers-from-xls.ts
  - scripts/fix-teacher-emails.ts (new)
