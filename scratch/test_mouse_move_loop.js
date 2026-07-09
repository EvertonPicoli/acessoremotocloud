const { mouse, Point } = require("@nut-tree-fork/nut-js");

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    console.log("Starting mouse move loop... Watch your screen!");
    try {
        for (let i = 0; i < 10; i++) {
            const x = 500 + (i % 2) * 500;
            const y = 500 + (i % 2) * 500;
            console.log(`Moving to (${x}, ${y})`);
            await mouse.setPosition(new Point(x, y));
            await sleep(500);
        }
        console.log("Finished loop successfully!");
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
