import SwiftUI
import AppKit

// Minimal NSColor shim so the shared UI code (authored for iOS using
// `Color(.systemGray4)` etc.) compiles unchanged on macOS. The macOS system
// palette only exposes `.systemGray`, so tinted variants are derived by
// blending with the window background.

extension NSColor {
    static var systemGray3: NSColor { blendedGray(fraction: 0.35) }
    static var systemGray4: NSColor { blendedGray(fraction: 0.50) }
    static var systemGray5: NSColor { blendedGray(fraction: 0.70) }
    static var systemGray6: NSColor { blendedGray(fraction: 0.85) }
    static var systemBackground: NSColor { .windowBackgroundColor }
    static var label: NSColor { .labelColor }

    private static func blendedGray(fraction: CGFloat) -> NSColor {
        NSColor.systemGray.blended(withFraction: fraction, of: .windowBackgroundColor)
            ?? NSColor.systemGray
    }
}
