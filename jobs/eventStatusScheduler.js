const Event = require('./../model/eventSchema');
const Time = require('../utils/time');

const updateEventStatusAndRecur = async () => {
    const today = Time.today(); // PST start of today
    const todayStr = today.toISODate(); // "yyyy-MM-dd" format

    try {
        // console.log(`\n[Scheduler] Running event status updater for ${todayStr}...`);

        // Step 1: Handle scheduled → confirmed
        const scheduledEvents = await Event.find({ status: 'scheduled' });
        let confirmedTodayCount = 0;

        for (const event of scheduledEvents) {
            const start = Time.fromJSDate(event.startDate).startOf('day');
            const end = Time.fromJSDate(event.endDate).startOf('day');

            if (today >= start && today <= end || today > end) {
                await Event.updateOne({ _id: event._id }, { $set: { status: 'confirmed' } });
                confirmedTodayCount++;
                // console.log(`  ⇧ Event confirmed: "${event.title}" (${start.toISODate()} - ${end.toISODate()})`);
            }
        }

        // Step 2: Handle confirmed → completed & recurrence
        const confirmedEvents = await Event.find({ status: 'confirmed' });
        let completedCount = 0;
        let recurredCount = 0;

        for (const event of confirmedEvents) {
            const eventEnd = Time.fromJSDate(event.endDate).startOf('day');

            if (eventEnd < today) {
                await Event.updateOne({ _id: event._id }, { $set: { status: 'completed' } });
                completedCount++;

                if (event.isRecurring) {
                    const start = Time.fromJSDate(event.startDate).plus({ years: 1 });
                    const end = Time.fromJSDate(event.endDate).plus({ years: 1 });

                    const newEvent = {
                        ...event.toObject(),
                        _id: undefined,
                        startDate: Time.toJSDate(start.toUTC()),  // ISO UTC for MongoDB
                        endDate: Time.toJSDate(end.toUTC()),
                        status: 'scheduled',
                        createdAt: undefined,
                        updatedAt: undefined,
                        __v: undefined,
                    };

                    await Event.create(newEvent);
                    recurredCount++;
                    // console.log(`  ↪ Recurring event created: "${event.title}" (${start.toISODate()} - ${end.toISODate()})`);
                } else {
                    // console.log(`  ✓ Event marked completed: "${event.title}"`);
                }
            }
        }

        // Summary
        // console.log(`\n[Scheduler Summary]`);
        // console.log(`  ✔ Completed events updated: ${completedCount}`);
        // console.log(`  ➕ Recurring events created: ${recurredCount}`);
        // console.log(`  ⏫ Scheduled events confirmed today: ${confirmedTodayCount}`);
        // console.log(`[Scheduler] Done.\n`);
    } catch (error) {
        console.error('[Scheduler Error]', error);
    }
};

module.exports = updateEventStatusAndRecur;
