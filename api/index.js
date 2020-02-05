import crypto from "crypto";
import queryString from "query-string";
import fetch from "node-fetch";
import { MongoClient } from "mongodb";
import ms from "ms";

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

export default async (req, res) => {
  const originalUrl = req.url;

  if (!originalUrl.match(/\/api\/v\d+\//)) {
    return res.status(404).send("Not Found");
  }

  const db = await getConnection();
  const dbCol = db.collection("cache");
  const cachedData = await dbCol.findOne({ url: originalUrl });
  if (cachedData && Date.now() - cachedData.updatedAt < ms(CACHE_TTL)) {
    return res.json({ cachedAt: cachedData.updatedAt, ...cachedData.data });
  }

  let { url, query } = queryString.parseUrl(originalUrl);

  url = url.replace("/api", "");
  query = {
    ...query,
    ...extraQuery()
  };

  const response = await fetch(
    `${MARVEL_API_PREFIX}${url}?${queryString.stringify(query)}`
  );

  if (response.status !== 200) {
    return res.status(response.status).send(response.statusText);
  }

  const data = await response.json();

  await dbCol.findOneAndReplace(
    { url: originalUrl },
    { url: originalUrl, data, updatedAt: Date.now() },
    { upsert: true }
  );

  res.json(data);
};
