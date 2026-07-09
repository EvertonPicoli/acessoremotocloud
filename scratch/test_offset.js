const { mouse, Point } = require("@nut-tree-fork/nut-js");

async function main() {
  const px = 1459 - (-2560);
  const py = 480 - (-1080);
  console.log(`Moving to virtual (${px}, ${py}) which should be (1459, 480) on physical DISPLAY2...`);
  try {
    await mouse.setPosition(new Point(px, py));
    console.log("Move successful!");
  } catch (e) {
    console.error("Error:", e);
  }
}

main();
