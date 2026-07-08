import Foundation

// MARK: - Domains

enum Domain: String, Codable, CaseIterable, Identifiable {
    case reasoning, math, verbal, knowledge, science, patterns, history, geography

    var id: String { rawValue }

    var title: String {
        switch self {
        case .reasoning: return "Reasoning"
        case .math: return "Math"
        case .verbal: return "Verbal"
        case .knowledge: return "Knowledge"
        case .science: return "Science"
        case .patterns: return "Patterns"
        case .history: return "History"
        case .geography: return "Geography"
        }
    }

    var symbol: String {
        switch self {
        case .reasoning: return "puzzlepiece.extension.fill"
        case .math: return "function"
        case .verbal: return "text.book.closed.fill"
        case .knowledge: return "graduationcap.fill"
        case .science: return "atom"
        case .patterns: return "circle.hexagongrid.fill"
        case .history: return "building.columns.fill"
        case .geography: return "globe.americas.fill"
        }
    }
}

// MARK: - Questions

struct Question: Codable, Identifiable, Hashable {
    let id: String
    let domain: Domain
    let prompt: String
    let options: [String]
    let correctIndex: Int
    /// 1 = warm-up, 2 = standard, 3 = demanding. Decks are drawn toward the
    /// player's rating band, so questions get harder as they climb.
    var difficulty: Int = 2
    /// Seconds allowed for this question.
    var timeLimit: Double = 18
}

// MARK: - Players & profiles

struct UserProfile: Codable, Identifiable, Equatable {
    var id: String
    var username: String
    var email: String
    var dateOfBirth: Date
    var createdAt: Date = Date()
    var stats = PlayerStats()
    /// Question ID → when it was last served, so decks avoid repeats.
    var seenQuestions: [String: Date] = [:]
    /// Question ID → how many times it has ever been served to this user.
    var serveCounts: [String: Int] = [:]

    var ageGroup: AgeGroup { AgeGroup(dateOfBirth: dateOfBirth) }

    /// IDs decks should draw around: anything seen inside the freshness
    /// window ("weekly recycling"), plus anything already served the maximum
    /// number of times — a question never repeats for a user more than
    /// `maxServes` times while alternatives exist.
    func excludedQuestionIDs(freshDays: Int = 7, maxServes: Int = 3) -> Set<String> {
        let cutoff = Date().addingTimeInterval(-Double(freshDays) * 86400)
        let recent = seenQuestions.filter { $0.value > cutoff }.keys
        let exhausted = serveCounts.filter { $0.value >= maxServes }.keys
        return Set(recent).union(exhausted)
    }
}

enum AgeGroup: String, Codable, CaseIterable {
    case g18to24 = "18–24"
    case g25to34 = "25–34"
    case g35to44 = "35–44"
    case g45to54 = "45–54"
    case g55plus = "55+"

    init(dateOfBirth: Date) {
        let years = Calendar.current.dateComponents([.year], from: dateOfBirth, to: Date()).year ?? 18
        switch years {
        case ..<25: self = .g18to24
        case 25..<35: self = .g25to34
        case 35..<45: self = .g35to44
        case 45..<55: self = .g45to54
        default: self = .g55plus
        }
    }
}

struct PlayerStats: Codable, Equatable {
    /// Elo skill rating — drives matchmaking bands and the level tier.
    var rating = Elo.initial
    var matchesPlayed = 0
    var matchesWon = 0
    var currentStreak = 0
    var bestStreak = 0
    /// Per-domain running tallies.
    var domainAnswered: [Domain: Int] = [:]
    var domainCorrect: [Domain: Int] = [:]
    /// Running mean of per-answer speed factor (0–1, higher = faster correct answers).
    var speedFactorSum: Double = 0
    var speedFactorCount: Int = 0

    var winRate: Double { matchesPlayed == 0 ? 0 : Double(matchesWon) / Double(matchesPlayed) }

    func accuracy(in domain: Domain) -> Double? {
        guard let answered = domainAnswered[domain], answered > 0 else { return nil }
        return Double(domainCorrect[domain] ?? 0) / Double(answered)
    }

    var overallAccuracy: Double? {
        let answered = domainAnswered.values.reduce(0, +)
        guard answered > 0 else { return nil }
        return Double(domainCorrect.values.reduce(0, +)) / Double(answered)
    }

    var meanSpeedFactor: Double { speedFactorCount == 0 ? 0.5 : speedFactorSum / Double(speedFactorCount) }
}

// MARK: - Matches

struct PlayerAnswer: Codable, Equatable {
    let questionIndex: Int
    let selectedIndex: Int?      // nil = timed out
    let correct: Bool
    let timeMs: Int
    let score: Int
}

enum MatchOutcome {
    case win, loss, draw
}

/// A duel in progress or finished. For bot matches this lives in memory;
/// for human matches it mirrors a Firestore document.
struct Match: Identifiable {
    let id: String
    let questions: [Question]
    let opponent: Opponent
    /// Elo of the opponent when the match started — needed to settle ratings.
    let opponentRating: Int
    var myAnswers: [PlayerAnswer] = []
    var opponentAnswers: [PlayerAnswer] = []

    var myScore: Int { myAnswers.reduce(0) { $0 + $1.score } }
    var opponentScore: Int { opponentAnswers.reduce(0) { $0 + $1.score } }

    var outcome: MatchOutcome {
        if myScore > opponentScore { return .win }
        if myScore < opponentScore { return .loss }
        return .draw
    }
}

enum Opponent {
    case bot(BotProfile)
    case human(id: String, username: String)

    var displayName: String {
        switch self {
        case .bot(let bot): return bot.name
        case .human(_, let username): return username
        }
    }

    var isBot: Bool {
        if case .bot = self { return true }
        return false
    }
}

// MARK: - Bots

/// Simulated opponents with domain skill profiles. No LLM, no network:
/// accuracy is a per-domain probability, answer time is sampled from a
/// per-bot range. Indistinguishable in gameplay, free forever.
struct BotProfile: Identifiable, Equatable {
    let id: String
    let name: String
    let tagline: String
    let symbol: String
    /// Calibrated Elo, so bot duels move the player's rating honestly.
    let rating: Int
    /// 0–1 chance of answering correctly, per domain.
    let accuracy: [Domain: Double]
    /// Answer-time range in seconds.
    let minTime: Double
    let maxTime: Double

    func accuracy(in domain: Domain) -> Double { accuracy[domain] ?? 0.6 }
}

// MARK: - Rating & difficulty ladder

/// Standard Elo. Every duel — bot or human — settles rating, which drives
/// matchmaking bands, the level tier, and deck difficulty.
enum Elo {
    static let initial = 1000
    static let kFactor = 32.0

    static func update(myRating: Int, opponentRating: Int, outcome: MatchOutcome) -> Int {
        let expected = 1 / (1 + pow(10, Double(opponentRating - myRating) / 400))
        let actual: Double = outcome == .win ? 1 : (outcome == .draw ? 0.5 : 0)
        return myRating + Int((kFactor * (actual - expected)).rounded())
    }

    static func tier(for rating: Int) -> String {
        switch rating {
        case ..<900: return "Novice"
        case ..<1050: return "Adept"
        case ..<1200: return "Scholar"
        case ..<1350: return "Sage"
        default: return "Luminary"
        }
    }
}

enum DifficultyLadder {
    /// The deck's target difficulty (1–3 scale) for a given rating.
    static func target(forRating rating: Int) -> Double {
        switch rating {
        case ..<950: return 1.5
        case ..<1150: return 2.0
        case ..<1300: return 2.4
        default: return 2.8
        }
    }
}

// MARK: - Scoring

enum Scoring {
    static let questionsPerMatch = 10
    static let basePoints = 100
    static let maxSpeedBonus = 50

    /// Correct answers earn base points plus a bonus that decays linearly
    /// with elapsed time. Wrong or timed-out answers earn nothing.
    static func score(correct: Bool, timeMs: Int, timeLimit: Double) -> Int {
        guard correct else { return 0 }
        let remaining = max(0, 1 - (Double(timeMs) / 1000) / timeLimit)
        return basePoints + Int((Double(maxSpeedBonus) * remaining).rounded())
    }

    /// 0–1 "how fast was this correct answer" factor used in the IQ model.
    static func speedFactor(timeMs: Int, timeLimit: Double) -> Double {
        max(0, min(1, 1 - (Double(timeMs) / 1000) / timeLimit))
    }
}
