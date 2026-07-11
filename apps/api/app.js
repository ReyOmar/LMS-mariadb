// Startup entry point for cPanel Node.js Application Manager (Phusion Passenger)
process.env.NODE_ENV = 'production';
require('./dist/main.js');
