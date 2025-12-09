// Simple test script for sync server
const axios = require('axios');

const BASE_URL = 'https://vpnmanager.0x409.nl';

async function testSyncServer() {
  try {
    console.log('Testing sync server...');

    // Test health endpoint
    console.log('Testing health endpoint...');
    const healthResponse = await axios.get(`${BASE_URL}/health`);
    console.log('Health check:', healthResponse.data);

    // Register a test server
    console.log('Registering test server...');
    const registerResponse = await axios.post(`${BASE_URL}/register`, {
      id: 'test-server-1',
      location: 'us-east',
      url: 'ws://test.example.com/ws'
    });
    console.log('Registration response:', registerResponse.data);

    // Get server list
    console.log('Getting server list...');
    const listResponse = await axios.get(`${BASE_URL}/list`);
    console.log('Server list:', listResponse.data);

  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testSyncServer();
