#!/usr/bin/env python3
"""
Detect colored course blocks in a timetable image using OpenCV.
Input: image path as argument
Output: JSON array of block bounding boxes to stdout
"""
import sys
import json
import cv2
import numpy as np

def detect_course_blocks(image_path):
    img = cv2.imread(image_path)
    if img is None:
        return {"error": f"Cannot read image: {image_path}"}

    h, w = img.shape[:2]
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)

    # Detect saturated colors (course blocks are colored: green, orange, etc.)
    # Also detect gray blocks (web timetable uses light gray)
    # Strategy: find non-white, non-dark regions

    # Mask 1: Saturated colors (green, orange, blue, etc.)
    sat_mask = cv2.inRange(hsv, np.array([0, 40, 80]), np.array([180, 255, 255]))

    # Mask 2: Light gray blocks (low saturation, medium brightness)
    gray_mask = cv2.inRange(hsv, np.array([0, 0, 160]), np.array([180, 30, 220]))

    # Combine masks
    combined = cv2.bitwise_or(sat_mask, gray_mask)

    # Clean up: close small gaps, remove noise
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    combined = cv2.morphologyEx(combined, cv2.MORPH_CLOSE, kernel, iterations=2)
    combined = cv2.morphologyEx(combined, cv2.MORPH_OPEN, kernel, iterations=1)

    # Find contours
    contours, _ = cv2.findContours(combined, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    blocks = []
    min_area = w * h * 0.001  # minimum 0.1% of image area
    max_area = w * h * 0.3    # maximum 30% of image area

    for contour in contours:
        area = cv2.contourArea(contour)
        if area < min_area or area > max_area:
            continue

        x, y, bw, bh = cv2.boundingRect(contour)

        # Filter: blocks should be roughly rectangular
        # Aspect ratio: width should be > height * 0.3 (not too narrow vertically)
        if bw < 20 or bh < 20:
            continue

        # Skip blocks at the very top (status bar / header)
        if y < h * 0.08:
            continue

        blocks.append({
            "x": int(x),
            "y": int(y),
            "width": int(bw),
            "height": int(bh),
        })

    # Sort by x then y
    blocks.sort(key=lambda b: (b["x"], b["y"]))

    return {
        "imageWidth": int(w),
        "imageHeight": int(h),
        "blocks": blocks,
    }

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: detect-blocks.py <image-path>"}))
        sys.exit(1)

    result = detect_course_blocks(sys.argv[1])
    print(json.dumps(result))
