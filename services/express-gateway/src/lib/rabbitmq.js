import amqp from 'amqplib';
import { notifyStaff, notifyAdmin } from './websocket.js';

let channel = null;

// Connect to RabbitMQ using the URL from .env
export const connectRabbitMQ = async () => {
  try {
    const connection = await amqp.connect(process.env.RABBITMQ_URL);
    channel = await connection.createChannel();
    
    // Ensure the queue exists before we try to send messages to it
    await channel.assertQueue('buffer_registration_queue', { durable: true });
    
    console.log('✅ Connected to RabbitMQ Queue: buffer_registration_queue');
  } catch (error) {
    console.error('❌ RabbitMQ Connection Failed:', error);
  }
};

// Helper function to send messages to Go
export const publishToQueue = (queueName, data) => {
  if (!channel) {
    console.error('Cannot publish: RabbitMQ channel not initialized');
    return false;
  }
  
  // Convert our JSON object into a Buffer (Raw bytes) so RabbitMQ can send it over the wire
  channel.sendToQueue(queueName, Buffer.from(JSON.stringify(data)), {
    persistent: true // Ensure messages aren't lost if RabbitMQ crashes
  });
  
  return true;
};

// Setup Consumer to listen for alerts from Go Engine
export const setupConsumer = async () => {
  if (!channel) return;

  const queueName = 'buffer_notifications_queue';
  await channel.assertQueue(queueName, { durable: true });

  console.log(`✅ RabbitMQ Consumer listening on: ${queueName}`);

  channel.consume(queueName, (msg) => {
    if (msg !== null) {
      try {
        const payload = JSON.parse(msg.content.toString());
        
        switch(payload.type) {
          case 'QUEUE_DELAY_ALERT':
            // Assume admin connection ID is 'admin_global' for now
            notifyAdmin('admin_global', 'WARNING', `The entire queue for Stage ${payload.stageId} is running behind schedule!`);
            break;
            
          case 'STUDENT_STUCK_ALERT':
            const stuckMsg = `Counter ${payload.counterId} has been stuck on the same student for too long!`;
            notifyAdmin('admin_global', 'CRITICAL', stuckMsg);
            if (payload.counterId) notifyStaff(payload.counterId, 'CRITICAL', stuckMsg);
            break;
            
          case 'COUNTER_IDLE_ALERT':
            const idleMsg = `Counter ${payload.counterId} is sitting empty while students are waiting!`;
            notifyAdmin('admin_global', 'ALERT', idleMsg);
            if (payload.counterId) notifyStaff(payload.counterId, 'ALERT', idleMsg);
            break;
        }

        channel.ack(msg);
      } catch (error) {
        console.error('Error processing RabbitMQ message:', error);
        channel.nack(msg); // Reject message on failure
      }
    }
  });
};
