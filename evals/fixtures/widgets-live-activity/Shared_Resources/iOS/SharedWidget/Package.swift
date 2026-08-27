// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "SharedWidget",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "SharedWidget", targets: ["SharedWidget"])
    ],
    targets: [
        .target(
            name: "SharedWidget",
            resources: [.process("Resources")]
        )
    ]
)
