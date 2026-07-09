const { screen } = require("@nut-tree-fork/nut-js");

async function main() {
    try {
        const width = await screen.width();
        const height = await screen.height();
        console.log(`Screen resolution: ${width}x${height}`);
    } catch (e) {
        console.error("Error:", e);
    }
}

main();
