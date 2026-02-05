const DASHBOARD_URL =
  "https://boschrexrothdev.grafana.net/public-dashboards/ec700d63425c40f4a7f32d45a7adf332";

const INFLUX_URL =
  "https://us-east-1-1.aws.cloud2.influxdata.com/api/v2/write?org=kideco&bucket=monitoring_cloud&precision=s";

const INFLUX_TOKEN =
  "t7mHH51CeVE-GbG2SwRDEzcbjvsHFZw6PDJX78WQTEPFZYDdR_KgduTihf0sF2BFI54H3FEcAI4hMOCvhnmcqw==";

let dashboardOpened = false;
let trackingStarted = false;

function escapeTag(value) {
  return value.replace(/[,= ]/g, "\\$&");
}

async function sendLocation() {
  const status = document.getElementById("status");

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

        status.innerText =
          `Tracking active ✔ (${new Date().toLocaleTimeString()})`;
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

  // 🔹 buka dashboard sekali
  if (!dashboardOpened) {
    window.open(DASHBOARD_URL, "_blank");
    dashboardOpened = true;
  }

  // 🔹 cegah multiple interval kalau tombol dipencet berkali-kali
  if (!trackingStarted) {
    status.innerText = "Starting GPS tracking...";

    // kirim pertama langsung
    sendLocation();

    // kirim terus tiap 3 detik
    setInterval(sendLocation, 3000);

    trackingStarted = true;
  }
}