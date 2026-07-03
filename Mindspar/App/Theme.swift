import SwiftUI

/// Mindspar design language: porcelain light surfaces, deep ink typography,
/// a single iris accent, and a dark "arena" only during live duels so the
/// question is the brightest thing on screen.
enum Theme {
    static let porcelain = Color(red: 0.968, green: 0.968, blue: 0.976)
    static let card = Color.white
    static let ink = Color(red: 0.078, green: 0.086, blue: 0.122)
    static let inkSecondary = Color(red: 0.42, green: 0.44, blue: 0.50)
    static let iris = Color(red: 0.33, green: 0.34, blue: 0.91)
    static let irisSoft = Color(red: 0.33, green: 0.34, blue: 0.91).opacity(0.10)

    // The duel arena is the one dark space in the app.
    static let arena = Color(red: 0.078, green: 0.086, blue: 0.122)
    static let arenaCard = Color(red: 0.125, green: 0.137, blue: 0.184)

    static let correct = Color(red: 0.13, green: 0.69, blue: 0.42)
    static let wrong = Color(red: 0.86, green: 0.27, blue: 0.28)

    static func domainColor(_ domain: Domain) -> Color {
        switch domain {
        case .reasoning: return Color(red: 0.33, green: 0.34, blue: 0.91)
        case .math: return Color(red: 0.06, green: 0.52, blue: 0.83)
        case .verbal: return Color(red: 0.80, green: 0.34, blue: 0.14)
        case .knowledge: return Color(red: 0.55, green: 0.36, blue: 0.83)
        case .science: return Color(red: 0.13, green: 0.62, blue: 0.47)
        case .patterns: return Color(red: 0.77, green: 0.55, blue: 0.11)
        }
    }
}
