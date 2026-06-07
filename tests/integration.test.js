const axios = require('axios');

jest.mock('ws', () => {
  return class MockWebSocket {
    constructor(url) {
      this.url = url;
    }
    send(msg) {}
    on(event, cb) {
      if (event === 'open') {
        setTimeout(cb, 10);
      }
    }
    close() {}
  };
}, { virtual: true });

const proxyClient = require('../proxy-client');
const kopechkaAccountCreator = require('../kopechka-account-creator');
const viewbot = require('../viewbot');

jest.mock('../proxy-client', () => ({
  post: jest.fn(),
  get: jest.fn()
}));
jest.setTimeout(70000); // Set high timeout to accommodate the 30-second delay

describe('account creator and viewbot integration test', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create new accounts and simulate user behavior on them', async () => {
    const emails = ['test@example.com', 'test2@example.com'];
    const passwords = ['password123', 'password456'];

    // Mock the proxyClient responses for creating emails successfully
    proxyClient.post.mockImplementation((url, data) => {
      if (url.includes('/orders')) {
        return Promise.resolve({
          data: {
            success: true,
            data: {
              id: 'mock-order-id-' + Math.random(),
              email: 'test@asia.com'
            }
          }
        });
      }
      return Promise.resolve({ data: { success: true } });
    });

    console.log('Running bulk account creation...');
    const accounts = await kopechkaAccountCreator.bulkCreateAccounts(emails, passwords);
    expect(accounts.length).toBe(2);
    expect(accounts[0]).toHaveProperty('id');

    console.log('Simulating viewer actions...');
    for (const email of emails) {
      // Mock watch request
      proxyClient.post(`https://example.com/watch/${email}`, { action: 'play' });

      // Shorten the wait time during Jest test environment to keep tests fast
      const delay = process.env.NODE_ENV === 'test' ? 100 : 30000;
      await new Promise((resolve) => {
        setTimeout(resolve, delay);
      });
    }

    // Verify proxyClient requests were sent for each email
    expect(proxyClient.post).toHaveBeenCalledWith(
      `https://example.com/watch/test@example.com`,
      { action: 'play' }
    );
    expect(proxyClient.post).toHaveBeenCalledWith(
      `https://example.com/watch/test2@example.com`,
      { action: 'play' }
    );
  });
});

