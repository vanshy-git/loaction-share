const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
app.use(express.json());
app.use(cors());

const sessions = {}; // { id: { lat, lng, updatedAt } }

// Home page: creates links
app.get("/", (req, res) => {
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <title>Create Tracking Session</title>
  </head>
  <body>
    <h1>Create Tracking Session</h1>
    <button id="createBtn">Create New Link</button>

    <h2>Result</h2>
    <p><strong>Share Link (for YOU on your phone):</strong></p>
    <p id="shareLink">--</p>

    <p><strong>View Link (send to your parents):</strong></p>
    <p id="viewLink">--</p>

    <script>
      const btn = document.getElementById("createBtn");
      const shareEl = document.getElementById("shareLink");
      const viewEl = document.getElementById("viewLink");

      btn.addEventListener("click", async () => {
        shareEl.textContent = "Creating...";
        viewEl.textContent = "";

        try {
          const res = await fetch("/create-link", { method: "POST" });
          const data = await res.json();

          shareEl.innerHTML = '<a href="' + data.shareUrl + '" target="_blank">' + data.shareUrl + '</a>';
          viewEl.innerHTML = '<a href="' + data.viewUrl + '" target="_blank">' + data.viewUrl + '</a>';
        } catch (e) {
          shareEl.textContent = "Error creating link.";
          console.error(e);
        }
      });
    </script>
  </body>
  </html>
  `;
  res.send(html);
});

// Page that shares YOUR location
app.get("/share", (req, res) => {
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <title>Share My Location</title>
  </head>
  <body>
    <h2>Sharing your location for 1 hour...</h2>
    <p id="status">Requesting location permission...</p>

    <script>
      const params = new URLSearchParams(window.location.search);
      const id = params.get("id");
      const statusEl = document.getElementById("status");

      const stopTime = Date.now() + 60 * 60 * 1000; // 1 hour

      if (!id) {
        statusEl.innerText = "Missing id in URL.";
      } else if (!navigator.geolocation) {
        statusEl.innerText = "Geolocation not supported on this device.";
      } else {
        navigator.geolocation.watchPosition(
          async (pos) => {
            if (Date.now() > stopTime) {
              statusEl.innerText = "Sharing stopped (1 hour over). You can close this tab.";
              return;
            }

            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            statusEl.innerText = "Sharing... Lat: " + lat.toFixed(5) + ", Lng: " + lng.toFixed(5);

            try {
              await fetch("/update-location/" + id, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lat, lng }),
              });
            } catch (e) {
              console.error("Error sending location:", e);
            }
          },
          (err) => {
            statusEl.innerText = "Error getting location: " + err.message;
          },
          {
            enableHighAccuracy: true,
            maximumAge: 5000,
            timeout: 20000,
          }
        );
      }
    </script>
  </body>
  </html>
  `;
  res.send(html);
});

// Page for your parents to view
app.get("/view", (req, res) => {
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <title>Track Location</title>
  </head>
  <body>
    <h2>Current Location</h2>
    <p id="info">Waiting for location...</p>
    <p><a id="mapsLink" href="#" target="_blank">Open in Google Maps</a></p>

    <script>
      const params = new URLSearchParams(window.location.search);
      const id = params.get("id");
      const info = document.getElementById("info");
      const link = document.getElementById("mapsLink");

      if (!id) {
        info.innerText = "Missing id in URL.";
      } else {
        async function fetchLocation() {
          try {
            const res = await fetch("/location/" + id);
            if (!res.ok) {
              info.innerText = "No location yet or session not found.";
              return;
            }

            const data = await res.json();
            if (!data.lat || !data.lng) {
              info.innerText = "Location not received yet.";
              return;
            }

            info.innerText = "Lat: " + Number(data.lat).toFixed(5) + ", Lng: " + Number(data.lng).toFixed(5);
            const mapsUrl = "https://www.google.com/maps?q=" + data.lat + "," + data.lng;
            link.href = mapsUrl;
          } catch (e) {
            info.innerText = "Error fetching location.";
            console.error(e);
          }
        }

        setInterval(fetchLocation, 15000);
        fetchLocation();
      }
    </script>
  </body>
  </html>
  `;
  res.send(html);
});

// API: create-link
app.post("/create-link", (req, res) => {
  const id = crypto.randomBytes(8).toString("hex");
  sessions[id] = { lat: null, lng: null, updatedAt: null };

  const baseUrl = req.protocol + "://" + req.get("host");
  const shareUrl = baseUrl + "/share?id=" + id;
  const viewUrl = baseUrl + "/view?id=" + id;

  res.json({ id, shareUrl, viewUrl });
});

// API: update-location
app.post("/update-location/:id", (req, res) => {
  const id = req.params.id;
  const { lat, lng } = req.body;

  if (!sessions[id]) {
    return res.status(404).json({ error: "Session not found" });
  }

  sessions[id] = {
    lat,
    lng,
    updatedAt: Date.now(),
  };

  res.json({ ok: true });
});

// API: get latest location
app.get("/location/:id", (req, res) => {
  const id = req.params.id;
  const session = sessions[id];

  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  res.json(session);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running at http://localhost:" + PORT);
});

