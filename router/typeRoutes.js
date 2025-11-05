const express = require("express")
const router = express.Router();

const {
    createType,
    getAllTypes,
    getTypeById,
    updateType,
    deleteType
} = require('../controller/typeController');

router.post('/', createType);
router.get('/', getAllTypes);
router.get('/:id', getTypeById);
router.put('/:id', updateType);
router.delete('/:id', deleteType);

module.exports = router;
