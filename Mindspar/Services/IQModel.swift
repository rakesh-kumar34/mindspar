import Foundation

/// Mindspar Score: an IQ-style number derived from relative performance,
/// normalized within the player's age group.
///
/// IMPORTANT: this is an entertainment estimate, not a clinical assessment,
/// and the UI must always say so. The math: a skill index blends accuracy
/// (70%) with answer speed (30%); it's converted to a z-score against an
/// age-group reference distribution and mapped onto the familiar
/// mean-100 / SD-15 scale. Once there's a real player base, the reference
/// distributions should be replaced with live percentiles per age group.
enum IQModel {
    /// Answers required before a score is shown at all.
    static let minimumAnswers = 16

    private static func reference(for group: AgeGroup) -> (mean: Double, sd: Double) {
        switch group {
        case .g18to24: return (0.63, 0.14)
        case .g25to34: return (0.64, 0.14)
        case .g35to44: return (0.62, 0.14)
        case .g45to54: return (0.60, 0.14)
        case .g55plus: return (0.58, 0.14)
        }
    }

    static func skillIndex(for stats: PlayerStats) -> Double? {
        guard let accuracy = stats.overallAccuracy else { return nil }
        return accuracy * 0.7 + stats.meanSpeedFactor * 0.3
    }

    /// nil while still calibrating (< minimumAnswers).
    static func score(for stats: PlayerStats, ageGroup: AgeGroup) -> Int? {
        let answered = stats.domainAnswered.values.reduce(0, +)
        guard answered >= minimumAnswers, let index = skillIndex(for: stats) else { return nil }
        let ref = reference(for: ageGroup)
        let z = (index - ref.mean) / ref.sd
        return Int((100 + 15 * z).rounded().clamped(to: 70...145))
    }

    /// How far through calibration the player is, 0–1.
    static func calibrationProgress(for stats: PlayerStats) -> Double {
        let answered = stats.domainAnswered.values.reduce(0, +)
        return min(1, Double(answered) / Double(minimumAnswers))
    }

    /// Fold one finished match into the player's running stats.
    static func absorb(match: Match, into stats: inout PlayerStats) {
        stats.rating = Elo.update(myRating: stats.rating,
                                  opponentRating: match.opponentRating,
                                  outcome: match.outcome)
        stats.matchesPlayed += 1
        if match.outcome == .win {
            stats.matchesWon += 1
            stats.currentStreak += 1
            stats.bestStreak = max(stats.bestStreak, stats.currentStreak)
        } else if match.outcome == .loss {
            stats.currentStreak = 0
        }
        for answer in match.myAnswers {
            let domain = match.questions[answer.questionIndex].domain
            stats.domainAnswered[domain, default: 0] += 1
            if answer.correct {
                stats.domainCorrect[domain, default: 0] += 1
                stats.speedFactorSum += Scoring.speedFactor(
                    timeMs: answer.timeMs,
                    timeLimit: match.questions[answer.questionIndex].timeLimit)
                stats.speedFactorCount += 1
            }
        }
    }
}

extension Double {
    func clamped(to range: ClosedRange<Double>) -> Double {
        Swift.min(range.upperBound, Swift.max(range.lowerBound, self))
    }
}
