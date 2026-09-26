import dotenv from 'dotenv';
import http from 'http';
import app from './app.js';
import { setupWebSocket } from './lib/websocket.js';
import { connectRabbitMQ, setupConsumer } from './lib/rabbitmq.js';

// Load environment variables from .env file
dotenv.config();

const PORT = process.env.PORT || 5000;

// Create HTTP Server
const server = http.createServer(app);

// Attach WebSocket Server to the HTTP Server
setupWebSocket(server);

// Start listening for incoming network requests
server.listen(PORT, async () => {
  // Connect to RabbitMQ and start Consumer
  await connectRabbitMQ();
  await setupConsumer();
  console.log(`
  ======================================================
  🚀 Buffer Express API Gateway Started!
  📡 Server listening on: http://localhost:${PORT}
  🏥 Health check: http://localhost:${PORT}/health
  ======================================================
  `);
});
