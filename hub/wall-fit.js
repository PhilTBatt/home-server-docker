// @ts-check

/**
 * @typedef {[number, number]} Point
 * @typedef {[Point, Point, Point, Point]} Corners
 * @typedef {{ corners: Corners, screen: [number, number] }} Fit
 */

export const fitKey = "wall-fit";
export const smallestSide = 40;

/**
 * @param {number[][]} rows
 * @returns {number[] | null}
 */
export function solve(rows) {
  const size = rows.length;
  const grid = rows.map((row) => [...row]);
  for (let column = 0; column < size; column++) {
    let best = column;
    for (let row = column + 1; row < size; row++) if (Math.abs(grid[row][column]) > Math.abs(grid[best][column])) best = row;
    if (Math.abs(grid[best][column]) < 1e-10) return null;
    [grid[column], grid[best]] = [grid[best], grid[column]];
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = grid[row][column] / grid[column][column];
      for (let k = column; k <= size; k++) grid[row][k] -= factor * grid[column][k];
    }
  }
  return grid.map((row, i) => row[size] / row[i]);
}

/**
 * @param {Corners} from
 * @param {Corners} to
 * @returns {number[] | null}
 */
export function homography(from, to) {
  /** @type {number[][]} */
  const rows = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = from[i];
    const [u, v] = to[i];
    rows.push([x, y, 1, 0, 0, 0, -x * u, -y * u, u]);
    rows.push([0, 0, 0, x, y, 1, -x * v, -y * v, v]);
  }
  const found = solve(rows);
  if (found === null || found.some((value) => !Number.isFinite(value))) return null;
  return [...found, 1];
}

/**
 * @param {number[]} h
 * @param {Point} point
 * @returns {Point}
 */
export function project(h, point) {
  const [x, y] = point;
  const w = h[6] * x + h[7] * y + h[8];
  return [(h[0] * x + h[1] * y + h[2]) / w, (h[3] * x + h[4] * y + h[5]) / w];
}

/**
 * @param {Corners} corners
 * @returns {boolean}
 */
export function isConvex(corners) {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i];
    const [bx, by] = corners[(i + 1) % 4];
    const [cx, cy] = corners[(i + 2) % 4];
    const turn = (bx - ax) * (cy - by) - (by - ay) * (cx - bx);
    if (Math.abs(turn) < 1e-9) return false;
    const now = Math.sign(turn);
    if (sign !== 0 && now !== sign) return false;
    sign = now;
  }
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i];
    const [bx, by] = corners[(i + 1) % 4];
    if (Math.hypot(bx - ax, by - ay) < smallestSide) return false;
  }
  return sign > 0;
}

/**
 * @param {Corners} corners
 * @param {number} width
 * @param {number} height
 * @returns {string | null}
 */
export function matrixFor(corners, width, height) {
  if (!isConvex(corners)) return null;
  const h = homography([[0, 0], [width, 0], [width, height], [0, height]], corners);
  if (h === null) return null;
  const values = [h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, h[8]];
  return `matrix3d(${values.map((value) => Number(value.toFixed(10))).join(", ")})`;
}

/**
 * @param {number} screenWidth
 * @param {number} screenHeight
 * @param {number} width
 * @param {number} height
 * @returns {Corners}
 */
export function letterbox(screenWidth, screenHeight, width, height) {
  const scale = Math.min(screenWidth / width, screenHeight / height);
  const left = (screenWidth - width * scale) / 2;
  const top = (screenHeight - height * scale) / 2;
  const right = left + width * scale;
  const bottom = top + height * scale;
  return [[left, top], [right, top], [right, bottom], [left, bottom]];
}

/**
 * @param {unknown} value
 * @returns {value is Point}
 */
function isPoint(value) {
  return Array.isArray(value) && value.length === 2 && value.every((part) => typeof part === "number" && Number.isFinite(part));
}

/**
 * @param {string | null} text
 * @param {number} screenWidth
 * @param {number} screenHeight
 * @returns {Corners | null}
 */
export function readFit(text, screenWidth, screenHeight) {
  if (text === null) return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { corners, screen } = /** @type {{ corners?: unknown, screen?: unknown }} */ (parsed);
  if (!Array.isArray(screen) || screen[0] !== screenWidth || screen[1] !== screenHeight) return null;
  if (!Array.isArray(corners) || corners.length !== 4 || !corners.every(isPoint)) return null;
  const fit = /** @type {Corners} */ (corners);
  return isConvex(fit) ? fit : null;
}

/**
 * @param {Corners} corners
 * @param {number} screenWidth
 * @param {number} screenHeight
 * @returns {string}
 */
export function writeFit(corners, screenWidth, screenHeight) {
  /** @type {Fit} */
  const fit = { corners: /** @type {Corners} */ (corners.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])), screen: [screenWidth, screenHeight] };
  return JSON.stringify(fit);
}

/**
 * @param {Corners} corners
 * @param {number} index
 * @param {Point} to
 * @param {number} screenWidth
 * @param {number} screenHeight
 * @returns {Corners}
 */
export function moveCorner(corners, index, to, screenWidth, screenHeight) {
  const moved = /** @type {Corners} */ (corners.map((corner) => [corner[0], corner[1]]));
  moved[index] = [Math.max(0, Math.min(screenWidth, to[0])), Math.max(0, Math.min(screenHeight, to[1]))];
  return moved;
}
