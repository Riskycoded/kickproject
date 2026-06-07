const axios = require('axios');
const kickApiService = require('../Services/kickApiService');

jest.mock('axios');

describe('KickApiService unit tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('exchangeAuthorizationCode', () => {
    it('should exchange authorization code for token successfully', async () => {
      const mockTokenResponse = {
        data: {
          access_token: 'user-access-token-123',
          token_type: 'Bearer',
          refresh_token: 'refresh-token-456',
          expires_in: 3600,
          scope: 'user:read'
        }
      };
      axios.post.mockResolvedValue(mockTokenResponse);

      const result = await kickApiService.exchangeAuthorizationCode(
        'mock-auth-code',
        'http://localhost/callback',
        'mock-code-verifier'
      );

      expect(axios.post).toHaveBeenCalledWith(
        'https://id.kick.com/oauth/token',
        expect.any(String),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      expect(result).toEqual(mockTokenResponse.data);
    });

    it('should throw an error when token exchange fails', async () => {
      const apiError = new Error('Request failed with status code 400');
      apiError.response = { data: { message: 'Invalid code' } };
      axios.post.mockRejectedValue(apiError);

      await expect(
        kickApiService.exchangeAuthorizationCode(
          'invalid-code',
          'http://localhost/callback',
          'mock-code-verifier'
        )
      ).rejects.toThrow('Invalid code');
    });
  });

  describe('getLivestreams', () => {
    it('should fetch livestreams with authorization headers', async () => {
      const mockStreamsResponse = {
        data: {
          data: [
            {
              broadcaster_user_id: 123,
              slug: 'test-streamer',
              viewer_count: 50
            }
          ],
          message: 'OK'
        }
      };
      axios.get.mockResolvedValue(mockStreamsResponse);

      const result = await kickApiService.getLivestreams('token-123', { limit: 10 });

      expect(axios.get).toHaveBeenCalledWith(
        'https://api.kick.com/public/v1/livestreams',
        {
          headers: {
            'Authorization': 'Bearer token-123',
            'Accept': 'application/json'
          },
          params: { limit: 10 }
        }
      );
      expect(result).toEqual(mockStreamsResponse.data);
    });
  });

  describe('getChannel', () => {
    it('should fetch channel details by slug with authorization headers', async () => {
      const mockChannelResponse = {
        data: {
          id: 777,
          slug: 'ninja',
          user_id: 777,
          followers_count: 1000
        }
      };
      axios.get.mockResolvedValue(mockChannelResponse);

      const result = await kickApiService.getChannel('token-123', 'ninja');

      expect(axios.get).toHaveBeenCalledWith(
        'https://api.kick.com/public/v1/channels',
        {
          headers: {
            'Authorization': 'Bearer token-123',
            'Accept': 'application/json'
          },
          params: {
            slug: ['ninja']
          }
        }
      );
      expect(result).toEqual(mockChannelResponse.data);
    });
  });

  describe('getAuthenticatedUser', () => {
    it('should fetch authenticated user details successfully', async () => {
      const mockUserResponse = {
        data: [
          {
            email: 'user@kick.com',
            name: 'KickUser',
            profile_picture: 'https://kick.com/avatar.webp',
            user_id: 999
          }
        ],
        message: 'success'
      };
      axios.get.mockResolvedValue(mockUserResponse);

      const result = await kickApiService.getAuthenticatedUser('token-123');

      expect(axios.get).toHaveBeenCalledWith(
        'https://api.kick.com/public/v1/users',
        {
          headers: {
            'Authorization': 'Bearer token-123',
            'Accept': 'application/json'
          }
        }
      );
      expect(result).toEqual(mockUserResponse.data);
    });
  });

  describe('getCategories', () => {
    it('should fetch categories with authorization headers', async () => {
      const mockCategoriesResponse = {
        data: {
          data: [{ id: 101, name: 'Slots' }],
          message: 'OK'
        }
      };
      axios.get.mockResolvedValue(mockCategoriesResponse);

      const result = await kickApiService.getCategories('token-123', { limit: 10 });

      expect(axios.get).toHaveBeenCalledWith(
        'https://api.kick.com/public/v2/categories',
        {
          headers: {
            'Authorization': 'Bearer token-123',
            'Accept': 'application/json'
          },
          params: { limit: 10 }
        }
      );
      expect(result).toEqual(mockCategoriesResponse.data);
    });
  });

  describe('searchCategories', () => {
    it('should search categories with search query and authorization headers', async () => {
      const mockSearchResponse = {
        data: {
          data: [{ id: 101, name: 'Old School Runescape' }]
        }
      };
      axios.get.mockResolvedValue(mockSearchResponse);

      const result = await kickApiService.searchCategories('token-123', 'Runescape', 2);

      expect(axios.get).toHaveBeenCalledWith(
        'https://api.kick.com/public/v1/categories',
        {
          headers: {
            'Authorization': 'Bearer token-123',
            'Accept': 'application/json'
          },
          params: { q: 'Runescape', page: 2 }
        }
      );
      expect(result).toEqual(mockSearchResponse.data);
    });
  });

  describe('getCategory', () => {
    it('should fetch a specific category metadata by ID with authorization headers', async () => {
      const mockCategoryResponse = {
        data: {
          id: 101,
          name: 'Old School Runescape',
          viewer_count: 1000
        }
      };
      axios.get.mockResolvedValue(mockCategoryResponse);

      const result = await kickApiService.getCategory('token-123', 101);

      expect(axios.get).toHaveBeenCalledWith(
        'https://api.kick.com/public/v1/categories/101',
        {
          headers: {
            'Authorization': 'Bearer token-123',
            'Accept': 'application/json'
          }
        }
      );
      expect(result).toEqual(mockCategoryResponse.data);
    });
  });
});
