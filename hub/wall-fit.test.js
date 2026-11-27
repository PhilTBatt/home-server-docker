// @ts-check
import assert from "node:assert/strict";
import { test } from "node:test";
import { homography, isConvex, letterbox, matrixFor, moveCorner, project, readFit, solve, writeFit } from "./wall-fit.js";

/** @type {import("./wall-fit.js").Corners} */
const page = [[0, 0], [1280, 0], [1280, 720], [0, 720]];

/**
 * @param {number[]} a
 * @param {number[]} b
 * @param {number} [within]
 */
function near(a, b, within = 1e-6) {
  assert.equal(a.length, b.length);
  a.forEach((value, i) => assert.ok(Math.abs(value - b[i]) <= within, `${value} isn't near ${b[i]} at ${i}`));
}

test("linear equations are solved, and ones with no single answer are refused", () => {
  near(/** @type {number[]} */ (solve([[2, 1, 5], [1, 3, 10]])), [1, 3]);
  near(/** @type {number[]} */ (solve([[0, 1, 2], [1, 0, 3]])), [3, 2], 1e-12);
  assert.equal(solve([[1, 2, 3], [2, 4, 6]]), null);
});

test("the same four corners give the plain matrix", () => {
  near(/** @type {number[]} */ (homography(page, page)), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
});

test("a shift and a scale come out as one", () => {
  const h = /** @type {number[]} */ (homography(page, [[100, 50], [740, 50], [740, 410], [100, 410]]));
  near(h, [0.5, 0, 100, 0, 0.5, 50, 0, 0, 1]);
});

test("a bent shape sends each corner of the page to its corner, and the middle to where the diagonals cross", () => {
  /** @type {import("./wall-fit.js").Corners} */
  const wall = [[210, 120], [1650, 40], [1580, 990], [260, 880]];
  const h = /** @type {number[]} */ (homography(page, wall));
  page.forEach((corner, i) => near(project(h, corner), wall[i], 1e-6));
  const [[ax, ay], [bx, by], [cx, cy], [dx, dy]] = wall;
  const t = ((dx - ax) * (dy - by) - (dy - ay) * (dx - bx)) / ((cx - ax) * (dy - by) - (cy - ay) * (dx - bx));
  near(project(h, [640, 360]), [ax + t * (cx - ax), ay + t * (cy - ay)], 1e-6);
  assert.ok(Math.abs(h[6]) > 0 || Math.abs(h[7]) > 0, "a bent shape needs perspective, not just a skew");
});

test("a shape that crosses itself, folds, or has corners on top of each other is refused", () => {
  assert.equal(isConvex(page), true);
  assert.equal(isConvex([[0, 0], [1280, 720], [1280, 0], [0, 720]]), false);
  assert.equal(isConvex([[0, 0], [1280, 0], [300, 300], [0, 720]]), false);
  assert.equal(isConvex([[0, 0], [640, 0], [1280, 0], [0, 720]]), false);
  assert.equal(isConvex([[0, 0], [20, 0], [20, 20], [0, 20]]), false);
  assert.equal(isConvex([[0, 720], [1280, 720], [1280, 0], [0, 0]]), false, "upside down is mirrored, so it's refused");
});

test("the CSS matrix is the corner maps' numbers in the order CSS reads them, column by column", () => {
  assert.equal(matrixFor(page, 1280, 720), "matrix3d(1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1)");
  assert.equal(matrixFor([[100, 50], [740, 50], [740, 410], [100, 410]], 1280, 720), "matrix3d(0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 1, 0, 100, 50, 0, 1)");
  assert.equal(matrixFor([[0, 0], [1280, 720], [1280, 0], [0, 720]], 1280, 720), null);
  const bent = /** @type {string} */ (matrixFor([[210, 120], [1650, 40], [1580, 990], [260, 880]], 1280, 720));
  const numbers = bent.slice("matrix3d(".length, -1).split(", ").map(Number);
  assert.equal(numbers.length, 16);
  assert.deepEqual([numbers[2], numbers[6], numbers[8], numbers[9], numbers[10], numbers[11], numbers[14], numbers[15]], [0, 0, 0, 0, 1, 0, 0, 1]);
  const h = /** @type {number[]} */ (homography(page, [[210, 120], [1650, 40], [1580, 990], [260, 880]]));
  near([numbers[0], numbers[1], numbers[3], numbers[4], numbers[5], numbers[7], numbers[12], numbers[13]], [h[0], h[3], h[6], h[1], h[4], h[7], h[2], h[5]], 1e-9);
  assert.ok(numbers[3] !== 0 && numbers[7] !== 0, "the perspective numbers sit at the bottom of the first two columns");
});

test("the plain fit fills the screen and keeps the page's shape", () => {
  assert.deepEqual(letterbox(1920, 1080, 1280, 720), [[0, 0], [1920, 0], [1920, 1080], [0, 1080]]);
  assert.deepEqual(letterbox(1000, 800, 1280, 720), [[0, 118.75], [1000, 118.75], [1000, 681.25], [0, 681.25]]);
  assert.deepEqual(letterbox(1280, 1024, 1280, 720), [[0, 152], [1280, 152], [1280, 872], [0, 872]]);
});

test("a saved fit is read back only for the same screen, and only if it's a proper shape", () => {
  /** @type {import("./wall-fit.js").Corners} */
  const wall = [[210.04, 120], [1650, 40], [1580, 990], [260, 880]];
  const saved = writeFit(wall, 1920, 1080);
  assert.deepEqual(JSON.parse(saved), { corners: [[210, 120], [1650, 40], [1580, 990], [260, 880]], screen: [1920, 1080] });
  assert.deepEqual(readFit(saved, 1920, 1080), [[210, 120], [1650, 40], [1580, 990], [260, 880]]);
  assert.equal(readFit(saved, 1280, 720), null);
  assert.equal(readFit(null, 1920, 1080), null);
  assert.equal(readFit("not json", 1920, 1080), null);
  assert.equal(readFit("null", 1920, 1080), null);
  assert.equal(readFit(JSON.stringify({ corners: [[0, 0], [1, 1]], screen: [1920, 1080] }), 1920, 1080), null);
  assert.equal(readFit(JSON.stringify({ corners: [[0, 0], [1920, 1080], [1920, 0], [0, 1080]], screen: [1920, 1080] }), 1920, 1080), null);
  assert.equal(readFit(JSON.stringify({ corners: [[0, 0], [1920, "0"], [1920, 1080], [0, 1080]], screen: [1920, 1080] }), 1920, 1080), null);
});

test("a corner moves on its own and stays on the screen", () => {
  assert.deepEqual(moveCorner(page, 2, [1300, 700], 1280, 720), [[0, 0], [1280, 0], [1280, 700], [0, 720]]);
  assert.deepEqual(moveCorner(page, 0, [-5, 30], 1280, 720), [[0, 30], [1280, 0], [1280, 720], [0, 720]]);
  assert.deepEqual(page[0], [0, 0], "the corners given are left as they were");
});
