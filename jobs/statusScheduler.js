const mongoose = require("mongoose");
const Employee = require("../model/employeeSchema");
const Leave = require("../model/leaveSchema");
const Time = require("../utils/time");

const updateEmployeeStatusByLeave = async () => {
    const today = Time.today(); // Start of today in PST
    const todayJS = Time.toJSDate(today); // Native JS Date for Mongo queries

    // console.log("🔄 Running daily leave sync on:", today.toFormat('yyyy-MM-dd'));

    try {
        /** STEP 1: Mark Active employees as OnLeave if they have an ongoing approved leave */
        const activeEmployeesToUpdate = await Leave.aggregate([
            {
                $match: {
                    status: "approved",
                    startDate: { $lte: todayJS },
                    endDate: { $gte: todayJS },
                },
            },
            {
                $group: {
                    _id: "$employeeId",
                },
            },
        ]);

        const activeIds = activeEmployeesToUpdate.map(e => e._id.toString());

        if (activeIds.length > 0) {
            const result = await Employee.updateMany(
                { _id: { $in: activeIds }, status: "Active" },
                { $set: { status: "OnLeave" } }
            );
            // console.log(`✅ Marked ${result.modifiedCount} employees as OnLeave`);
        } else {
            // console.log("ℹ️ No active employees need to be marked as OnLeave today.");
        }

        /** STEP 2: Revert OnLeave employees to Active if no approved ongoing leave remains */
        const onLeaveEmployees = await Employee.find({ status: "OnLeave" }).select("_id");
        const toReactivate = [];

        for (const emp of onLeaveEmployees) {
            const hasCurrentLeave = await Leave.exists({
                employeeId: emp._id,
                status: "approved",
                startDate: { $lte: todayJS },
                endDate: { $gte: todayJS },
            });

            if (!hasCurrentLeave) {
                toReactivate.push(emp._id);
            }
        }

        if (toReactivate.length > 0) {
            const result2 = await Employee.updateMany(
                { _id: { $in: toReactivate } },
                { $set: { status: "Active" } }
            );
            // console.log(`✅ Reverted ${result2.modifiedCount} employees back to Active`);
        } else {
            // console.log("ℹ️ No OnLeave employees are eligible to revert today.");
        }

        // console.log("🎯 Employee leave status sync complete.");
    } catch (error) {
        console.error("❌ Error while syncing leave status:", error);
    }
};

module.exports = updateEmployeeStatusByLeave;
