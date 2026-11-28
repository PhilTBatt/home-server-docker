// @ts-check
import assert from "node:assert/strict";
import { test } from "node:test";
import { isServerMap, mapView, stateWord } from "./wall-map.js";

/** @returns {import("./wall-map.js").ServerMap} */
function map() {
  return {
    kind: "server",
    host: "home-server",
    nodes: [
      { id: "caddy", group: "front", x: 512, y: 376, size: 11, fx: "gate", side: "left", note: "", state: "ok" },
      { id: "api", group: "front", x: 640, y: 264, size: 16, fx: "spokes", side: "right", note: "", state: "ok" },
      { id: "rail data", group: "outside", x: 448, y: 96, size: 13, fx: "external", side: "above", note: "", state: "warn" },
      { id: "kuma", group: "watching", x: 672, y: 592, size: 11, fx: "heart", side: "below", note: "", state: "unchecked" },
      { id: "tailscale", group: "network", x: 352, y: 616, size: 8, fx: "sparkle", side: "right", note: "on the host", state: "unchecked" },
    ],
    links: [
      { from: "caddy", to: "api", packets: true, outside: false },
      { from: "api", to: "rail data", packets: false, outside: true },
      { from: "api", to: "nowhere", packets: false, outside: false },
    ],
    chips: [{ text: "Everything's OK: 9 checks fine.", tone: "good" }],
    watched: 3,
  };
}

test("the server map is checked before it's drawn, and anything odd in it means the plain card instead", () => {
  assert.ok(isServerMap(map()));
  const odd = [
    null,
    { ...map(), kind: "trains" },
    { ...map(), nodes: "x" },
    { ...map(), nodes: [{ ...map().nodes[0], x: 2000 }] },
    { ...map(), nodes: [{ ...map().nodes[0], y: -1 }] },
    { ...map(), nodes: [{ ...map().nodes[0], group: "garden" }] },
    { ...map(), nodes: [{ ...map().nodes[0], state: "great" }] },
    { ...map(), nodes: [{ ...map().nodes[0], side: "middle" }] },
    { ...map(), nodes: [{ ...map().nodes[0], id: "" }] },
    { ...map(), nodes: [{ ...map().nodes[0], id: "x".repeat(41) }] },
    { ...map(), links: [{ from: "a", to: "b", packets: "yes", outside: false }] },
    { ...map(), chips: [{ text: "hi", tone: "loud" }] },
    { ...map(), chips: Array.from({ length: 7 }, () => ({ text: "hi", tone: "good" })) },
    { ...map(), watched: -1 },
  ];
  for (const bad of odd) assert.equal(isServerMap(bad), false, JSON.stringify(bad).slice(0, 80));
});

test("each node is placed by its centre, its label to the side asked, and an unknown effect drawn plain", () => {
  const view = mapView(map());
  assert.deepEqual(view.nodes[0], { id: "caddy", left: 506.5, top: 370.5, size: 11, fx: "gate", group: "front", state: "ok", lx: -134, ly: -1.5, align: "right", note: "", delayMs: 0 });
  assert.deepEqual([view.nodes[1].lx, view.nodes[1].align], [24, "left"]);
  assert.deepEqual([view.nodes[2].lx, view.nodes[2].ly, view.nodes[2].align], [-57.5, -19, "center"]);
  assert.deepEqual([view.nodes[3].ly, view.nodes[3].align], [17, "center"]);
  assert.equal(view.nodes[4].fx, "plain");
  assert.deepEqual(view.nodes.map((node) => node.delayMs), [0, 25, 50, 75, 100], "they come in one after another");
});

test("each link runs from one node to the other, dashed to the internet, with a packet where the map says, and a link to a missing node is left out", () => {
  const view = mapView(map());
  assert.equal(view.links.length, 2);
  assert.deepEqual(view.links[0], { x: 512, y: 376, len: 170, deg: -41.2, dashed: false, packet: true, seconds: 2, offset: -0 });
  assert.deepEqual([view.links[1].dashed, view.links[1].packet, view.links[1].seconds, view.links[1].offset], [true, false, 2.5, -0.6]);
});

test("the map says how many it watches, and names a node's state only when it needs one", () => {
  assert.equal(mapView(map()).watched, "3 watched by the hub; the rest aren't checked");
  assert.equal(mapView({ ...map(), watched: 1 }).watched, "1 watched by the hub; the rest aren't checked");
  assert.deepEqual(["ok", "warn", "problem", "off", "unchecked"].map(stateWord), ["", "needs a look", "problem", "off", ""]);
});
