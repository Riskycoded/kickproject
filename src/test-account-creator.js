const kopechkaAccountCreator = require('./kopechka-account-creator');

async function testBulkCreateAccounts() {
  const emails = ['test@example.com', 'test2@example.com'];
  const passwords = ['password123', 'password456'];

  try {
    const accounts = await kopechkaAccountCreator.bulkCreateAccounts(emails, passwords);
    console.log('Created accounts:', accounts);
  } catch (error) {
    console.error('Error creating accounts:', error);
  }
}

testBulkCreateAccounts();