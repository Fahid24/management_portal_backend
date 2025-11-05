const express = require("express");
const { 

     createClient,
  findClients,
  createClientIncome,
  getClientIncomes,
  findClientDetails,
  deleteClient,
  updateClient,
  deleteIncome,
  getIncomeDetails,
  updateIncomeDetails
 } = require("../controller/clientRevenueController");
const router = express.Router();


// Client create
router.post("/", createClient);

// Create income
router.post("/income", createClientIncome);
// GET incomes
router.get("/income", getClientIncomes);


// Client find
router.get("/",findClients);
// Client details find
router.get("/:clientId", findClientDetails);
router.get("/income/:incomeId", getIncomeDetails);

// Client delete
router.delete("/:clientId", deleteClient);
// income delete 

router.delete("/income/:incomeId", deleteIncome);

//Client update
router.patch("/:clientId",updateClient);

// income update
router.patch("/income/update/:incomeId", updateIncomeDetails);




module.exports = router;
