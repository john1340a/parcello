import http from "https";

const apiKey = process.env.VITE_PLANET_API_KEY;

const options = {
  hostname: "api.planet.com",
  path: "/basemaps/v1/mosaics",
  method: "GET",
  headers: {
    Authorization: "Basic " + Buffer.from(apiKey + ":").toString("base64"),
  },
};

const req = http.request(options, (res) => {
  let data = "";
  res.on("data", (d) => {
    data += d;
  });
  res.on("end", () => {
    console.log(JSON.parse(data));
  });
});

req.on("error", (e) => {
  console.error(e);
});

req.end();
