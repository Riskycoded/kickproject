const proxyClient = require('../proxy-client');
const kopechkaAccountCreator = require('../kopechka-account-creator');

jest.mock('../proxy-client', () => ({
  post: jest.fn(),
  get: jest.fn()
}));

describe('kopechka-account-creator unit tests', () => {
  const fakeToken = 'fake-api-key';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createEmailOrder', () => {
    it('should send the correct data to the Kopechka API and return the response data', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: {
            id: 'mock-order-id',
            email: 'test@asia.com'
          }
        }
      };
      proxyClient.post.mockResolvedValue(mockResponse);

      const details = {
        site: 'kick.com',
        domain: 'asia.com',
        mail_type: 'random'
      };

      const result = await kopechkaAccountCreator.createEmailOrder(fakeToken, details);

      expect(proxyClient.post).toHaveBeenCalledWith(
        'https://api.kopechka.com/api/v1/orders',
        details,
        {
          headers: {
            'X-API-Key': fakeToken,
            'Content-Type': 'application/json'
          }
        }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should throw an error if the Kopechka API request fails', async () => {
      proxyClient.post.mockRejectedValue(new Error('Network Error'));

      await expect(
        kopechkaAccountCreator.createEmailOrder(fakeToken, { site: 'kick.com' })
      ).rejects.toThrow('Network Error');
    });
  });

  describe('checkMessages', () => {
    it('should retrieve email messages for a specific order', async () => {
      const mockResponse = {
        data: {
          success: true,
          data: [{ id: 1, text: 'Verification code: 1234' }]
        }
      };
      proxyClient.get.mockResolvedValue(mockResponse);

      const orderId = 'mock-order-id';
      const result = await kopechkaAccountCreator.checkMessages(fakeToken, orderId);

      expect(proxyClient.get).toHaveBeenCalledWith(
        `https://api.kopechka.com/api/v1/orders/${orderId}/messages`,
        {
          headers: {
            'X-API-Key': fakeToken
          }
        }
      );
      expect(result).toEqual(mockResponse);
    });

    it('should throw an error if checking messages fails', async () => {
      proxyClient.get.mockRejectedValue(new Error('API Error'));

      await expect(
        kopechkaAccountCreator.checkMessages(fakeToken, 'mock-order-id')
      ).rejects.toThrow('API Error');
    });
  });
});
