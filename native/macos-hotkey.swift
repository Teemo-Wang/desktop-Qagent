import AppKit
import CoreGraphics
import Foundation

struct HelperConfiguration {
    let keyCode: UInt16
    let modifierMask: UInt

    static func fromArguments() -> HelperConfiguration? {
        let arguments = CommandLine.arguments
        guard
            let keyIndex = arguments.firstIndex(of: "--key-code"),
            let modifierIndex = arguments.firstIndex(of: "--modifier-mask"),
            keyIndex + 1 < arguments.count,
            modifierIndex + 1 < arguments.count,
            let keyCode = UInt16(arguments[keyIndex + 1]),
            let modifierMask = UInt(arguments[modifierIndex + 1])
        else {
            return nil
        }

        return HelperConfiguration(keyCode: keyCode, modifierMask: modifierMask)
    }
}

func emit(_ message: String) {
    FileHandle.standardOutput.write(Data("\(message)\n".utf8))
}

guard let configuration = HelperConfiguration.fromArguments() else {
    fputs("Usage: cursorlens-hotkey --key-code <code> --modifier-mask <mask>\n", stderr)
    exit(2)
}

if #available(macOS 10.15, *) {
    if !CGPreflightListenEventAccess() {
        emit("PERMISSION_REQUIRED")
        _ = CGRequestListenEventAccess()
    } else {
        emit("PERMISSION_OK")
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)

let relevantModifiers: NSEvent.ModifierFlags = [.command, .option, .control, .shift]
let requiredModifiers = NSEvent.ModifierFlags(rawValue: configuration.modifierMask)
var isDown = false

func handle(_ event: NSEvent) {
    guard event.keyCode == configuration.keyCode else { return }

    if event.type == .keyDown {
        let currentModifiers = event.modifierFlags.intersection(relevantModifiers)
        let hasRequiredModifiers = currentModifiers.intersection(requiredModifiers) == requiredModifiers
        guard hasRequiredModifiers, !isDown else { return }
        isDown = true
        emit("DOWN")
    } else if event.type == .keyUp, isDown {
        isDown = false
        emit("UP")
    }
}

let globalMonitor = NSEvent.addGlobalMonitorForEvents(
    matching: [.keyDown, .keyUp],
    handler: handle
)

let localMonitor = NSEvent.addLocalMonitorForEvents(
    matching: [.keyDown, .keyUp]
) { event in
    handle(event)
    return event
}

guard globalMonitor != nil, localMonitor != nil else {
    emit("MONITOR_FAILED")
    exit(3)
}

emit("READY")
app.run()
