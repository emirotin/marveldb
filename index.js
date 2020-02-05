const crypto = require("crypto");
const { send } = require("micro");
const queryString = require("query-string");
const fetch = require("node-fetch");
const { MongoClient } = require("mongodb");
const ms = require("ms");

const MONGO_CONNECTION_STRING = process.env.mongo_connection_string;
const API_KEY = process.env.marvel_api_key;
const SECRET_KEY = process.env.marvel_secret_key;

const MARVEL_API_PREFIX = "https://gateway.marvel.com";

const DB_NAME = "marvel";
const CACHE_TTL = "7d";

const getConnection = async () => {
  const client = new MongoClient(MONGO_CONNECTION_STRING, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  });
  await client.connect();
  return client.db(DB_NAME);
};

const extraQuery = () => {
  const ts = Date.now();
  const hasher = crypto.createHash("md5");
  hasher.update(`${ts}${SECRET_KEY}${API_KEY}`);
  const hash = hasher.digest("hex");

  return {
    ts,
    apikey: API_KEY,
    hash
  };
};

module.exports = async (req, res) => {
  const originalUrl = req.url;

  const db = await getConnection();
  const dbCol = db.collection("cache");
  const cachedData = await dbCol.findOne(
    { url: originalUrl },
    {
      fields: ["data", "updatedAt"]
    }
  );
  if (cachedData && Date.now() - cachedData.updatedAt < ms(CACHE_TTL)) {
    return { cachedAt: cachedData.updatedAt, ...cachedData.data };
  }

  let { url, query } = queryString.parseUrl(originalUrl);
  if (!url.match(/\/v\d+\//)) {
    send(res, 404);
    return;
  }
  query = {
    ...query,
    ...extraQuery()
  };
  const response = await fetch(
    `${MARVEL_API_PREFIX}${url}?${queryString.stringify(query)}`
  );
  if (response.status !== 200) {
    return send(res, response.status, response.statusText);
  }
  const data = await response.json();

  await dbCol.findOneAndReplace(
    { url: originalUrl },
    { url: originalUrl, data, updatedAt: Date.now() },
    { upsert: true }
  );

  return data;
};
