import AppKit
import Foundation
import WebKit

private final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var serverProcess: Process?
    private var logHandle: FileHandle?
    private var isQuitting = false

    // Bevorzugt ein fester Port: WKWebsiteDataStore partitioniert nach
    // Origin (Schema+Host+Port). Ein bei jedem Start neu ausgewürfelter
    // Port bedeutet eine neue Origin bei jedem Start - localStorage (und
    // damit das Anmelde-Token) wäre dadurch nie über einen Neustart hinweg
    // gültig, obwohl websiteDataStore als .default() persistent konfiguriert
    // ist. Nur falls der bevorzugte Port belegt ist, wird einmalig auf
    // einen zufälligen Port aus dem dynamischen/privaten Bereich
    // ausgewichen (dann bewusst ohne Sitzungserhalt für diesen einen Start
    // - besser als ein komplett fehlschlagender Start).
    private static let preferredPort = 51847
    private static let logMaxBytes: UInt64 = 5 * 1024 * 1024

    private var port = AppDelegate.preferredPort
    private var didAttemptFallbackPort = false
    private var hasHandedOffToWebView = false

    // Pro Start neu erzeugt und dem Kindprozess als Umgebungsvariable
    // mitgegeben; /api/health spiegelt es zurück. Ohne diesen Abgleich
    // würde eine beliebige 200-Antwort auf dem gewählten Port (z. B. von
    // einem völlig anderen, zufällig denselben Port belegenden Prozess)
    // fälschlich als "eigener Server gestartet" durchgehen.
    private let instanceToken = UUID().uuidString

    private var appSupportDirectory: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Personal Dashboard", isDirectory: true)
    }

    private var serverURL: URL {
        URL(string: "http://127.0.0.1:\(port)")!
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        configureMenu()
        configureWindow()
        launchServerAndWait()
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    func applicationWillTerminate(_ notification: Notification) {
        isQuitting = true
        stopServer()
    }

    func windowWillClose(_ notification: Notification) {
        NSApp.terminate(nil)
    }

    private func configureWindow() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.preferences.setValue(true, forKey: "developerExtrasEnabled")

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = self
        webView.uiDelegate = self

        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Personal Dashboard"
        window.titlebarAppearsTransparent = true
        window.titleVisibility = .hidden
        window.minSize = NSSize(width: 1080, height: 700)
        window.contentView = webView
        window.delegate = self
        window.center()
        window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(webView)

        let loading = """
        <!doctype html><html><head><meta charset="utf-8"><style>
        :root{color-scheme:dark}body{margin:0;background:#071f19;color:#f4f0df;font:500 15px -apple-system,BlinkMacSystemFont,sans-serif;display:grid;place-items:center;height:100vh}
        main{text-align:center}.mark{width:44px;height:44px;margin:0 auto 18px;border:1px solid #a8ff5a;border-radius:13px;display:grid;place-items:center;color:#a8ff5a;font-size:23px}.hint{opacity:.62;font-size:13px;margin-top:7px}
        </style></head><body><main><div class="mark">◆</div><div>Dashboard wird gestartet …</div><div class="hint">Deine Daten bleiben auf diesem Mac.</div></main></body></html>
        """
        webView.loadHTMLString(loading, baseURL: nil)
    }

    private func configureMenu() {
        let mainMenu = NSMenu()

        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu()
        appMenu.addItem(withTitle: "Über Personal Dashboard", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(.separator())
        appMenu.addItem(withTitle: "Personal Dashboard beenden", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenuItem.submenu = appMenu

        let editMenuItem = NSMenuItem()
        mainMenu.addItem(editMenuItem)
        let editMenu = NSMenu(title: "Bearbeiten")
        editMenu.addItem(withTitle: "Widerrufen", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Wiederholen", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Ausschneiden", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Kopieren", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Einsetzen", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Alles auswählen", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editMenuItem.submenu = editMenu

        let viewMenuItem = NSMenuItem()
        mainMenu.addItem(viewMenuItem)
        let viewMenu = NSMenu(title: "Darstellung")
        let reload = NSMenuItem(title: "Neu laden", action: #selector(reloadDashboard), keyEquivalent: "r")
        reload.target = self
        viewMenu.addItem(reload)
        viewMenu.addItem(.separator())
        let zoomIn = NSMenuItem(title: "Vergrößern", action: #selector(zoomIn), keyEquivalent: "=")
        zoomIn.target = self
        viewMenu.addItem(zoomIn)
        let zoomOut = NSMenuItem(title: "Verkleinern", action: #selector(zoomOut), keyEquivalent: "-")
        zoomOut.target = self
        viewMenu.addItem(zoomOut)
        let zoomReset = NSMenuItem(title: "Originalgröße", action: #selector(zoomReset), keyEquivalent: "0")
        zoomReset.target = self
        viewMenu.addItem(zoomReset)
        viewMenu.addItem(.separator())
        viewMenu.addItem(withTitle: "Vollbild ein/aus", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f").keyEquivalentModifierMask = [.command, .control]
        viewMenuItem.submenu = viewMenu

        NSApp.mainMenu = mainMenu
    }

    @objc private func reloadDashboard() {
        webView.reload()
    }

    @objc private func zoomIn() {
        webView.pageZoom = min(webView.pageZoom + 0.1, 3.0)
    }

    @objc private func zoomOut() {
        webView.pageZoom = max(webView.pageZoom - 0.1, 0.5)
    }

    @objc private func zoomReset() {
        webView.pageZoom = 1.0
    }

    private func launchServerAndWait() {
        do {
            try startServer()
            waitForServer(attempt: 0)
        } catch {
            showFatalError("Der lokale Dashboard-Server konnte nicht gestartet werden.\n\n\(error.localizedDescription)")
        }
    }

    private func startServer() throws {
        let fileManager = FileManager.default
        try fileManager.createDirectory(at: appSupportDirectory, withIntermediateDirectories: true)

        guard let resources = Bundle.main.resourceURL else {
            throw NSError(domain: "PersonalDashboard", code: 1, userInfo: [NSLocalizedDescriptionKey: "App-Ressourcen fehlen."])
        }

        let nodeURL = resources.appendingPathComponent("node")
        let serverRoot = resources.appendingPathComponent("server", isDirectory: true)
        let entryPoint = serverRoot.appendingPathComponent("backend/src/index.js")

        guard fileManager.isExecutableFile(atPath: nodeURL.path), fileManager.fileExists(atPath: entryPoint.path) else {
            throw NSError(domain: "PersonalDashboard", code: 2, userInfo: [NSLocalizedDescriptionKey: "Die eingebettete Server-Laufzeit ist unvollständig."])
        }

        let logURL = appSupportDirectory.appendingPathComponent("dashboard.log")
        // Unbegrenztes Wachstum vermeiden (Punkt 50): wird die Grenze
        // überschritten, wird bei diesem Start neu begonnen statt für
        // immer angehängt. Das begrenzt das Wachstum pro Start-Zyklus,
        // nicht innerhalb einer einzelnen, sehr lange laufenden Sitzung -
        // für den erwarteten Gebrauch (App wird zwischendurch beendet/
        // neugestartet, nicht wochenlang durchgehend offen gehalten)
        // ausreichend, ohne die Komplexität einer echten Log-Rotation.
        if let attrs = try? fileManager.attributesOfItem(atPath: logURL.path),
           let size = attrs[.size] as? UInt64,
           size > Self.logMaxBytes {
            try? fileManager.removeItem(at: logURL)
        }
        if !fileManager.fileExists(atPath: logURL.path) {
            fileManager.createFile(atPath: logURL.path, contents: nil)
        }
        let handle = try FileHandle(forWritingTo: logURL)
        try handle.seekToEnd()
        logHandle = handle

        let process = Process()
        process.executableURL = nodeURL
        process.arguments = [entryPoint.path]
        process.currentDirectoryURL = serverRoot
        process.standardOutput = handle
        process.standardError = handle

        var environment = ProcessInfo.processInfo.environment
        environment["NODE_ENV"] = "production"
        environment["HOST"] = "127.0.0.1"
        environment["PORT"] = String(port)
        environment["DASHBOARD_DATA_DIR"] = appSupportDirectory.path
        environment["DISABLE_HTTPS_UPGRADE"] = "1"
        environment["DASHBOARD_INSTANCE_TOKEN"] = instanceToken
        environment["PATH"] = "/usr/bin:/bin:/usr/sbin:/sbin"
        process.environment = environment
        process.terminationHandler = { [weak self] process in
            DispatchQueue.main.async {
                self?.handleServerExit(process: process)
            }
        }

        try process.run()
        serverProcess = process
    }

    private func handleServerExit(process: Process) {
        guard !isQuitting else { return }

        if !hasHandedOffToWebView && !didAttemptFallbackPort {
            // Der bevorzugte, feste Port war vermutlich bereits belegt
            // (Portkollision, Punkt 47) - einmalig mit einem zufälligen
            // Port aus dem dynamischen/privaten Bereich neu versuchen,
            // statt sofort mit einer Fehlermeldung aufzugeben. In diesem
            // Ausweichfall bleibt die Sitzung für diesen einen Start nicht
            // erhalten (siehe Kommentar bei preferredPort oben) - seltener,
            // akzeptabler Kompromiss gegenüber einem harten Fehlschlag.
            didAttemptFallbackPort = true
            port = Int.random(in: 49152...59999)
            launchServerAndWait()
            return
        }

        // Auch ein "sauberer" Exit-Code 0 zählt hier als unerwartet: er
        // bedeutet, dass der Serverprozess verschwunden ist, ohne dass wir
        // (isQuitting) das veranlasst haben - der WebView zeigt dann eine
        // tote Verbindung, ohne dass die Nutzerin einen Grund dafür sieht,
        // wenn Exit-Code 0 hier stillschweigend ignoriert würde (Punkt 50).
        showFatalError("Der lokale Dashboard-Server wurde unerwartet beendet (Exit-Code \(process.terminationStatus)). Details stehen in:\n\(appSupportDirectory.appendingPathComponent("dashboard.log").path)")
    }

    private func waitForServer(attempt: Int) {
        guard attempt < 100 else {
            showFatalError("Der lokale Dashboard-Server antwortet nicht. Details stehen in:\n\(appSupportDirectory.appendingPathComponent("dashboard.log").path)")
            return
        }

        let healthURL = serverURL.appendingPathComponent("api/health")
        var request = URLRequest(url: healthURL)
        request.timeoutInterval = 1
        let expectedToken = instanceToken
        URLSession.shared.dataTask(with: request) { [weak self] data, response, _ in
            guard let self else { return }
            var matchesOwnInstance = false
            if let http = response as? HTTPURLResponse, http.statusCode == 200, let data {
                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let token = json["instanceToken"] as? String {
                    matchesOwnInstance = token == expectedToken
                }
            }
            if matchesOwnInstance {
                self.hasHandedOffToWebView = true
                DispatchQueue.main.async { self.webView.load(URLRequest(url: self.serverURL)) }
            } else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    self.waitForServer(attempt: attempt + 1)
                }
            }
        }.resume()
    }

    private func stopServer() {
        guard let process = serverProcess, process.isRunning else {
            try? logHandle?.close()
            return
        }
        process.terminate()
        DispatchQueue.global().asyncAfter(deadline: .now() + 2) {
            if process.isRunning { kill(process.processIdentifier, SIGKILL) }
        }
        try? logHandle?.close()
    }

    private func showFatalError(_ message: String) {
        let alert = NSAlert()
        alert.alertStyle = .critical
        alert.messageText = "Personal Dashboard konnte nicht geöffnet werden"
        alert.informativeText = message
        alert.addButton(withTitle: "Beenden")
        alert.runModal()
        NSApp.terminate(nil)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        if navigationAction.shouldPerformDownload {
            decisionHandler(.download)
            return
        }
        // Vollständige Origin (Schema + Host + Port) prüfen, nicht nur den
        // Host (Punkt 49) - sonst würde z. B. http://127.0.0.1:ANDERER-PORT
        // oder https://127.0.0.1:PORT ebenfalls durchgehen, obwohl es nicht
        // der eigene, gerade gestartete Server ist.
        let isOwnOrigin = url.scheme == "http" && url.host == "127.0.0.1" && (url.port ?? 80) == port
        if isOwnOrigin {
            decisionHandler(.allow)
        } else if url.scheme == "http" || url.scheme == "https" {
            NSWorkspace.shared.open(url)
            decisionHandler(.cancel)
        } else {
            // Alle anderen Schemata (file:, data:, javascript:, beliebige
            // dritte URL-Schemata, …) werden weder im WebView geladen noch
            // an den Standardbrowser weitergegeben - "zusätzliche
            // URL-Schemata nur explizit" (Punkt 49), nicht stillschweigend
            // erlaubt, weil sie schlicht keinen Host haben.
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        let navigationError = error as NSError
        if navigationError.domain == NSURLErrorDomain && navigationError.code == NSURLErrorCancelled {
            return
        }

        let escaped = error.localizedDescription
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
        webView.loadHTMLString("""
        <!doctype html><html><head><meta charset="utf-8"><style>
        body{margin:0;background:#071f19;color:#f4f0df;font:500 15px -apple-system,sans-serif;display:grid;place-items:center;height:100vh}main{max-width:560px;text-align:center;padding:40px}h1{font-size:19px}.error{opacity:.72;line-height:1.5}
        </style></head><body><main><h1>Dashboard konnte nicht geladen werden</h1><div class="error">\(escaped)</div></main></body></html>
        """, baseURL: nil)
    }

    // MARK: - WKUIDelegate: JavaScript alert/confirm/prompt

    // Ohne diese drei Methoden funktionieren window.alert()/confirm()/
    // prompt() aus dem Web-Inhalt trotz gesetztem uiDelegate NICHT (Punkt
    // 51: "nicht voraussetzen, dass JS-confirm ohne Delegateimplementierung
    // funktioniert") - insbesondere die im Frontend neu ergänzten
    // Löschbestätigungen (window.confirm) würden ohne dies im nativen
    // WebView lautlos immer "abgebrochen" zurückgeben.

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.beginSheetModal(for: window) { _ in completionHandler() }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Abbrechen")
        alert.beginSheetModal(for: window) { response in
            completionHandler(response == .alertFirstButtonReturn)
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = NSAlert()
        alert.messageText = prompt
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Abbrechen")
        let input = NSTextField(frame: NSRect(x: 0, y: 0, width: 260, height: 24))
        input.stringValue = defaultText ?? ""
        alert.accessoryView = input
        alert.beginSheetModal(for: window) { response in
            completionHandler(response == .alertFirstButtonReturn ? input.stringValue : nil)
        }
    }

    // MARK: - WKDownloadDelegate

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        DispatchQueue.main.async {
            let panel = NSSavePanel()
            panel.nameFieldStringValue = suggestedFilename
            panel.canCreateDirectories = true
            panel.beginSheetModal(for: self.window) { result in
                completionHandler(result == .OK ? panel.url : nil)
            }
        }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        // Ohne diese Methode scheitert ein Download (volle Festplatte,
        // fehlende Berechtigung, Netzwerkfehler) bisher lautlos - die
        // Nutzerin sieht nirgends, dass und warum es nicht geklappt hat
        // (Punkt 51: "Downloadfehler").
        DispatchQueue.main.async {
            let alert = NSAlert()
            alert.alertStyle = .warning
            alert.messageText = "Download fehlgeschlagen"
            alert.informativeText = error.localizedDescription
            alert.addButton(withTitle: "OK")
            alert.beginSheetModal(for: self.window, completionHandler: nil)
        }
    }
}

@main
private enum PersonalDashboardApp {
    static func main() {
        let application = NSApplication.shared
        let delegate = AppDelegate()
        application.delegate = delegate
        application.run()
    }
}
