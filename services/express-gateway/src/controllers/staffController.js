import prisma from '../lib/prisma.js';
import { getChannel } from '../lib/rabbitmq.js';

export const callNextStudent = async (req, res) => {
  try {
    const { counterId } = req.params;

    // The staff calls the next person from their specific counter
    // Find the oldest WAITING ticket for this counter
    const nextTicket = await prisma.ticket.findFirst({
      where: {
        assignedCounterId: counterId,
        status: 'WAITING'
      },
      orderBy: {
        eta: 'asc' // Pull the one with the earliest ETA
      }
    });

    if (!nextTicket) {
      return res.status(404).json({ message: 'No students waiting at this counter.' });
    }

    // Update status to PROCESSING
    const updatedTicket = await prisma.ticket.update({
      where: { id: nextTicket.id },
      data: { status: 'PROCESSING' }
    });

    // Notify Go Engine that TAT timer has started
    const channel = getChannel();
    if (channel) {
      channel.sendToQueue('buffer_staff_queue', Buffer.from(JSON.stringify({
        type: 'CALL_NEXT',
        ticketId: nextTicket.id,
        counterId,
        timestamp: new Date().toISOString()
      })));
    }

    res.status(200).json({ message: 'Student called.', ticket: updatedTicket });
  } catch (error) {
    console.error('Error calling next student:', error);
    res.status(500).json({ error: 'Failed to call next student.' });
  }
};

export const completeStudent = async (req, res) => {
  try {
    const { counterId } = req.params;
    const { ticketId } = req.body;

    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: 'COMPLETED' }
    });

    // Notify Go Engine to calculate TAT and recalculate ETAs
    const channel = getChannel();
    if (channel) {
      channel.sendToQueue('buffer_staff_queue', Buffer.from(JSON.stringify({
        type: 'COMPLETE_STUDENT',
        ticketId,
        counterId,
        timestamp: new Date().toISOString()
      })));
    }

    res.status(200).json({ message: 'Student completed. TAT updated.', ticket: updatedTicket });
  } catch (error) {
    console.error('Error completing student:', error);
    res.status(500).json({ error: 'Failed to complete student.' });
  }
};

export const skipStudent = async (req, res) => {
  try {
    const { ticketId } = req.params;

    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: 'SKIPPED' }
    });

    // Notify Go Engine to drop from active queue and recalculate ETAs
    const channel = getChannel();
    if (channel) {
      channel.sendToQueue('buffer_staff_queue', Buffer.from(JSON.stringify({
        type: 'SKIP_STUDENT',
        ticketId,
        timestamp: new Date().toISOString()
      })));
    }

    res.status(200).json({ message: 'Student skipped.', ticket: updatedTicket });
  } catch (error) {
    console.error('Error skipping student:', error);
    res.status(500).json({ error: 'Failed to skip student.' });
  }
};

export const restoreStudent = async (req, res) => {
  try {
    const { ticketId } = req.params;

    const updatedTicket = await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: 'WAITING' }
    });

    // Notify Go Engine to inject back into active queue
    const channel = getChannel();
    if (channel) {
      channel.sendToQueue('buffer_staff_queue', Buffer.from(JSON.stringify({
        type: 'RESTORE_STUDENT',
        ticketId,
        timestamp: new Date().toISOString()
      })));
    }

    res.status(200).json({ message: 'Student restored to queue.', ticket: updatedTicket });
  } catch (error) {
    console.error('Error restoring student:', error);
    res.status(500).json({ error: 'Failed to restore student.' });
  }
};

export const updateCounterStatus = async (req, res) => {
  try {
    const { counterId } = req.params;
    const { status } = req.body; // OPEN, PAUSED, FAULT

    const updatedCounter = await prisma.counter.update({
      where: { id: counterId },
      data: { status }
    });

    // Notify Go Engine so it can route users away from PAUSED/FAULT counters
    const channel = getChannel();
    if (channel) {
      channel.sendToQueue('buffer_staff_queue', Buffer.from(JSON.stringify({
        type: 'UPDATE_COUNTER_STATUS',
        counterId,
        status,
        timestamp: new Date().toISOString()
      })));
    }

    res.status(200).json({ message: `Counter status updated to ${status}.`, counter: updatedCounter });
  } catch (error) {
    console.error('Error updating counter status:', error);
    res.status(500).json({ error: 'Failed to update counter status.' });
  }
};

export const reallocateUser = async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { targetCounterId } = req.body;

    // 1. Fetch ticket and target counter to verify stage matches
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { currentStage: true }
    });
    
    if (!ticket || !ticket.currentStageId) {
      return res.status(404).json({ error: 'Ticket or current stage not found.' });
    }

    const targetCounter = await prisma.counter.findUnique({
      where: { id: targetCounterId }
    });

    if (!targetCounter) {
      return res.status(404).json({ error: 'Target counter not found.' });
    }

    if (ticket.currentStageId !== targetCounter.stageId) {
      return res.status(400).json({ error: 'Cannot reallocate to a counter in a different stage.' });
    }

    // 2. Update the DB
    await prisma.ticket.update({
      where: { id: ticketId },
      data: { assignedCounterId: targetCounterId }
    });

    // 3. Push to RabbitMQ for Ayana's Go Engine (recalculate ETAs at back of queue)
    const channel = getChannel();
    if (channel) {
      channel.sendToQueue('buffer_staff_queue', Buffer.from(JSON.stringify({
        type: 'REALLOCATE_STUDENT',
        ticketId,
        targetCounterId,
        timestamp: new Date().toISOString()
      })));
    }

    res.status(200).json({ message: 'User reallocated successfully. Go Engine will recalculate ETAs.' });
  } catch (error) {
    console.error('Error reallocating user:', error);
    res.status(500).json({ error: 'Failed to reallocate user.' });
  }
};
