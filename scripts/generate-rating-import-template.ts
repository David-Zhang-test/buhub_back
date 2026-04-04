import * as XLSX from "xlsx";
import fs from "fs";
import path from "path";

const outPath = path.resolve(__dirname, "../docs/rating-import-template.xlsx");

const ratingItemsRows = [
  {
    id: "course-COMP1001",
    category: "COURSE",
    name: "Introduction to Computer Science",
    department: "Department of Computer Science",
    code: "COMP1001",
    email: "",
    location: "",
    avatar: "",
  },
  {
    id: "teacher-prof-jane-smith",
    category: "TEACHER",
    name: "Prof Jane Smith",
    department: "Department of Computer Science",
    code: "",
    email: "jane.smith@hkbu.edu.hk",
    location: "",
    avatar: "",
  },
  {
    id: "canteen-luen-fook-lau",
    category: "CANTEEN",
    name: "Luen Fook Lau",
    department: "Hong Kong Baptist University",
    code: "",
    email: "",
    location: "Shaw Campus",
    avatar: "",
  },
];

const scoreDimensionsRows = [
  {
    category: "COURSE",
    name: "grading",
    label_tc: "打分",
    label_sc: "给分",
    label_en: "Grading",
    left_tc: "嚴苛",
    left_sc: "严苛",
    left_en: "Harsh",
    right_tc: "友好",
    right_sc: "友好",
    right_en: "Generous",
    order: 1,
  },
  {
    category: "COURSE",
    name: "exam",
    label_tc: "考試難度",
    label_sc: "考试难度",
    label_en: "Exam Difficulty",
    left_tc: "困難",
    left_sc: "困难",
    left_en: "Difficult",
    right_tc: "簡單",
    right_sc: "简单",
    right_en: "Easy",
    order: 2,
  },
  {
    category: "COURSE",
    name: "workload",
    label_tc: "功課量",
    label_sc: "作业量",
    label_en: "Workload",
    left_tc: "繁重",
    left_sc: "繁重",
    left_en: "Heavy",
    right_tc: "輕鬆",
    right_sc: "轻松",
    right_en: "Light",
    order: 3,
  },
];

const usersRows = [
  {
    user_ref: "import_user_001",
    mode: "seed",
    user_id: "",
    nickname: "Historical Reviewer 1",
    email: "",
  },
  {
    user_ref: "existing_user_demo",
    mode: "existing",
    user_id: "replace-with-existing-user-id",
    nickname: "",
    email: "",
  },
];

const ratingsRows = [
  {
    item_id: "course-COMP1001",
    category: "COURSE",
    user_ref: "import_user_001",
    semester: "2025S1",
    score_1_key: "grading",
    score_1_value: 4.2,
    score_2_key: "exam",
    score_2_value: 3.7,
    score_3_key: "workload",
    score_3_value: 2.9,
    tags: "#Recommended,#Less HW",
    comment: "Good introductory course with manageable workload.",
    created_at: "2026-04-01T10:00:00Z",
    updated_at: "2026-04-01T10:00:00Z",
  },
  {
    item_id: "teacher-prof-jane-smith",
    category: "TEACHER",
    user_ref: "import_user_001",
    semester: "",
    score_1_key: "teaching",
    score_1_value: 4.8,
    score_2_key: "grading",
    score_2_value: 4.1,
    score_3_key: "accessibility",
    score_3_value: 4.6,
    tags: "#Great Prof,#Recommended",
    comment: "Very clear explanations and helpful after class.",
    created_at: "2026-04-01T10:05:00Z",
    updated_at: "2026-04-01T10:05:00Z",
  },
];

function main() {
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(ratingItemsRows), "RatingItems");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(scoreDimensionsRows), "ScoreDimensions");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(usersRows), "Users");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(ratingsRows), "Ratings");

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  XLSX.writeFile(workbook, outPath);

  console.log(`Generated template: ${outPath}`);
}

try {
  main();
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
