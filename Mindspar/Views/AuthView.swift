import SwiftUI

struct AuthView: View {
    @EnvironmentObject private var model: AppModel

    @State private var isSignUp = true
    @State private var email = ""
    @State private var password = ""
    @State private var username = ""
    @State private var dateOfBirth = Calendar.current.date(byAdding: .year, value: -25, to: Date()) ?? Date()
    @State private var confirmedAdult = false
    @State private var errorMessage: String?
    @State private var isBusy = false

    private var isAdult: Bool { AgeCheck.isAdult(dateOfBirth) }

    private var canSubmit: Bool {
        guard !email.isEmpty, password.count >= 6 else { return false }
        if isSignUp {
            return !username.trimmingCharacters(in: .whitespaces).isEmpty && isAdult && confirmedAdult
        }
        return true
    }

    var body: some View {
        ZStack {
            Theme.porcelain.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 22) {
                    header

                    VStack(spacing: 12) {
                        if isSignUp {
                            field("Username", text: $username)
                                .textInputAutocapitalization(.never)
                        }
                        field("Email", text: $email)
                            .keyboardType(.emailAddress)
                            .textInputAutocapitalization(.never)
                        secureField("Password (6+ characters)", text: $password)

                        if isSignUp {
                            dobSection
                        }
                    }

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(Theme.wrong)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Button(action: submit) {
                        Group {
                            if isBusy {
                                ProgressView().tint(.white)
                            } else {
                                Text(isSignUp ? "Create Account" : "Sign In")
                                    .font(.body.weight(.semibold))
                            }
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 15)
                        .background(RoundedRectangle(cornerRadius: 14).fill(Theme.iris))
                        .opacity(canSubmit ? 1 : 0.4)
                    }
                    .disabled(!canSubmit || isBusy)

                    Button {
                        withAnimation { isSignUp.toggle(); errorMessage = nil }
                    } label: {
                        Text(isSignUp ? "Already have an account? **Sign in**" : "New here? **Create an account**")
                            .font(.subheadline)
                            .foregroundStyle(Theme.inkSecondary)
                    }

                    if !model.backend.isLive {
                        Label("Running offline — your profile stays on this device. Add Firebase later for online play.", systemImage: "wifi.slash")
                            .font(.caption)
                            .foregroundStyle(Theme.inkSecondary)
                            .padding(.top, 4)
                    }
                }
                .padding(24)
            }
        }
    }

    private var header: some View {
        VStack(spacing: 8) {
            Text("Mindspar")
                .font(.system(size: 40, weight: .semibold, design: .serif))
                .foregroundStyle(Theme.ink)
            Text("Head-to-head thinking duels.\nReasoning · Math · Verbal · Knowledge · Science · Patterns")
                .font(.footnote)
                .multilineTextAlignment(.center)
                .foregroundStyle(Theme.inkSecondary)
        }
        .padding(.top, 40)
        .padding(.bottom, 8)
    }

    private var dobSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            DatePicker("Date of birth", selection: $dateOfBirth,
                       in: ...Date(), displayedComponents: .date)
                .font(.subheadline)
            if !isAdult {
                Text("Mindspar is for adults 18 and over.")
                    .font(.caption)
                    .foregroundStyle(Theme.wrong)
            }
            Toggle(isOn: $confirmedAdult) {
                Text("I confirm I am 18 years or older")
                    .font(.subheadline)
            }
            .tint(Theme.iris)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 14).fill(Theme.card))
    }

    private func field(_ placeholder: String, text: Binding<String>) -> some View {
        TextField(placeholder, text: text)
            .autocorrectionDisabled()
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 14).fill(Theme.card))
    }

    private func secureField(_ placeholder: String, text: Binding<String>) -> some View {
        SecureField(placeholder, text: text)
            .padding(14)
            .background(RoundedRectangle(cornerRadius: 14).fill(Theme.card))
    }

    private func submit() {
        errorMessage = nil
        isBusy = true
        Task {
            defer { isBusy = false }
            do {
                if isSignUp {
                    try await model.signUp(email: email, password: password,
                                           username: username.trimmingCharacters(in: .whitespaces),
                                           dateOfBirth: dateOfBirth)
                } else {
                    try await model.signIn(email: email, password: password)
                }
            } catch {
                errorMessage = error.localizedDescription
            }
        }
    }
}
