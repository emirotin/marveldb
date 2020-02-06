import { MongoClient } from "mongodb";

const MONGO_CONNECTION_STRING = process.env.mongo_connection_string;
const DB_NAME = "marvel";

let cachedDb = null;

const client = new MongoClient(MONGO_CONNECTION_STRING, {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

const createIndexes = async db => {
  try {
    await db
      .collection("cache")
      .createIndex({ url: 1 }, { background: true, unique: true });
  } catch (error) {
    console.group("Error: MongoDB Indexing");
    console.log(error);
    console.groupEnd();
  }
};

const database = async () => {
  if (client.isConnected()) {
    return cachedDb;
  }

  try {
    const conn = await client.connect();
    cachedDb = conn.db(DB_NAME);
    await createIndexes(cachedDb);
    return cachedDb;
  } catch (err) {
    console.error(err);
    throw err;
  }
};

export default database;
