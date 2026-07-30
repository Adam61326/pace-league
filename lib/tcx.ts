import type { RacePlan, RacePlanSplit } from "@/lib/race-plan";

// Bande d'alerte allure autour de la cible, en pourcentage — voir CLAUDE.md
// "SendToWatch" ("Alerte allure ±3% sur chaque lap"). Appliquée directement
// en vitesse (m/s) plutôt qu'inversée depuis un ±3% d'allure : à ±3% l'écart
// entre les deux formulations est négligeable, et TCX n'exprime les cibles
// qu'en vitesse (ViewAsPace ne fait qu'changer l'affichage côté montre).
const PACE_ALERT_TOLERANCE = 0.03;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function paceToSpeedMetersPerSecond(paceSecPerKm: number): number {
  return 1000 / paceSecPerKm;
}

function speedTarget(paceSecPerKm: number): string {
  const speed = paceToSpeedMetersPerSecond(paceSecPerKm);
  const low = speed * (1 - PACE_ALERT_TOLERANCE);
  const high = speed * (1 + PACE_ALERT_TOLERANCE);
  return `<Target xsi:type="Speed_t"><SpeedZone xsi:type="CustomSpeedZone_t"><ViewAsPace>true</ViewAsPace><LowInMetersPerSecond>${low.toFixed(4)}</LowInMetersPerSecond><HighInMetersPerSecond>${high.toFixed(4)}</HighInMetersPerSecond></SpeedZone></Target>`;
}

function distanceStep(stepId: number, name: string, distanceKm: number, paceSecPerKm: number): string {
  const meters = Math.round(distanceKm * 1000);
  return `<Step xsi:type="Step_t"><StepId>${stepId}</StepId><Name>${escapeXml(name)}</Name><Duration xsi:type="Distance_t"><Meters>${meters}</Meters></Duration><Intensity>Active</Intensity>${speedTarget(paceSecPerKm)}</Step>`;
}

// Regroupe les laps pleins identiques (même distance, même allure) dans un
// seul Repeat_t plutôt qu'un Step_t par lap — c'est littéralement la
// structure demandée ("Repeat/Step avec Duration=Distance, Target Pace") et
// ça évite un fichier de 40 Step quasi identiques pour un marathon.
export function generateRaceTcx(plan: RacePlan, splits: RacePlanSplit[]): string {
  const fullLaps = splits.filter((s) => !s.isFinishLap);
  const finishLap = splits.find((s) => s.isFinishLap) ?? null;

  const steps: string[] = [];
  let stepId = 1;

  if (fullLaps.length > 0) {
    const { distanceKm, targetPaceSecPerKm } = fullLaps[0];
    const repeatId = stepId++;
    const childId = stepId++;
    // <Child> IS the step (via xsi:type), pas un wrapper autour d'un <Step>
    // imbriqué — une double-imbrication est invalide contre le XSD TCX et
    // Garmin Connect rejette l'import silencieusement dans ce cas.
    const childContent = `<StepId>${childId}</StepId><Name>Lap</Name><Duration xsi:type="Distance_t"><Meters>${Math.round(distanceKm * 1000)}</Meters></Duration><Intensity>Active</Intensity>${speedTarget(targetPaceSecPerKm)}`;
    steps.push(
      `<Step xsi:type="Repeat_t"><StepId>${repeatId}</StepId><Repetitions>${fullLaps.length}</Repetitions><Child xsi:type="Step_t">${childContent}</Child></Step>`
    );
  }

  if (finishLap) {
    steps.push(distanceStep(stepId++, "Arrivée", finishLap.distanceKm, finishLap.targetPaceSecPerKm));
  }

  const workoutName = plan.raceName?.trim() || "Plan de course";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2 http://www.garmin.com/xmlschemas/TrainingCenterDatabasev2.xsd">
  <Workouts>
    <Workout Sport="Running">
      <Name>${escapeXml(workoutName)}</Name>
      ${steps.join("\n      ")}
    </Workout>
  </Workouts>
</TrainingCenterDatabase>
`;
}
