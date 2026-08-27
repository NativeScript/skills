import SwiftUI

// Brand mark rendered in the Live Activity / Dynamic Island and Home Screen widget.
// logo.png lives in Sources/SharedWidget/Resources/ (1024x1024 master asset).
@available(iOS 13.0, macOS 10.15, *)
public struct BrandLogo: View {
    let height: CGFloat
    public init(height: CGFloat) { self.height = height }

    public var body: some View {
        Image("logo", bundle: .module)
            .resizable()
            .scaledToFit()
            .frame(height: height)
    }
}
