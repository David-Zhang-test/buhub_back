export interface OCRWord {
  text: string;
  bounds: {
    x: number;      // left edge in pixels
    y: number;      // top edge in pixels
    width: number;
    height: number;
  };
}

export interface CourseBlock {
  dayOfWeek: number;   // ISO: Mon=1 .. Sun=7
  startTime: string;   // "HH:mm"
  endTime: string;     // "HH:mm"
  texts: string[];     // raw text lines in this block
}

export interface ParsedCourse {
  name: string;
  location: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}
