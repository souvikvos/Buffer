import amqp from 'amqplib';

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
