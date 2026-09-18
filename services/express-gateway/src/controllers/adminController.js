import prisma from '../lib/prisma.js';

export const createWorkflow = async (req, res) => {
  try {
    const { 
      name, 
      adminId, 
      openingTime, 
      closingTime, 
      bufferMins, 
      cutoffMins, 
      latitude, 
      longitude, 
      stages 
    } = req.body;

    // Validate that we have an adminId
    if (!adminId) {
      return res.status(400).json({ error: 'adminId is required to create a workflow.' });
    }

    // Use Prisma's nested write to create the Workflow, Stages, and Counters all at once!
    const newWorkflow = await prisma.workflow.create({
      data: {
        name,
        adminId, // Connects this workflow to the specific Admin Account
        openingTime: new Date(openingTime),
        closingTime: new Date(closingTime),
        bufferMins,
        cutoffMins,
        latitude,
        longitude,
        stages: {
          create: stages.map((stage) => ({
            name: stage.name,
            orderIndex: stage.orderIndex,
            requiredDocs: stage.requiredDocs || [],
            counters: {
              create: stage.counters.map((counter) => ({
                name: counter.name
              }))
            }
          }))
        }
      },
      // Return the created workflow with its nested stages and counters for the response
      include: {
        stages: {
          include: {
            counters: true
          }
        }
      }
    });

    res.status(201).json({
      message: 'Workflow successfully created! 🎉',
      workflow: newWorkflow
    });

  } catch (error) {
    console.error('Error creating workflow:', error);
    res.status(500).json({ error: 'Failed to create workflow. Please check your data.' });
  }
};
