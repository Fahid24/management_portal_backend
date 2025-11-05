require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./config/db');
const Employee = require('./model/employeeSchema');
const { hash } = require('./utils/secret');

// Admin user data
const adminData = {
  employeeId: 'ADMIN001',
  firstName: 'Admin',
  lastName: 'User',
  email: 'admin.portal@yopmail.com',
  password: 'Admin@123', // Will be hashed
  phone: '+1234567890',
  designation: 'System Administrator',
  role: 'Admin',
  status: 'Active',
  employmentType: 'FullTime',
  workLocation: '',
  shift: 'Day',
  startDate: new Date(),
  bloodGroup: 'O+',
  gender: 'Male',
  maritalStatus: 'Single',
  religion: 'Other',
  filingStatus: 'Single',
  dateOfBirth: new Date('1990-01-01'),
  isVerified: true,
  isEmailVerified: true,
  isPhoneVerified: true,
  isAddressVerified: true,
  isEmergencyContactVerified: true,
  isDocumentVerified: true,
  isUpdated: true,
  address: {
    address: '123 Main Street',
    city: 'New York',
    state: 'NY',
    zip: '10001',
    currentAddress: '123 Main Street, New York, NY 10001'
  },
  emergencyContact: {
    name: 'Emergency Contact',
    relationship: 'Family',
    phonePrimary: '+1234567890',
    email: 'emergency@example.com',
    address: '123 Main Street'
  },
  bankInfo: {
    accountNumber: '1234567890',
    bankName: 'Example Bank',
    branchName: 'Main Branch',
    routingNumber: '123456789'
  }
};

// Function to seed admin user
const seedAdmin = async () => {
  try {
    // Connect to database
    await connectDB();
    console.log('🔄 Starting admin user seeding...\n');

    // Check if admin already exists
    const existingAdmin = await Employee.findOne({ 
      $or: [
        { email: adminData.email },
        { employeeId: adminData.employeeId }
      ]
    });

    if (existingAdmin) {
      console.log('⚠️  Admin user already exists!');
      console.log(`   Email: ${existingAdmin.email}`);
      console.log(`   Employee ID: ${existingAdmin.employeeId}`);
      console.log(`   Role: ${existingAdmin.role}\n`);
      
      // Ask if user wants to update
      console.log('💡 To create a new admin with different credentials, modify the adminData in seed.js');
      process.exit(0);
    }

    // Hash the password
    const hashedPassword = hash(adminData.password);
    
    // Create admin user
    const admin = new Employee({
      ...adminData,
      password: hashedPassword
    });

    await admin.save();

    console.log('✅ Admin user created successfully!\n');
    console.log('📋 Admin Details:');
    console.log('   =====================================');
    console.log(`   Employee ID: ${admin.employeeId}`);
    console.log(`   Name: ${admin.firstName} ${admin.lastName}`);
    console.log(`   Email: ${admin.email}`);
    console.log(`   Password: ${adminData.password} (save this!)`);
    console.log(`   Role: ${admin.role}`);
    console.log(`   Status: ${admin.status}`);
    console.log(`   Designation: ${admin.designation}`);
    console.log('   =====================================\n');
    console.log('⚠️  Important: Save the password shown above securely!\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding admin user:', error.message);
    console.error(error);
    process.exit(1);
  }
};

// Run the seed function
seedAdmin();
