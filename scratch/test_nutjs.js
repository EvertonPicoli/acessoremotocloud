const { mouse, Point } = require("@nut-tree-fork/nut-js");

async function main() {
    console.log("Moving mouse using nut.js...");
    try {
        await mouse.setPosition(new Point(500, 500));
        console.log("Success!");
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
