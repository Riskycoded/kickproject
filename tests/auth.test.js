const express = require('express');
const auth = require('../auth');
const User = require('../models/user');

jest.mock('../models/user');

describe('Auth Middleware and Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticate middleware', () => {
    it('should block requests without a token', () => {
      const req = { headers: {} };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      const next = jest.fn();

      auth.authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access denied: Authentication required.' });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
