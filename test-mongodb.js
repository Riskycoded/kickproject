const loadEnv = require('./load-env');
loadEnv();

const { MongoClient, ServerApiVersion } = require('mongodb');

// Get URI from environment variables (hiding credentials if printed)
const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/voidkid";

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    console.log(`Connecting to MongoDB...`);
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (error) {
    console.error("Connection failed:", error.message);
  } finally {
    await client.close();
  }
}

run().catch(console.dir);
