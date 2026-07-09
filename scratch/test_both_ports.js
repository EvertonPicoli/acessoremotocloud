const net = require('net');
const { spawn } = require('child_process');
const path = require('path');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  console.log("Launching InputSimulator_v3.exe...");
  const exePath = path.join(__dirname, '..', 'InputSimulator_v3.exe');
  const proc = spawn(exePath, { stdio: 'inherit' });

  await sleep(1500);

  console.log("Connecting to port 9995 (Frames)...");
  const socketFrame = net.createConnection({ port: 9995, host: '127.0.0.1' }, async () => {
    console.log("Connected to Frames! Connecting to port 9996 (Inputs)...");
    
    const socketInput = net.createConnection({ port: 9996, host: '127.0.0.1' }, async () => {
      console.log("Connected to Inputs! Sending start_capture to port 9995...");
      socketFrame.write(JSON.stringify({ type: 'start_capture' }) + '\n');
    });

    socketInput.on('error', (err) => {
      console.error("Input socket error:", err.message);
    });
  });

  let frameCount = 0;
  let buffer = '';

  socketFrame.on('data', (data) => {
    buffer += data.toString();
    let lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.trim().startsWith('FRAME:')) {
        frameCount++;
        console.log(`Received frame #${frameCount}, base64 length: ${line.trim().length - 6}`);
        if (frameCount >= 3) {
          console.log("Test successful! Received 3 frames. Exiting...");
          socketFrame.end();
          proc.kill();
          process.exit(0);
        }
      } else {
        console.log(`Received non-frame message: ${line.trim()}`);
      }
    }
  });

  socketFrame.on('error', (err) => {
    console.error("Frame socket error:", err.message);
    proc.kill();
  });

  setTimeout(() => {
    console.log("Timeout! Did not receive frames.");
    socketFrame.end();
    proc.kill();
    process.exit(1);
  }, 10000);
}

main();
