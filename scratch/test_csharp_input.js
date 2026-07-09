const net = require('net');
const { spawn } = require('child_process');
const path = require('path');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log("Launching InputSimulator_v2.exe...");
  const exePath = path.join(__dirname, '..', 'InputSimulator_v2.exe');
  const proc = spawn(exePath, { stdio: 'inherit' });

  await sleep(1000);

  console.log("Connecting to TCP port 9990...");
  const socket = net.createConnection({ port: 9990, host: '127.0.0.1' }, async () => {
    console.log("Connected! Sending mousemove commands...");
    
    // Send mousemove to center (x = 32767, y = 32767 which corresponds to 0.5, 0.5)
    for (let i = 0; i < 5; i++) {
      const x = 20000 + i * 5000;
      const y = 32767;
      console.log(`Sending mousemove to (${x}, ${y})`);
      socket.write(JSON.stringify({ type: 'mousemove', x: x, y: y }) + '\n');
      await sleep(1000);
    }

    console.log("Disconnecting...");
    socket.end();
    proc.kill();
  });

  socket.on('error', (err) => {
    console.error("Socket error:", err.message);
    proc.kill();
  });
}

main();
