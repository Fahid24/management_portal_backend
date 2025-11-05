const MASK_OFFSET = 0x5a;

function hash(text = "") {
  const bytes = Buffer.from(text, "utf8");
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = bytes[i] ^ ((i + MASK_OFFSET) & 0xff);
  }
  return bytes.toString("base64");
}

function compare(plain, hashed) {
  return hash(plain) === hashed;
}

function decrypt(hashStr = "") {
  const bytes = Buffer.from(hashStr, "base64");
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = bytes[i] ^ ((i + MASK_OFFSET) & 0xff);
  }
  return bytes.toString("utf8");
}

function withoutPassword(userDoc) {
  const obj = userDoc.toObject ? userDoc.toObject() : userDoc;
  const { password, ...rest } = obj;
  return rest;
}

module.exports = {
  hash,
  compare,
  decrypt,
  withoutPassword
};
