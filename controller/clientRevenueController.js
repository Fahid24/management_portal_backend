const ClientInfo = require("../model/clientFormModel.js");
const ClientIncome = require("../model/ClientIncome.js");
const Employee = require("../model/employeeSchema.js");

const createClient = async (req, res) => {
  try {
    const clientData = req.body;
    // console.log(clientData)

    await ClientInfo.create(clientData);

    res
      .status(200)
      .json({ success: true, message: "Client Created Successfully" });
  } catch (err) {
    console.error("Create client error:", err);
    res.status(500).json({ error: err });
  }
};

const findClients = async (req, res) => {
  try {
    const { searchTerm, page, limit, selectOptions, userId, userRole } = req.query;

    // console.log(userRole)
  

    // Parse selectOptions safely
    let valueToMatch = [];

    if (selectOptions) {
      try {
        let parsedOptions;

        if (typeof selectOptions === "string") {
          // If it's already JSON (starts with [ or {)
          if (
            selectOptions.trim().startsWith("[") ||
            selectOptions.trim().startsWith("{")
          ) {
            parsedOptions = JSON.parse(selectOptions);
          } else {
            // If it's just a plain string like "web"
            parsedOptions = [{ label: selectOptions, value: selectOptions }];
          }
        } else {
          parsedOptions = selectOptions;
        }

        valueToMatch = parsedOptions.map((o) => o.value);
      } catch (err) {
        console.error("Invalid selectOptions JSON:", err.message);
        valueToMatch = [];
      }
    }

    // Build query
    let query = searchTerm
      ? { name: { $regex: searchTerm, $options: "i" } }
      : {};

    if (valueToMatch.length > 0) {
      // query["services.value"] = { $all: valueToMatch };
      query = { ...query, "services.value": { $all: valueToMatch } };
    }
    if(userRole &&  userRole != 'Admin') {
      query = {...query, userId}
      
      
    }
   

    let result;
    let pagination = null;

    // Pagination
    if (page && limit) {
      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      const totalDocs = await ClientInfo.countDocuments(query);

      result = await ClientInfo.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .populate("employees");

      pagination = {
        totalDocs,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalDocs / limitNum),
      };
    } else {
      result = await ClientInfo.find(query)
        .sort({ createdAt: -1 })
        .populate("employees");
    }

    res.status(200).json({
      success: true,
      message: "Clients Retrieved Successfully",
      data: result,
      pagination,
    });
  } catch (err) {
    console.error("Find clients error:", err);
    res.status(500).json({ error: err.message || err });
  }
};

const findClientDetails = async (req, res) => {
  try {
    const { clientId } = req.params;

    const result = await ClientInfo.findById(clientId).populate("employees").populate("project", {name:1});

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Client Not Found",
      });
    }

    // console.log(result)

    res.status(200).json({
      success: true,
      message: "Client Retrieved Successfully",
      data: result,
    });
  } catch (err) {
    console.error("Find clients error:", err);
    res.status(500).json({ error: err });
  }
};
const deleteClient = async (req, res) => {
  try {
    const { clientId } = req.params;

    const result = await ClientInfo.findById(clientId);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Client Not Found",
      });
    }
    await ClientInfo.findByIdAndDelete(clientId);

    res.status(200).json({
      success: true,
      message: "Client Deleted Successfully",
      data: {},
    });
  } catch (err) {
    console.error("Delete clients error:", err);
    res.status(500).json({ error: err });
  }
};
const updateClient = async (req, res) => {
  try {
    const { clientId } = req.params;
    // console.log(clientId)

    const result = await ClientInfo.findById(clientId);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Client Not Found",
      });
    }
    // console.log(result)
    const updatedData = req.body;

    const updatedres = await ClientInfo.findByIdAndUpdate(
      clientId,
      updatedData
    );
    // console.log("Updated Data:", updatedres)

    res.status(200).json({
      success: true,
      message: "Client Updated Successfully",
      data: updatedres,
    });
  } catch (err) {
    console.error("Update clients error:", err);
    res.status(500).json({ error: err });
  }
};

const createClientIncome = async (req, res) => {
  try {
    const incomeData = req.body;

    const result = await ClientIncome.create(incomeData);

    // console.log("create = ", result)

    res.status(201).json({
      success: true,
      message: "Income Created Successfully",
      data: result,
    });
  } catch (err) {
    console.error("Create client income error:", err);
    res.status(500).json({ error: err });
  }
};




const getClientIncomes = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      searchTerm = "",
      selectedDate = "",
    } = req.query;

    const skip = (page - 1) * limit;

    // Build $match object
    const matchStage = {};

    // Filter by date if provided
    if (selectedDate) {
      const date = new Date(selectedDate);
      const start = new Date(date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(date);
      end.setHours(23, 59, 59, 999);

      matchStage.date = { $gte: start, $lte: end };
    }

    // Aggregation pipeline
    const lookupStage = {
      $lookup: {
        from: "clientinfos",
        localField: "clientId",
        foreignField: "_id",
        as: "client",
      },
    };

    const unwindStage = {
      $unwind: {
        path: "$client",
        preserveNullAndEmptyArrays: true,
      },
    };

    // Only add name search if searchTerm exists
    if (searchTerm) {
      const regex = new RegExp(searchTerm, "i");
      matchStage["client.name"] = { $regex: regex };
    }

    const aggregationPipeline = [
      lookupStage,
      unwindStage,
      { $match: matchStage },
      { $sort: { date: -1 } },
      { $skip: skip },
      { $limit: Number(limit) },
      {
        $project: {
          clientId: "$client",
          amount: 1,
          receivedAmount: 1,
          date: 1,
          description: 1,
          refInvoiceNo: 1,
          services: 1,
          proof: 1,
        },
      },
    ];

    const incomes = await ClientIncome.aggregate(aggregationPipeline);

    // Count total documents
    const totalDocsAgg = await ClientIncome.aggregate([
      lookupStage,
      unwindStage,
      { $match: matchStage },
      { $count: "totalDocs" },
    ]);

    const totalDocs = totalDocsAgg[0]?.totalDocs || 0;

    res.status(200).json({
      success: true,
      message: "Incomes Retrieved Successfully",
      data: incomes,
      pagination: {
        totalDocs,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(totalDocs / limit),
      },
    });
  } catch (err) {
    console.error("Get client incomes error:", err);
    res.status(500).json({ error: err.message });
  }
};


const deleteIncome = async (req, res) => {
  try {
    const { incomeId } = req.params;

    const result = await ClientIncome.findById(incomeId);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Client Income Not Found",
      });
    }
    await ClientIncome.findByIdAndDelete(incomeId);

    res.status(200).json({
      success: true,
      message: "Client Income Deleted Successfully",
      data: {},
    });
  } catch (err) {
    console.error("Delete Income error:", err);
    res.status(500).json({ error: err });
  }
};

const getIncomeDetails = async (req, res) => {
  try {
    const { incomeId } = req.params;
    // console.log(incomeId)

    const result = await ClientIncome.findById(incomeId).populate("clientId");

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Client Income Not Found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Client Income Retrived Successfully",
      data: result,
    });
  } catch (err) {
    console.error("Find Income error:", err);
    res.status(500).json({ error: err });
  }
};

const updateIncomeDetails = async (req, res) => {
  try {
    const { incomeId } = req.params;
    // console.log(incomeId)
    const newData = req.body;

    const result = await ClientIncome.findById(incomeId);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Client Income Not Found",
      });
    }

    await ClientIncome.findByIdAndUpdate(incomeId, newData);

    res.status(200).json({
      success: true,
      message: "Client Income Updated Successfully",
      data: result,
    });
  } catch (err) {
    console.error("Find Income error:", err);
    res.status(500).json({ error: err });
  }
};

module.exports = {
  createClient,
  findClients,
  createClientIncome,
  getClientIncomes,
  findClientDetails,
  deleteClient,
  updateClient,
  deleteIncome,
  getIncomeDetails,
  updateIncomeDetails,
};
