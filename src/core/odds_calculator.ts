import {
  APTITUDE_MULTIPLIERS,
  CONDITION_MODIFIERS,
  DISTANCE_CATEGORIES,
} from './constants';

export interface HorseData {
  horse_number: number;
  speed: number;
  stamina: number;
  power: number;
  burst: number;
  guts: number;
  wisdom: number;
  distance_apt: Record<string, string>;
  field_apt: Record<string, string>;
  condition: string;
  rating?: number;
  total_races?: number;
  wins?: number;
  score?: number;
  initial_odds_win?: number;
  odds_win?: number;
  odds_place?: number;
  popularity?: number;
  [key: string]: any;
}

export interface Bet {
  id: string;
  playerId?: string;
  playerName?: string;
  bet_type: string;
  horse_numbers: number[];
  amount: number;
}

export class OddsCalculator {
  calculateCompositeScore(
    horse: HorseData,
    raceDistance: number,
    fieldCondition: string,
    courseFeature: string
  ): number {
    const baseScore =
      horse.speed * 0.30 +
      horse.stamina * 0.20 +
      horse.power * 0.15 +
      horse.burst * 0.20 +
      horse.guts * 0.10 +
      horse.wisdom * 0.05;

    const distCategory = this._getDistanceCategory(raceDistance);
    const distRank = horse.distance_apt[distCategory] || "C";
    const distMult = APTITUDE_MULTIPLIERS[distRank] || 1.0;

    const fieldRank = horse.field_apt[fieldCondition] || "C";
    const fieldMult = APTITUDE_MULTIPLIERS[fieldRank] || 1.0;

    const condMult = CONDITION_MODIFIERS[horse.condition] || 1.0;

    const totalScore = baseScore * distMult * fieldMult * condMult;

    return Math.max(1.0, totalScore);
  }

  private _getDistanceCategory(distance: number): string {
    for (const [cat, [minD, maxD]] of Object.entries(DISTANCE_CATEGORIES)) {
      if (distance >= minD && distance <= maxD) {
        return cat;
      }
    }
    if (distance < 1000) return "短距離";
    return "長距離";
  }

  calculateInitialOdds(horsesData: HorseData[], isRealOdds: boolean = false): HorseData[] {
    const scores = horsesData.map(hd => hd.score || 50.0);
    const totalScore = scores.reduce((sum, score) => sum + score, 0);

    const multiplier = isRealOdds ? 0.8 : 1.2;

    horsesData.forEach((hd, i) => {
      let oddsWin = 99.9;
      if (scores[i] > 0) {
        oddsWin = (totalScore / scores[i]) * multiplier;
      }
      hd.odds_win = Math.max(1.1, Math.round(oddsWin * 10) / 10);
      hd.initial_odds_win = hd.odds_win;
      hd.odds_place = Math.max(1.0, Math.round(hd.odds_win * (isRealOdds ? 0.3 : 0.5) * 10) / 10);
    });

    const sorted = [...horsesData].sort((a, b) => (a.odds_win || 99.9) - (b.odds_win || 99.9));
    sorted.forEach((hd, rank) => {
      const original = horsesData.find(h => h.horse_number === hd.horse_number);
      if (original) original.popularity = rank + 1;
    });

    return horsesData;
  }

  updateOddsWithBets(horsesData: HorseData[], bets: Bet[]): HorseData[] {
    const totalBetAmount = bets
      .filter(b => b.bet_type === "単勝")
      .reduce((sum, b) => sum + b.amount, 0);

    if (totalBetAmount === 0) return horsesData;

    const horseBetAmounts: Record<number, number> = {};
    bets.forEach(bet => {
      if (bet.bet_type === "単勝") {
        bet.horse_numbers.forEach(num => {
          horseBetAmounts[num] = (horseBetAmounts[num] || 0) + bet.amount;
        });
      }
    });

    horsesData.forEach(hd => {
      const horseNum = hd.horse_number;
      const betAmount = horseBetAmounts[horseNum] || 0;

      if (totalBetAmount > 0) {
        const betRatio = betAmount / totalBetAmount;
        const initialOdds = hd.initial_odds_win || hd.odds_win || 99.9;
        const newOdds = initialOdds * (1 - betRatio * 0.5);
        hd.odds_win = Math.max(1.1, Math.round(newOdds * 10) / 10);
        hd.odds_place = Math.max(1.0, Math.round(hd.odds_win * 0.5 * 10) / 10);
      }
    });

    const sorted = [...horsesData].sort((a, b) => (a.odds_win || 99.9) - (b.odds_win || 99.9));
    sorted.forEach((hd, rank) => {
      const original = horsesData.find(h => h.horse_number === hd.horse_number);
      if (original) original.popularity = rank + 1;
    });

    return horsesData;
  }

  calculatePayoutOdds(betType: string, horseNumbers: number[], horsesData: HorseData[]): number {
    const oddsMap: Record<number, number> = {};
    const placeOddsMap: Record<number, number> = {};

    horsesData.forEach(hd => {
      oddsMap[hd.horse_number] = hd.odds_win || 5.0;
      placeOddsMap[hd.horse_number] = hd.odds_place || 1.0;
    });

    const o1 = oddsMap[horseNumbers[0]] || 5.0;
    const o2 = oddsMap[horseNumbers[1]] || 5.0;

    if (betType === "単勝") return oddsMap[horseNumbers[0]] || 1.1;
    if (betType === "複勝") return placeOddsMap[horseNumbers[0]] || 1.0;
    if (betType === "馬連") return Math.max(1.5, Math.round(o1 * o2 * 0.18 * 10) / 10);
    if (betType === "ワイド") return Math.max(1.1, Math.round((o1 + o2) * 0.38 * 10) / 10);
    if (betType === "馬単") return Math.max(2.0, Math.round(o1 * o2 * 0.32 * 10) / 10);
    if (betType === "3連複") {
      const o3 = oddsMap[horseNumbers[2]] || 5.0;
      return Math.max(3.0, Math.round(o1 * o2 * o3 * 0.03 * 10) / 10);
    }
    if (betType === "3連単") {
      const o3 = oddsMap[horseNumbers[2]] || 5.0;
      return Math.max(5.0, Math.round(o1 * o2 * o3 * 0.09 * 10) / 10);
    }

    return 1.1;
  }
}

export const oddsCalculator = new OddsCalculator();
