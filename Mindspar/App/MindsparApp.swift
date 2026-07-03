import SwiftUI
import FirebaseCore

@main
struct MindsparApp: App {
    @StateObject private var model: AppModel

    init() {
        // Firebase switches on only when GoogleService-Info.plist is present;
        // otherwise the whole app runs on the offline LocalBackend (bots only).
        let backend: Backend
        if Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist") != nil {
            FirebaseApp.configure()
            backend = FirebaseBackend()
        } else {
            backend = LocalBackend()
        }
        _model = StateObject(wrappedValue: AppModel(backend: backend))
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(model)
                .preferredColorScheme(.light)
                .task { await model.restore() }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        Group {
            if model.isRestoring {
                ZStack {
                    Theme.porcelain.ignoresSafeArea()
                    Text("Mindspar")
                        .font(.system(size: 34, weight: .semibold, design: .serif))
                        .foregroundStyle(Theme.ink)
                }
            } else if model.profile == nil {
                AuthView()
            } else {
                MainTabView()
            }
        }
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            HomeView()
                .tabItem { Label("Play", systemImage: "bolt.fill") }
            ProfileView()
                .tabItem { Label("Profile", systemImage: "person.crop.circle") }
        }
        .tint(Theme.iris)
    }
}
