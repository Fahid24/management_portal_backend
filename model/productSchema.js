const mongoose = require('mongoose');

/**
 * Atomic counter per 3-letter type code (e.g., "LAP", "SPC")
 * Ensures unique, monotonic serials even under concurrent inserts.
 */
const ProductCounterSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // the 3-letter type code
    seq: { type: Number, default: 0 },
  },
  { versionKey: false }
);

const ProductCounter =
  mongoose.models.ProductCounter ||
  mongoose.model('ProductCounter', ProductCounterSchema);

/**
 * Product schema
 */
const ProductSchema = new mongoose.Schema(
  {
    productId: { type: String, unique: true }, // auto-generated: <TYPE_CODE><SERIAL>
    name: { type: String, required: true },
    description: { type: String, required: true },
    type: { type: mongoose.Schema.Types.ObjectId, ref: 'Type', required: true },
    currentOwner: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
    status: {
      type: String,
      enum: ['AVAILABLE', 'ASSIGNED', 'UNUSABLE', 'MAINTENANCE'],
      default: 'AVAILABLE',
    },
    origin: { type: String },
    requisitionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Requisition', default: null },
    price: { type: Number, required: true },
    history: [
      {
        employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
        handoverDate: { type: Date },
        returnDate: { type: Date },
        handOverBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
        returnBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
      },
    ],
    documents: [{ type: String }],
  },
  { timestamps: true }
);

// Extra safety: make sure the unique index is created
ProductSchema.index({ productId: 1 }, { unique: true });

/**
 * Build a 3-letter code from Type.name using your rules, keeping ONLY letters:
 * - 3+ words  -> first letter of first three words (e.g., "Smart Phone Case" -> SPC)
 * - 2 words   -> 2 letters from word1 + 1 letter from word2 (fallback to 1+2 if word1 has only 1 char)
 * - 1 word    -> first 3 letters of the word
 * Always pad to 3 chars if result is shorter (e.g., "PC" -> "PCC", "A" -> "AAA").
 * If name is empty/unusable -> "UNK".
 */
function getTypeCode(typeName = '') {
  // Keep only A–Z letters and spaces; remove digits & symbols.
  const cleaned = String(typeName)
    .normalize('NFKD')
    .replace(/[^a-zA-Z\s]/g, ' ') // <-- letters only
    .replace(/\s+/g, ' ')
    .trim();

  const words = cleaned ? cleaned.split(' ').filter(Boolean) : [];
  let code = '';

  if (words.length >= 3) {
    code = (words[0][0] || '') + (words[1][0] || '') + (words[2][0] || '');
  } else if (words.length === 2) {
    const [w1, w2] = words;
    code =
      (w1.length >= 2
        ? (w1.slice(0, 2) + w2.slice(0, 1))   // 2 + 1
        : (w1.slice(0, 1) + w2.slice(0, 2))); // fallback 1 + 2
  } else if (words.length === 1) {
    code = words[0].slice(0, 3);
  } else {
    code = 'UNK';
  }

  code = code.toUpperCase();

  // Ensure exactly 3 chars by padding with the last available char (or 'X' if none)
  if (code.length < 3) {
    const padChar = code.slice(-1) || 'X';
    code = (code + padChar.repeat(3 - code.length)).slice(0, 3);
  }

  return code;
}

/**
 * Pre-save hook: generate productId as <TYPE_CODE><6-digit-serial>, e.g., LAP000001
 * Serial increments atomically per TYPE_CODE using ProductCounter.
 */
ProductSchema.pre('save', async function (next) {
  try {
    if (!this.isNew || this.productId) return next();

    // Load the Type name (assumes a Type model exists with a 'name' field)
    const TypeModel = mongoose.model('Type');
    const typeDoc = await TypeModel.findById(this.type).select('name').lean();
    if (!typeDoc) {
      return next(new Error('Invalid product type: not found'));
    }

    const typeCode = getTypeCode(typeDoc.name);

    // Atomically increment the counter for this typeCode
    const updated = await ProductCounter.findOneAndUpdate(
      { _id: typeCode },
      { $inc: { seq: 1 } },
      { upsert: true, new: true }
    ).lean();

    const serial = String(updated.seq).padStart(6, '0'); // 000001, 000002, ...
    this.productId = `${typeCode}${serial}`;

    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('Product', ProductSchema);
