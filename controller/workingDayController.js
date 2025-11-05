const mongoose = require('mongoose');
const WorkingDayControl = require('../model/workingDayControlSchema');
const Time = require('../utils/time');
const Employee = require('../model/employeeSchema');

const createWorkingDayControl = async (req, res) => {
    try {
        const { monthKey, completedBy } = req.body;
        // Validate monthKey format (YYYY-MM)
        if (!/^\d{4}-\d{2}$/.test(monthKey)){
            return res.status(400).json({ success: false, message: 'Invalid month key format. Use YYYY-MM.' });
        }
        // Validate completedBy is a valid ObjectId
        if (!mongoose.Types.ObjectId.isValid(completedBy)){
            return res.status(400).json({ success: false, message: 'Invalid completedBy ID.' });
        }
        // Check if the user exists
        const user = await Employee.findById(completedBy);
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found.' });
        }
        // Check if a record for the month already exists
        const existingRecord = await WorkingDayControl.findOne({ monthKey });
        if (existingRecord) {
            return res.status(400).json({success: false, message: 'Working day control for this month already exists.' });
        }
        // Create a new working day control record
        const newControl = new WorkingDayControl({
            monthKey,
            isCompleted: true,
            completedBy,
            completedAt: Time.toJSDate(Time.now()),
        });
        const savedControl = await newControl.save();
        res.status(201).json({success: true, data: savedControl });
    }
    catch (error) {
        console.error('Error creating working day control:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
}

const getWorkingDayControl = async (req, res) => {
    try {
        const { monthKey } = req.query;
        if (!monthKey) {
            return res.status(400).json({ success: false, message: 'Month key is required.' });
        }
        // Validate monthKey format (YYYY-MM)
        if (!/^\d{4}-\d{2}$/.test(monthKey)){
            return res.status(400).json({ success: false, message: 'Invalid month key format. Use YYYY-MM.' });
        }
        const control = await WorkingDayControl.findOne({ monthKey });
        if(control){
            return res.status(200).json({
                success: true,
                exists: true,
                message: 'Working day control found for this month.',
            });
        } else {
            return res.status(200).json({
                success: true,
                exists: false,
                message: 'No working day control found for this month.'
            });
        }
    } catch (error) {
        console.error('Error fetching working day control:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};


const getAllWorkingDayControls = async (req, res) => {
    try {
        const controls = await WorkingDayControl.find().sort({ monthKey: -1 });
        res.status(200).json({ success: true, data: controls });
    } catch (error) {
        console.error('Error fetching all working day controls:', error);
        res.status(500).json({ success: false, message: 'Internal server error' });
    }
};

module.exports = {
    createWorkingDayControl,
    getWorkingDayControl,
    getAllWorkingDayControls,
}