const DASHBOARD_URL =
  "https://boschrexrothdev.grafana.net/public-dashboards/ec700d63425c40f4a7f32d45a7adf332";

const INFLUX_URL =
  "https://us-east-1-1.aws.cloud2.influxdata.com/api/v2/write?org=kideco&bucket=monitoring_cloud&precision=s";

const INFLUX_TOKEN =
  "t7mHH51CeVE-GbG2SwRDEzcbjvsHFZw6PDJX78WQTEPFZYDdR_KgduTihf0sF2BFI54H3FEcAI4hMOCvhnmcqw==";

let dashboardOpened = false;
let locationSent = false; // ⬅️ biar cuma kirim sekali

function escapeTag(value) {
  return value.replace(/[,= ]/g, "\\$&");
}

async function sendLocationOnce() {
  const status = document.getElementById("status");

  if (locationSent) {
    status.innerText = "Location already sent ✔";
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      const latitude = pos.coords.latitude;
      const longitude = pos.coords.longitude;
      const accuracy = pos.coords.accuracy;
      const user = escapeTag("mobile_user");

      const lineProtocol =
        `location,user=${user} latitude=${latitude},longitude=${longitude},accuracy=${accuracy}`;

      try {
        await fetch(INFLUX_URL, {
          method: "POST",
          headers: {
            "Authorization": `Token ${INFLUX_TOKEN}`,
            "Content-Type": "text/plain"
          },
          body: lineProtocol
        });

        locationSent = true;
        status.innerText = `Location sent ✔ (${new Date().toLocaleTimeString()})`;
      } catch (err) {
        console.error(err);
        status.innerText = "Failed to send location";
      }
    },
    (err) => {
      console.warn(err);
      status.innerText = "GPS permission denied / error";
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
}

function openDashboard() {
  const status = document.getElementById("status");

  if (!navigator.geolocation) {
    status.innerText = "Geolocation not supported";
    window.open(DASHBOARD_URL, "_blank");
    return;
  }

  // 🔹 buka dashboard cuma sekali
  if (!dashboardOpened) {
    window.open(DASHBOARD_URL, "_blank");
    dashboardOpened = true;

    // 🔹 kirim koordinat sekali saja
    status.innerText = "Sending location...";
    sendLocationOnce();
  } else {
    status.innerText = "Dashboard already opened";
  }
}
