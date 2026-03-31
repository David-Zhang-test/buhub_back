#!/usr/bin/env python3
"""
Detect colored course blocks AND vertical grid lines in a timetable image.
Input: image path as argument
Output: JSON with blocks + grid columns to stdout
"""
import sys
import json
import cv2
import numpy as np

def detect_grid_columns(img):
    """Detect vertical grid lines → determine column boundaries."""
    h, w = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Focus on the timetable area (skip top header ~10%, bottom ~3%)
    y_start = int(h * 0.10)
    y_end = int(h * 0.97)
    roi = gray[y_start:y_end, :]
    roi_h = y_end - y_start

    # Strategy: scan each column of pixels for vertical consistency
    # A grid line = a column where pixel values are consistently different from neighbors
    # This works for both dark lines (web) and faint gray lines (mobile)

    # Method 1: Morphological vertical line extraction (for clear lines)
    vert_kernel_len = roi_h // 6
    vert_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, vert_kernel_len))

    _, thresh = cv2.threshold(roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    edges = cv2.Canny(roi, 20, 80)  # lower thresholds for faint lines
    combined = cv2.bitwise_or(thresh, edges)
    vert_lines = cv2.morphologyEx(combined, cv2.MORPH_OPEN, vert_kernel)

    # Method 2: Column variance — grid lines have lower variance than content
    # Scan vertical strips and look for columns with consistent brightness
    col_sums_morph = np.sum(vert_lines, axis=0).astype(float)

    # Method 3: Gradient-based — look for vertical edges
    sobelx = cv2.Sobel(roi, cv2.CV_64F, 1, 0, ksize=1)
    abs_sobelx = np.abs(sobelx)
    col_sums_sobel = np.sum(abs_sobelx, axis=0)

    # Combine: use whichever method has stronger signal
    col_sums_morph_norm = col_sums_morph / (col_sums_morph.max() + 1e-6)
    col_sums_sobel_norm = col_sums_sobel / (col_sums_sobel.max() + 1e-6)
    col_sums = np.maximum(col_sums_morph_norm, col_sums_sobel_norm * 0.5)

    # Normalize and find peaks (columns with high sum = vertical lines)
    if col_sums.max() == 0:
        return []

    threshold = col_sums.max() * 0.2  # lower threshold to catch faint lines
    line_positions = []
    in_peak = False
    peak_start = 0

    for x in range(len(col_sums)):
        if col_sums[x] > threshold and not in_peak:
            peak_start = x
            in_peak = True
        elif col_sums[x] <= threshold and in_peak:
            line_positions.append((peak_start + x) // 2)  # center of peak
            in_peak = False
    if in_peak:
        line_positions.append((peak_start + len(col_sums) - 1) // 2)

    # Filter: remove lines that are too close together (< 3% of width)
    min_gap = w * 0.03
    filtered = [line_positions[0]] if line_positions else []
    for i in range(1, len(line_positions)):
        if line_positions[i] - filtered[-1] >= min_gap:
            filtered.append(line_positions[i])

    # Build column ranges from consecutive line positions
    columns = []
    for i in range(len(filtered) - 1):
        columns.append({
            "left": int(filtered[i]),
            "right": int(filtered[i + 1]),
            "center": int((filtered[i] + filtered[i + 1]) // 2),
            "index": i,  # 0-based column index
        })

    return columns

def detect_course_blocks(image_path):
    img = cv2.imread(image_path)
    if img is None:
        return {"error": f"Cannot read image: {image_path}"}

    h, w = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    # Mask 1: Saturated colors (green, orange, blue, etc.)
    sat_mask = cv2.inRange(hsv, np.array([0, 15, 80]), np.array([180, 255, 255]))

    # Mask 2: Light gray blocks (low saturation, medium brightness)
    gray_mask = cv2.inRange(hsv, np.array([0, 0, 120]), np.array([180, 30, 240]))

    combined = cv2.bitwise_or(sat_mask, gray_mask)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel, iterations=2)
    combined = cv2.morphologyEx(combined, cv2.MORPH_OPEN, kernel, iterations=1)

    contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    blocks = []
    min_area = w * h * 0.0025
    max_area = w * h * 0.3

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < min_area or area > max_area:
            continue

        x, y, bw, bh = cv2.boundingRect(contour)

        if bw < 20 or bh < 20:
            continue
        if y < h * 0.10:
            continue
        if bw > w * 0.6:
            continue
        if bh < h * 0.02:
            continue

        # CV-02: Aspect ratio filter -- reject thin border remnants
        aspect_ratio = max(bw / bh, bh / bw) if min(bw, bh) > 0 else 999
        if aspect_ratio > 6:
            continue

        blocks.append({
            "x": int(x),
            "y": int(y),
            "width": int(bw),
            "height": int(bh),
        })

    blocks.sort(key=lambda b: (b["x"], b["y"]))

    # Detect grid columns
    grid_columns = detect_grid_columns(img)

    return {
        "imageWidth": int(w),
        "imageHeight": int(h),
        "blocks": blocks,
        "gridColumns": grid_columns,
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: detect-blocks.py <image-path>"}))
        sys.exit(1)

    result = detect_course_blocks(sys.argv[1])
    print(json.dumps(result))
