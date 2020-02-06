import crypto from "crypto";
import queryString from "query-string";
import fetch from "node-fetch";
import ms from "ms";
import cors from "micro-cors";

import getConnection from "./_db";

const API_KEY = process.env.marvel_api_key;
const SECRET_KEY = process.env.marvel_secret_key;

const MARVEL_API_PREFIX = "https://gateway.marvel.com";

const CACHE_TTL = "7d";

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

const handler = async (req, res) => {
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

export default cors()(handler);
