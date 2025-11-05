
const ServiceOption = require('../model/serviceOptionsSchema.js')

const addServiceOption = async (req, res) => {
  try {

    const serviceOption = req.body;

    const result = await ServiceOption.create(serviceOption)

    res
      .status(200)
      .json({ success: true, message: "service added Successfully", data: result });
  } catch (err) {
    console.error("Create ServiceOption err:", err);
    res.status(500).json({ error: err });
  }
};
const getServiceOption = async (req, res) => {
  try {

    const result = await ServiceOption.find();

    res
      .status(200)
      .json({ success: true, message: "service fetched Successfully", data: result });
  } catch (err) {
    console.error("Create ServiceOption err:", err);
    res.status(500).json({ error: err });
  }
};
const deleteServiceOption = async (req, res) => {
  try {

    await ServiceOption.findByIdAndDelete(req.params.id);

    res
      .status(200)
      .json({ success: true, message: "service deleted Successfully", data: {} });
  } catch (err) {
    console.error("Create ServiceOption err:", err);
    res.status(500).json({ error: err });
  }
};



module.exports = {
  addServiceOption,
  getServiceOption,
  deleteServiceOption
};
