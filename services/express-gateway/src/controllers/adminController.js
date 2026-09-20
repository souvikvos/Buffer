import prisma from '../lib/prisma.js';

export const createWorkflow = async (req, res) => {
  try {
    const { 
      name, 
      adminId, 
      openingTime, 
      closingTime, 
      isStandaloneQueue,
      safeTravelCutoffTime,
      cutoffMins, 
      latitude, 
      longitude, 
      stages 
    } = req.body;

    if (!adminId) {
      return res.status(400).json({ error: 'adminId is required to create a workflow.' });
    }

    const newWorkflow = await prisma.workflow.create({
      data: {
        name,
        adminId,
        openingTime: new Date(openingTime),
        closingTime: new Date(closingTime),
        isStandaloneQueue: isStandaloneQueue || false,
        safeTravelCutoffTime: new Date(safeTravelCutoffTime),
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
      include: {
        stages: {
          include: { counters: true }
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
