// A track's in-point, as the page writes it into what it copies (docs/adr/0004): the page keeps the
// in-point the mapper set on each card, and puts it in the copy text the process sent with its
// state. This is the page's own script, as plain JavaScript, so a test can run the very text the
// page runs.
//
//   one card:   `Space_1_FULL (needs Void (Campaign))`  becomes  `Space_1_FULL (from 0:38, needs Void (Campaign))`
//               `Space_1_FULL`                           becomes  `Space_1_FULL (from 0:38)`
//   the tray:   the id's own line gets `(from 0:38)`, the dependencies line stays

export const IN_POINT_SCRIPT = `
/** 1:05 for 65 seconds. */
function formatClock(seconds) {
  const whole = Math.round(seconds);
  return Math.floor(whole / 60) + ":" + String(whole % 60).padStart(2, "0");
}
/** Seconds for 0:38, 38 or 1:05.5; undefined for anything else. */
function parseClock(text) {
  const match = /^\\s*(?:(\\d+):)?(\\d+(?:\\.\\d+)?)\\s*$/.exec(text);
  if (!match) return undefined;
  const seconds = (match[1] ? Number(match[1]) * 60 : 0) + Number(match[2]);
  return Number.isFinite(seconds) ? seconds : undefined;
}
/** One card's copy text with its in-point in it. */
function itemWithInPoint(text, id, from) {
  if (from === undefined || from <= 0) return text;
  const at = formatClock(from);
  if (text === id) return id + " (from " + at + ")";
  if (text.startsWith(id + " (needs ")) return id + " (from " + at + ", needs " + text.slice(id.length + " (needs ".length);
  return text;
}
/** The tray's copy text with each ticked card's in-point on its id's line. */
function trayWithInPoints(text, inPoints) {
  return text.split("\\n").map((line) => (inPoints.has(line) && inPoints.get(line) > 0 ? line + " (from " + formatClock(inPoints.get(line)) + ")" : line)).join("\\n");
}
`;
