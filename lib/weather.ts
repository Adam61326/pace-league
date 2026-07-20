// Météo au moment d'une activité, via l'API Forecast d'Open-Meteo
// (https://open-meteo.com) : gratuite sans clé pour un usage non commercial
// (le produit n'a ni abonnement ni publicité à ce stade, cf. CLAUDE.md),
// limites larges (600 req/min, 5000/h, 10000/jour — sans commune mesure avec
// notre volume). Licence CC-BY 4.0 : attribution affichée à côté des
// données météo sur /mes-activites.
//
// Volontairement l'API Forecast (api.open-meteo.com/v1/forecast) et non
// l'API Historique dédiée (archive-api.open-meteo.com) : cette dernière a un
// délai de ~5 jours (données ERA5), inutilisable pour une activité qui vient
// d'arriver par webhook. L'API Forecast sert aussi les jours passés
// (start_date/end_date) sans ce délai, jusqu'à 92 jours en arrière —
// largement suffisant ici (vérifié manuellement par requête réelle).
//
// timezone=auto fait renvoyer par Open-Meteo des horaires étiquetés en heure
// locale du lieu (détectée depuis lat/lon), ce qui correspond directement à
// `start_date_local` de Strava (déjà en heure locale malgré son suffixe
// "Z") : pas de conversion de fuseau à faire, on matche juste la même heure.
const OPEN_METEO_BASE = "https://api.open-meteo.com/v1/forecast";

export interface ActivityWeather {
  temperatureCelsius: number;
  windSpeedKmh: number;
}

// startDateLocal : `start_date_local` Strava, ex. "2026-07-15T18:30:00Z".
export async function fetchWeatherForActivity(
  lat: number,
  lng: number,
  startDateLocal: string
): Promise<ActivityWeather | null> {
  const date = startDateLocal.slice(0, 10);
  const hour = startDateLocal.slice(11, 13);

  const url = new URL(OPEN_METEO_BASE);
  url.searchParams.set("latitude", lat.toFixed(4));
  url.searchParams.set("longitude", lng.toFixed(4));
  url.searchParams.set("hourly", "temperature_2m,wind_speed_10m");
  url.searchParams.set("start_date", date);
  url.searchParams.set("end_date", date);
  url.searchParams.set("timezone", "auto");

  let response: Response;
  try {
    response = await fetch(url.toString());
  } catch (err) {
    console.error("open-meteo: fetch failed", err);
    return null;
  }

  if (!response.ok) return null;

  const data = await response.json();
  const times: string[] = data?.hourly?.time ?? [];
  const temps: (number | null)[] = data?.hourly?.temperature_2m ?? [];
  const winds: (number | null)[] = data?.hourly?.wind_speed_10m ?? [];

  const targetHour = `${date}T${hour}:00`;
  const index = times.indexOf(targetHour);
  if (index === -1) return null;

  const temperatureCelsius = temps[index];
  const windSpeedKmh = winds[index];
  if (temperatureCelsius == null || windSpeedKmh == null) return null;

  return { temperatureCelsius, windSpeedKmh };
}
