import { WebSocketServer } from 'ws';
import prisma from './prisma.js';

// Map to store active connections by ticketId OR counterId
// Key: connection ID (String), Value: WebSocket Connection
const clients = new Map();

export const setupWebSocket = (server) => {
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    // Expected URL formats: 
    // ws://localhost:5000?ticketId=123 (Student)
    // ws://localhost:5000?counterId=456 (Staff)
    const url = new URL(req.url, `http://${req.headers.host}`);
    const ticketId = url.searchParams.get('ticketId');
    const counterId = url.searchParams.get('counterId');
    
    // The ID we will use to store the connection in the map
    const connectionId = ticketId || counterId;

    if (!connectionId) {
      ws.close(1008, 'A ticketId or counterId is required to connect.');
      return;
    }

    // Register the client
    clients.set(connectionId, ws);
    console.log(`WebSocket: Client connected with ID: ${connectionId} (Type: ${ticketId ? 'Student' : 'Staff'})`);

    ws.on('close', () => {
      clients.delete(connectionId);
      console.log(`WebSocket: Client disconnected: ${connectionId}`);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket Error for ${connectionId}:`, error);
      clients.delete(connectionId);
    });
  });
};

/**
 * Sends a WebSocket message directly to a specific user.
 * Express uses this to notify the frontend when Go updates Postgres.
 */
export const notifyUser = async (ticketId, eventType, message) => {
  const ws = clients.get(ticketId);
  
  if (ws && ws.readyState === 1) { // 1 = OPEN
    try {
      // Since Go already updated Postgres, Express queries the latest ETA/Status to send to the UI
      const updatedTicket = await prisma.ticket.findUnique({
        where: { id: ticketId }
      });

      if (updatedTicket) {
        ws.send(JSON.stringify({
          type: eventType,
          message,
          data: updatedTicket,
          timestamp: new Date().toISOString()
        }));
      }
    } catch (error) {
      console.error(`Error fetching ticket for WS broadcast (${ticketId}):`, error);
    }
  }
};

/**
 * Sends a WebSocket message directly to a specific Staff member's dashboard.
 * Express uses this to notify Staff when Go detects their queue is delayed.
 */
export const notifyStaff = async (counterId, eventType, message, payload = null) => {
  const ws = clients.get(counterId);
  
  if (ws && ws.readyState === 1) { // 1 = OPEN
    ws.send(JSON.stringify({
      type: eventType,
      message,
      data: payload,
      timestamp: new Date().toISOString()
    }));
    console.log(`WebSocket: Pushed Staff Alert to Counter ${counterId}`);
  }
};
