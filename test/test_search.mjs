import https from "https";

const apiKey = process.env.VITE_PLANET_API_KEY;

const postData = JSON.stringify({
  item_types: ["PSScene"],
  filter: {
    type: "AndFilter",
    config: [
      {
        type: "GeometryFilter",
        field_name: "geometry",
        config: {
          type: "Polygon",
          coordinates: [
            [
              [2.33, 48.85],
              [2.34, 48.85],
              [2.34, 48.86],
              [2.33, 48.86],
              [2.33, 48.85],
            ],
          ],
        },
      },
      {
        type: "DateRangeFilter",
        field_name: "acquired",
        config: {
          gte: "2024-01-01T00:00:00.000Z",
          lte: "2024-12-31T00:00:00.000Z",
        },
      },
      {
        type: "RangeFilter",
        field_name: "cloud_cover",
        config: {
          lte: 0.1,
        },
      },
    ],
  },
});

const options = {
  hostname: "api.planet.com",
  path: "/data/v1/quick-search",
  method: "POST",
  headers: {
    Authorization: "Basic " + Buffer.from(apiKey + ":").toString("base64"),
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(postData),
  },
};

const req = https.request(options, (res) => {
  let data = "";
  res.on("data", (chunk) => {
    data += chunk;
  });
  res.on("end", () => {
    try {
      const parsed = JSON.parse(data);
      console.log(
        `Found ${parsed.features ? parsed.features.length : 0} items.`,
      );
      if (parsed.features && parsed.features.length > 0) {
        console.log("First item id:", parsed.features[0].id);
        console.log("First item properties:", parsed.features[0].properties);
      } else {
        console.log(parsed);
      }
    } catch (e) {
      console.error("Error parsing response:", e);
      console.log("Raw response:", data);
    }
  });
});

req.on("error", (e) => {
  console.error(`Problem with request: ${e.message}`);
});

req.write(postData);
req.end();
