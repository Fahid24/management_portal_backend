const mongoose = require('mongoose');
const { production, development } = require('../baseUrl');
require('dotenv').config();

const DB_USER = process.env.DB_USER;
const DB_PASS = process.env.DB_PASS;
const DB_NAME = process.env.DB_NAME;

const url = `mongodb+srv://${DB_USER}:${DB_PASS}@cluster0.6p1k6em.mongodb.net/${DB_NAME}?retryWrites=true&w=majority&appName=Cluster0`;


const connectDB = async () => {
  try {
    await mongoose.connect(url);
    console.log('✅  MongoDB connected');
  } catch (err) {
    console.log(err)
    console.error('❌  MongoDB connection error:', err.message);
  }
};

module.exports = connectDB;
