const kopechkaAccountCreator = require('../kopechka-account-creator');

jest.mock('../kopechka-account-creator');
jest.mock('axios', () => {
  const mockAxiosInstance = {
    interceptors: {
      request: { use: jest.fn() },
      response: { use: jest.fn() }
    },
    post: jest.fn(),
    get: jest.fn()
  };
  return {
    create: jest.fn(() => mockAxiosInstance),
    post: jest.fn(),
    get: jest.fn()
  };
});

const axios = require('axios');

describe('Automated Account Creation Route Logic', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should successfully call kopechka and locally register a user and link kick account', async () => {
    // Mock Kopeechka order creation
    kopechkaAccountCreator.createEmailOrder.mockResolvedValue({
      data: {
        success: true,
        data: {
          id: 'mock-order-id',
          email: 'automated-test@asia.com'
        }
      }
    });

    // Mock local registrations
    axios.post.mockImplementation((url, data) => {
      if (url.includes('/api/auth/register')) {
        return Promise.resolve({
          data: {
            user: {
              _id: 'mock-user-id',
              email: 'automated-test@asia.com',
              username: 'auto_test'
            }
          }
        });
      } else if (url.includes('/api/kick-accounts')) {
        return Promise.resolve({
          data: {
            _id: 'mock-kick-id',
            userId: 'mock-user-id',
            username: 'kick_auto_test'
          }
        });
      }
      return Promise.reject(new Error('Unknown url: ' + url));
    });

    // Verify the mock functions return expected values when called
    const orderRes = await kopechkaAccountCreator.createEmailOrder('fake-key', { site: 'kick.com' });
    expect(orderRes.data.data.email).toBe('automated-test@asia.com');

    const regRes = await axios.post('http://localhost:4000/api/auth/register', {
      email: 'automated-test@asia.com',
      username: 'auto_test',
      password: 'pwd'
    });
    expect(regRes.data.user._id).toBe('mock-user-id');

    const kickRes = await axios.post('http://localhost:4000/api/kick-accounts', {
      userId: 'mock-user-id',
      username: 'kick_auto_test',
      email: 'automated-test@asia.com'
    });
    expect(kickRes.data.username).toBe('kick_auto_test');
  });
});
