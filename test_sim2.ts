import { RaceSimulator } from './src/core/race_simulator';
const sim = new RaceSimulator();
const horses = [
  { horse_number: 1, horse: { name: "H1", running_style: "逃げ", speed: 50, stamina: 50, power: 50, burst: 50, guts: 50, wisdom: 50 }, jockey_name: "J1" },
  { horse_number: 2, horse: { name: "H2", running_style: "差し", speed: 50, stamina: 50, power: 50, burst: 50, guts: 50, wisdom: 50 }, jockey_name: "J2" }
];
try {
  const result = sim.simulate({ distance: 2000, field_condition: "良", course_feature: "平坦", weather: "晴" }, horses);
  console.log("Success! stages:", result.stages.length);
} catch (e) {
  console.error("Error:", e);
}
