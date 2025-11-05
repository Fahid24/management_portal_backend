const express = require("express");
const router = express.Router();

const {
  createRequisition,
  getAllRequisitions,
  getRequisitionById,
  updateRequisition,
  deleteRequisition,
  requisitionAction,
  getByRequisitionID,
} = require("../controller/requisitionController");

router.post("/", createRequisition);
router.get("/", getAllRequisitions);
router.get("/requisitionId/:requisitionId", getByRequisitionID);
router.get("/:id", getRequisitionById);
router.put("/:id", updateRequisition);
router.delete("/:id", deleteRequisition);
router.patch("/action/:id", requisitionAction);

module.exports = router;
