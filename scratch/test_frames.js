const net = require('net');

console.log("Connecting to port 9995 (Frames)...");
const socket = net.createConnection({ port: 9997, host: '127.0.0.1' }, () => {
  console.log("Connected! Sending start_capture...");
  socket.write(JSON.stringify({ type: 'start_capture' }) + '\n');
});

socket.on('data', (data) => {
  const str = data.toString();
  console.log(`Received data length: ${str.length}`);
  console.log(`First 100 chars: ${str.substring(0, 100)}`);
  socket.end();
});

socket.on('error', (err) => {
  console.error("Socket error:", err.message);
});

setTimeout(() => {
  console.log("Timeout, closing.");
  socket.end();
}, 5000);
