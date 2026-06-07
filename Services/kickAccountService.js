const KickAccount = require('../models/kickAccount');

class KickAccountService {
  /**
   * Links a new platform account to a user.
   * @param {Object} accountData
   * @param {string} accountData.userId
   * @param {string} accountData.username
   * @param {string} [accountData.email]
   * @param {Object} [accountData.credentials]
   * @returns {Promise<Object>} The created LinkedAccount record
   */
  async createKickAccount(accountData) {
    const kickAccount = new KickAccount({
      userId: accountData.userId,
      username: accountData.username,
      email: accountData.email,
      credentials: accountData.credentials,
      status: 'active'
    });
    
    await kickAccount.save();
    return kickAccount;
  }

  /**
   * Retrieves a specific linked account by its MongoDB ID.
   * @param {string} id 
   * @returns {Promise<Object|null>}
   */
  async getKickAccountById(id) {
    return await KickAccount.findById(id).exec();
  }

  /**
   * Retrieves all linked platform accounts for a given user.
   * @param {string} userId 
   * @returns {Promise<Object[]>}
   */
  async getKickAccountsByUserId(userId) {
    return await KickAccount.find({ userId }).exec();
  }

  /**
   * Updates credentials or status of a linked account.
   * @param {string} id 
   * @param {Object} updateData 
   * @returns {Promise<Object|null>}
   */
  async updateKickAccount(id, updateData) {
    return await KickAccount.findByIdAndUpdate(
      id,
      { $set: updateData },
      { new: true }
    ).exec();
  }

  /**
   * Deletes/unlinks an account.
   * @param {string} id 
   * @returns {Promise<Object|null>}
   */
  async deleteKickAccount(id) {
    return await KickAccount.findByIdAndDelete(id).exec();
  }
}

module.exports = new KickAccountService();
