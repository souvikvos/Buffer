package scheduler

import (
	"time"

	"go-scheduler/internal/models"
)


// ReturnHomeTime computes when a user would get home after their
// appointment: appointment_end + travel_time_back.
func ReturnHomeTime(slot *models.Slot, travelTimeMinutes int) time.Time {
	return slot.EndTime.Add(time.Duration(travelTimeMinutes) * time.Minute)
}

// IsFeasible reports whether a user assigned to slot can still make it
// home by their deadline.
func IsFeasible(slot *models.Slot, evt models.UserRegistrationEvent) bool {
	if slot == nil {
		return false
	}
	returnTime := ReturnHomeTime(slot, evt.TravelTimeMinutes)
	return !returnTime.After(evt.DeadlineTime)
}

// CheckFeasibility re-validates a ScheduledUser's assigned slot against
// their travel deadline. It does not mutate su; the caller decides what to
// do with an infeasible result (typically: attempt a swap, see swap.go).
func CheckFeasibility(su models.ScheduledUser, evt models.UserRegistrationEvent) bool {
	if su.AssignedSlot == nil {
		return false
	}
	return IsFeasible(su.AssignedSlot, evt)
}
