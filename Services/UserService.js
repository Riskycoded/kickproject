const User = require('../models/user');
const { hashPassword } = require('../utils/helpers');

class UserService {
  async createUser(email, username, password) {
    const userData = { email };
    if (username) userData.username = username;
    if (password) userData.password = hashPassword(password);

    const user = new User(userData);
    await user.save();

    return user;
  }

  async getUserById(id) {
    return await User.findById(id).exec();
  }

  async getUserAll() {
    return await User.find().exec();
  }

  async getAllUsers() {
    return await this.getUserAll();
  }
}

module.exports = new UserService();
