const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const app = express();
app.use(express.json());
app.use(cors());

// In-memory session storage: { id: { lat, lng, updatedAt } }
const sessions = {};

// ========== HOME PAGE: CREATE TRACKING SESSION ==========
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

          shareEl.innerHTML =
            '<a href="' + data.shareUrl + '" target="_blank">' +
            data.shareUrl +
            "</a>";

          viewEl.innerHTML =
            '<a href="' + data.viewUrl + '" target="_blank">' +
            data.viewUrl +
            "</a>";
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

// ========== SHARE PAGE: YOUR PHONE SENDS LOCATION EVERY MINUTE ==========
app.get("/share", (req, res) => {
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8" />
    <title>Share My Location</title>
  </head>
  <body>
    <h2>Sharing your location every minute...</h2>
    <p id="status">Checking location permission...</p>
    <p id="lastSent">Last sent: --</p>
    <button id="stopBtn">Stop sharing</button>

    <script>
      const params = new URLSearchParams(window.location.search);
      const id = params.get("id");
      const statusEl = document.getElementById("status");
      const lastSentEl = document.getElementById("lastSent");
      const stopBtn = document.getElementById("stopBtn");

      let stopped = false;

      async function trySendLocation() {
        if (stopped) return;

        if (!navigator.geolocation) {
          statusEl.innerText = "Geolocation is not supported on this device.";
          return;
        }

        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            // success
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const acc = pos.coords.accuracy;

            statusEl.innerText =
              "Sharing... Lat: " + lat.toFixed(6) +
              ", Lng: " + lng.toFixed(6) +
              " (accuracy ≈ " + Math.round(acc) + "m)";

            try {
              const response = await fetch("/update-location/" + id, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lat, lng }),
              });

              if (!response.ok) {
                statusEl.innerText = "Server error: " + response.status;
              } else {
                lastSentEl.innerText =
                  "Last sent: " + new Date().toLocaleTimeString();
              }
            } catch (err) {
              statusEl.innerText = "Network error, will retry...";
              console.error("Error sending location:", err);
            }
          },
          (err) => {
            // failure (permission denied / blocked / GPS off)
            statusEl.innerHTML =
              "<span style='color:red;'>Cannot access location.</span><br>" +
              "Reason: " + err.message + "<br><br>" +
              "Please enable location manually:<br>" +
              "• Turn ON Location / GPS on your phone<br>" +
              "• If blocked, tap the lock icon in browser → Site settings → Location → Allow<br>" +
              "Tracking will resume automatically once location is available.";
            console.log("Location error:", err);
          },
          {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0,
          }
        );
      }

      if (!id) {
        statusEl.innerText = "Missing id in URL.";
      } else {
        // send immediately once
        trySendLocation();
        // then every 60 seconds
        const intervalId = setInterval(() => {
          if (stopped) {
            clearInterval(intervalId);
            return;
          }
          trySendLocation();
        }, 60 * 1000);
      }

      stopBtn.addEventListener("click", () => {
        stopped = true;
        statusEl.innerText = "Tracking stopped by you.";
      });
    </script>
  </body>
  </html>
  `;
  res.send(html);
});

// ========== VIEW PAGE: PARENTS SEE LATEST LOCATION ==========
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
    <p id="updated">Last updated: --</p>
    <p id="freshness"></p>
    <p><a id="mapsLink" href="#" target="_blank">Open in Google Maps</a></p>

    <script>
      const params = new URLSearchParams(window.location.search);
      const id = params.get("id");
      const info = document.getElementById("info");
      const updatedEl = document.getElementById("updated");
      const freshnessEl = document.getElementById("freshness");
      const link = document.getElementById("mapsLink");

      function formatTime(ms) {
        const d = new Date(ms);
        return d.toLocaleTimeString();
      }

      if (!id) {
        info.innerText = "Missing id in URL.";
      } else {
        async function fetchLocation() {
          try {
            const res = await fetch("/location/" + id);
            if (!res.ok) {
              info.innerText = "No location yet or session not found.";
              updatedEl.innerText = "Last updated: --";
              freshnessEl.innerText = "";
              return;
            }

            const data = await res.json();
            if (!data.lat || !data.lng) {
              info.innerText = "Location not received yet.";
              updatedEl.innerText = "Last updated: --";
              freshnessEl.innerText = "";
              return;
            }

            info.innerText =
              "Lat: " + Number(data.lat).toFixed(6) +
              ", Lng: " + Number(data.lng).toFixed(6);

            if (data.updatedAt) {
              updatedEl.innerText = "Last updated: " + formatTime(data.updatedAt);
              const age = Date.now() - data.updatedAt;
              if (age < 60 * 1000) {
                freshnessEl.innerText =
                  "Status: location is fresh (updated in last 1 minute).";
              } else {
                freshnessEl.innerText =
                  "Status: location may be old (no recent updates).";
              }
            } else {
              updatedEl.innerText = "Last updated: --";
              freshnessEl.innerText = "";
            }

            const mapsUrl =
              "https://www.google.com/maps?q=" + data.lat + "," + data.lng;
            link.href = mapsUrl;
          } catch (e) {
            info.innerText = "Error fetching location.";
            console.error(e);
          }
        }

        // Check every 30 seconds
        setInterval(fetchLocation, 30 * 1000);
        fetchLocation();
      }
    </script>
  </body>
  </html>
  `;
  res.send(html);
});

// ========== API: CREATE NEW SESSION ==========
app.post("/create-link", (req, res) => {
  const id = crypto.randomBytes(8).toString("hex");
  sessions[id] = { lat: null, lng: null, updatedAt: null };

  const baseUrl = `${req.protocol}://${req.get("host")}`;
  const shareUrl = baseUrl + "/share?id=" + id;
  const viewUrl = baseUrl + "/view?id=" + id;

  res.json({ id, shareUrl, viewUrl });
});

// ========== API: UPDATE LOCATION ==========
app.post("/update-location/:id", (req, res) => {
  const id = req.params.id;
  const { lat, lng } = req.body;

  if (!sessions[id]) {
    console.log("❌ Session not found:", id);
    return res.status(404).json({ error: "Session not found" });
  }

  console.log(
    "📍 Received location for",
    id,
    "->",
    lat,
    lng,
    "at",
    new Date().toLocaleTimeString()
  );

  sessions[id] = {
    lat,
    lng,
    updatedAt: Date.now(),
  };

  res.json({ ok: true });
});

// ========== API: GET LATEST LOCATION ==========
app.get("/location/:id", (req, res) => {
  const id = req.params.id;
  const session = sessions[id];

  if (!session) {
    return res.status(404).json({ error: "Session not found" });
  }

  res.json(session);
});

// ========== START SERVER ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running at http://localhost:" + PORT);
});
