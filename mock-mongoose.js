const mongoose = require('mongoose');

console.log('Loading Mock Mongoose in-memory database helper...');

const mockDatabases = {};

// Overwrite mongoose.connect to be a non-blocking no-op
mongoose.connect = function() {
  console.log('Mock Mongoose connected (in-memory mode).');
  return Promise.resolve(mongoose);
};

// Overwrite mongoose.model to return our MockModel class
mongoose.model = function(name, schema) {
  const collectionName = name.toLowerCase() + 's';
  mockDatabases[collectionName] = mockDatabases[collectionName] || [];

  console.log(`Mock Model registered: ${name} (collection: ${collectionName})`);

  class MockModel {
    constructor(data) {
      Object.assign(this, data);
      if (!this._id) {
        this._id = 'mock_' + Math.random().toString(36).substring(2, 11);
      }
    }

    async save() {
      const db = mockDatabases[collectionName];
      const idx = db.findIndex(x => String(x._id) === String(this._id));
      if (idx >= 0) {
        db[idx] = { ...this };
      } else {
        db.push({ ...this });
      }
      return this;
    }

    static find(query = {}) {
      const db = mockDatabases[collectionName];
      const filtered = db.filter(x => {
        for (const key in query) {
          if (String(x[key]) !== String(query[key])) return false;
        }
        return true;
      });
      const promise = Promise.resolve(filtered.map(x => new MockModel(x)));
      return {
        exec: () => promise,
        then: (onFulfilled, onRejected) => promise.then(onFulfilled, onRejected),
        catch: (onRejected) => promise.catch(onRejected)
      };
    }

    static findById(id) {
      const db = mockDatabases[collectionName];
      const doc = db.find(x => String(x._id) === String(id));
      const promise = Promise.resolve(doc ? new MockModel(doc) : null);
      return {
        exec: () => promise,
        then: (onFulfilled, onRejected) => promise.then(onFulfilled, onRejected),
        catch: (onRejected) => promise.catch(onRejected)
      };
    }

    static findOne(query = {}) {
      const db = mockDatabases[collectionName];
      const doc = db.find(x => {
        for (const key in query) {
          if (String(x[key]) !== String(query[key])) return false;
        }
        return true;
      });
      const promise = Promise.resolve(doc ? new MockModel(doc) : null);
      return {
        exec: () => promise,
        then: (onFulfilled, onRejected) => promise.then(onFulfilled, onRejected),
        catch: (onRejected) => promise.catch(onRejected)
      };
    }

    static findByIdAndUpdate(id, update, options) {
      const db = mockDatabases[collectionName];
      const idx = db.findIndex(x => String(x._id) === String(id));
      let doc = null;
      if (idx >= 0) {
        if (update && update.$set) {
          Object.assign(db[idx], update.$set);
        } else if (update) {
          Object.assign(db[idx], update);
        }
        doc = db[idx];
      }
      const promise = Promise.resolve(doc ? new MockModel(doc) : null);
      return {
        exec: () => promise,
        then: (onFulfilled, onRejected) => promise.then(onFulfilled, onRejected),
        catch: (onRejected) => promise.catch(onRejected)
      };
    }

    static findByIdAndDelete(id) {
      const db = mockDatabases[collectionName];
      const idx = db.findIndex(x => String(x._id) === String(id));
      let doc = null;
      if (idx >= 0) {
        doc = db[idx];
        db.splice(idx, 1);
      }
      const promise = Promise.resolve(doc ? new MockModel(doc) : null);
      return {
        exec: () => promise,
        then: (onFulfilled, onRejected) => promise.then(onFulfilled, onRejected),
        catch: (onRejected) => promise.catch(onRejected)
      };
    }
  }

  return MockModel;
};

module.exports = mongoose;



// server will run on port 4000