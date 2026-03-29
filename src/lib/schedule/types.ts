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

export interface CVBlock {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DocBlock {
  text: string;           // full text content of this block
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface TextGroup {
  yMin: number;           // top y of text group in pixels
  yMax: number;           // bottom y of text group in pixels
  texts: string[];        // raw text lines
}

export interface ColumnData {
  dayOfWeek: number;      // ISO: Mon=1 .. Sun=7
  textGroups: TextGroup[];// text groups sorted by y position
}

export interface TimeScaleEntry {
  y: number;              // y position in pixels (center of label)
  time: string;           // "HH:mm"
}

export interface ParsedCourse {
  name: string;
  location: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

export interface GridColumn {
  left: number;    // left boundary x-pixel
  right: number;   // right boundary x-pixel
  center: number;  // center x-pixel
  index: number;   // 0-based column index
}

export interface ColumnInterval {
  dayOfWeek: number;  // 1-7 (Mon-Sun)
  xMin: number;       // left boundary
  xMax: number;       // right boundary
  xCenter: number;    // center (for fallback nearest-match)
}
