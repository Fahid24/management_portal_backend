const mongoose = require('mongoose');
const { production, development } = require('../baseUrl');

const {
  DB_USER,
  DB_PASS,
  DB_NAME,
} = process.env;
let uri;
if (production) {
  uri = `mongodb://127.0.0.1:27017/${DB_NAME}?directConnection=true&serverSelectionTimeoutMS=5000&appName=mongosh+2.5.1?replicaSet=rs0`;
}
else if (development) {
  uri =
    // `mongodb+srv://${DB_USER}:${DB_PASS}` +
    // `@cluster0.hdebc.mongodb.net/${DB_NAME}` +
    // `?retryWrites=true&w=majority&appName=Cluster0`;
  `mongodb+srv://${DB_USER}:${DB_PASS}@cluster0.abelstx.mongodb.net/${DB_NAME}?retryWrites=true&w=majority&appName=Cluster0`;

}
else {
  uri = `mongodb+srv://${DB_USER}:${DB_PASS}` +
    `@cluster0.hdebc.mongodb.net/${DB_NAME}` +
    `?retryWrites=true&w=majority&appName=Cluster0`
}



const connectDB = async () => {
  try {
    await mongoose.connect(uri);
    console.log('✅  MongoDB connected');
  } catch (err) {
    console.error('❌  MongoDB connection error:', err.message);
  }
};

module.exports = connectDB;
