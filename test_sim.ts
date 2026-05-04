import { RaceSimulator } from './src/core/race_simulator';
const sim = new RaceSimulator();
const horses = [
  { horse_number: 1, horse_name: "H1", running_style: "逃げ", speed: 50, stamina: 50, power: 50, burst: 50, guts: 50, wisdom: 50 },
  { horse_number: 2, horse_name: "H2", running_style: "差し", speed: 50, stamina: 50, power: 50, burst: 50, guts: 50, wisdom: 50 }
];
try {
  const result = sim.simulate(horses, 2000, "ハイペース", "良", "平坦", "晴");
  console.log("Success! stages:", result.stages.length);
} catch (e) {
  console.error("Error:", e);
}
